"""Chinese entry builder — task 3c.2.

Converts CC-CEDICT + Unihan data into EntryRec objects.
"""
from __future__ import annotations

import re
from functools import lru_cache

import wordfreq

from pipeline.acquire.cedict import load_cedict
from pipeline.acquire.unihan import fetch_unihan, parse_unihan
from pipeline.enrich.examples import fetch_tatoeba, parse_tatoeba
from pipeline.models.records import EntryRec, ExampleRec, PronunciationRec, SenseRec

# ---------------------------------------------------------------------------
# Tone-mark conversion (numbered pinyin to diacritic pinyin)
# ---------------------------------------------------------------------------

# vowel -> (tone1, tone2, tone3, tone4)
_DIACRITICS: dict[str, tuple[str, str, str, str]] = {
    "a": ("ā", "á", "ǎ", "à"),
    "e": ("ē", "é", "ě", "è"),
    "i": ("ī", "í", "ǐ", "ì"),
    "o": ("ō", "ó", "ǒ", "ò"),
    "u": ("ū", "ú", "ǔ", "ù"),
    "ü": ("ǖ", "ǘ", "ǚ", "ǜ"),
}

# CC-CEDICT uses v for u-umlaut
_NORMALISE = str.maketrans("v", "ü")

# CJK Unified Ideographs (main block + extension A/B)
_CJK_RE = re.compile(
    "^[一-鿿"
    "㐀-䶿"
    "\U00020000-\U0002a6df]+$"
)


def _syllable_to_diacritic(syllable: str) -> str:
    """Convert a single numbered syllable to diacritic form."""
    if not syllable:
        return syllable
    if syllable[-1].isdigit():
        tone = int(syllable[-1])
        body = syllable[:-1]
    else:
        return syllable
    body = body.translate(_NORMALISE)
    if tone in (0, 5):
        return body
    tone_idx = tone - 1
    for primary in ("a", "e"):
        if primary in body:
            return body.replace(primary, _DIACRITICS[primary][tone_idx], 1)
    if "ou" in body:
        return body.replace("o", _DIACRITICS["o"][tone_idx], 1)
    vowels = "aeiouü"
    for i in range(len(body) - 1, -1, -1):
        ch = body[i]
        if ch in vowels:
            return body[:i] + _DIACRITICS[ch][tone_idx] + body[i + 1:]
    return body


def numbered_to_diacritic(pinyin: str) -> str:
    """Convert CC-CEDICT numbered pinyin string to diacritic pinyin.

    Handles multi-syllable strings (space-separated syllables).

    Examples:
        numbered_to_diacritic("gou3")         -> "gou3" with tone 3 on o -> "gǒu"
        numbered_to_diacritic("ni3 hao3")     -> "nǐ hǎo"
        numbered_to_diacritic("zhong1 guo2")  -> "zhōng guó"
        numbered_to_diacritic("ma5")          -> "ma"
    """
    syllables = pinyin.split()
    return " ".join(_syllable_to_diacritic(s) for s in syllables)


# ---------------------------------------------------------------------------
# Module-level cached data (loaded once per process)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _cedict() -> dict[str, list[dict]]:
    return load_cedict()


@lru_cache(maxsize=1)
def _unihan() -> dict[str, dict]:
    zip_path = fetch_unihan()
    return parse_unihan(zip_path)


# ---------------------------------------------------------------------------
# Entry builder
# ---------------------------------------------------------------------------


def _build_char_info(char: str, position: int, uni: dict[str, dict]) -> dict:
    """Build per-character attribute dict from Unihan data."""
    data = uni.get(char, {})
    return {
        "char": char,
        "position": position,
        "radical": data.get("radical", ""),
        "stroke_count": data.get("stroke_count", 0),
        "pinyin": data.get("pinyin", []),
        "han_viet": data.get("han_viet", []),
        "cantonese": data.get("cantonese", []),
        "gloss": data.get("gloss", ""),
        "traditional_variant": data.get("traditional_variant"),
        "simplified_variant": data.get("simplified_variant"),
    }


def build_zh_entry(simplified: str) -> EntryRec:
    """Build a Chinese EntryRec from CC-CEDICT + Unihan data.

    Args:
        simplified: Simplified Chinese headword (e.g. "gou").

    Returns:
        EntryRec with pronunciations, senses, and per-character attributes.

    Raises:
        KeyError: If simplified is not found in CC-CEDICT.
    """
    cedict = _cedict()
    uni = _unihan()

    entries = cedict[simplified]
    first = entries[0]

    traditional = first["traditional"]
    cedict_pinyin: str = first["pinyin"]
    glosses: list[str] = first["glosses"]

    entry_id = f"zh:{simplified}"

    char_attrs: list[dict] = [
        _build_char_info(ch, pos, uni)
        for pos, ch in enumerate(simplified)
    ]

    entry = EntryRec(
        id=entry_id,
        lang="zh",
        entry_type="word",
        headword=simplified,
        headword_normalized=simplified,
        traditional=(traditional if traditional != simplified else None),
        source_id="cc-cedict",
        attributes={
            "pinyin": numbered_to_diacritic(cedict_pinyin),
            "characters": char_attrs,
        },
    )

    entry.pronunciations.append(
        PronunciationRec(
            entry_id=entry_id,
            accent="zh-pinyin",
            ipa=numbered_to_diacritic(cedict_pinyin),
            source_id="cc-cedict",
        )
    )

    for order, gloss in enumerate(glosses, start=1):
        entry.senses.append(
            SenseRec(
                id=f"{entry_id}:s{order}",
                entry_id=entry_id,
                sense_order=order,
                gloss_en=gloss,
                source_id="cc-cedict",
            )
        )

    # Fetch Mandarin→Vietnamese example sentences from Tatoeba.
    try:
        raw_examples = fetch_tatoeba(simplified, from_lang="cmn", to_lang="vie")
        zh_examples: list[ExampleRec] = parse_tatoeba(simplified, raw_examples)
        # Fix entry_id to match this zh entry (parse_tatoeba defaults to "en:…")
        for ex in zh_examples:
            ex.entry_id = entry_id
        entry.examples.extend(zh_examples[:5])
    except Exception:
        # Network errors are non-fatal; entry is still valid without examples.
        pass

    return entry


# ---------------------------------------------------------------------------
# Headword selector
# ---------------------------------------------------------------------------


def select_zh_headwords(limit: int) -> list[str]:
    """Return top-limit CJK headwords present in CC-CEDICT, by frequency.

    Pulls from wordfreq.top_n_list("zh", limit*5+50), filters to pure-CJK
    strings that exist in CC-CEDICT, de-dupes, preserves frequency order.
    """
    cedict = _cedict()
    candidates = wordfreq.top_n_list("zh", limit * 5 + 50)
    seen: set[str] = set()
    result: list[str] = []
    for word in candidates:
        if word in seen:
            continue
        if not _CJK_RE.match(word):
            continue
        if word not in cedict:
            continue
        seen.add(word)
        result.append(word)
        if len(result) >= limit:
            break
    return result
