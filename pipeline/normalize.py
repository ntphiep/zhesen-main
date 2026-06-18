"""Normalization helpers for the merge stage of the data pipeline."""

from pipeline.models.records import SenseRec


# Mapping from raw POS tags (case-insensitive) to canonical forms
_POS_MAPPING: dict[str, str] = {
    "noun": "noun",
    "proper noun": "noun",
    "verb": "verb",
    "adjective": "adjective",
    "adj": "adjective",
    "adverb": "adverb",
    "adv": "adverb",
    "pronoun": "pronoun",
    "preposition": "preposition",
    "prep": "preposition",
    "conjunction": "conjunction",
    "conj": "conjunction",
    "interjection": "interjection",
    "exclamation": "interjection",
    "determiner": "determiner",
    "article": "determiner",
    "numeral": "numeral",
    "number": "numeral",
}


def normalize_pos(raw_pos: str | None) -> str | None:
    """
    Normalize a part-of-speech tag to the canonical set.

    Case-insensitive, trims whitespace. Unknown tags (including None, empty
    string, 'phrase', 'particle') return None.

    Args:
        raw_pos: Raw POS tag or None

    Returns:
        Canonical POS tag or None if unknown/invalid
    """
    if raw_pos is None:
        return None

    cleaned = raw_pos.strip().lower()

    if not cleaned:
        return None

    return _POS_MAPPING.get(cleaned, None)


def clean_ipa(s: str) -> str:
    """
    Strip surrounding IPA delimiters and whitespace.

    Removes surrounding /.../  or [...] delimiters and trims whitespace.

    Args:
        s: String potentially wrapped in IPA delimiters

    Returns:
        Cleaned IPA string without delimiters
    """
    return s.strip().strip("/[]").strip()


def normalize_accent(a: str) -> str:
    """
    Canonicalize accent codes (case-insensitive on input).

    Maps common variants to canonical forms:
    - en-gb/gb/uk/en-uk -> en-UK
    - us/en-us/ga -> en-US
    - en-ca/ca -> en-CA
    - es-es -> es-ES
    - es-419/es-la -> es-419
    - zh-pinyin -> zh-pinyin
    - bare en -> en

    Unknown input returns unchanged.

    Args:
        a: Accent code variant

    Returns:
        Canonical accent code or input if unknown
    """
    lower_a = a.lower()

    # en-UK variants
    if lower_a in ("en-gb", "gb", "uk", "en-uk"):
        return "en-UK"

    # en-US variants
    if lower_a in ("us", "en-us", "ga"):
        return "en-US"

    # en-CA variants
    if lower_a in ("en-ca", "ca"):
        return "en-CA"

    # es-ES
    if lower_a == "es-es":
        return "es-ES"

    # es-419 variants
    if lower_a in ("es-419", "es-la"):
        return "es-419"

    # zh-pinyin
    if lower_a == "zh-pinyin":
        return "zh-pinyin"

    # bare en
    if lower_a == "en":
        return "en"

    # Unknown: return unchanged
    return a


def dedup_senses(senses: list[SenseRec]) -> list[SenseRec]:
    """
    Remove duplicate senses based on (pos, gloss_en) pair.

    Keeps first occurrence of each unique (pos, gloss_en) pair, then renumbers
    sense_order from 1 and regenerates id as f"{entry_id}#{order}".

    Args:
        senses: List of SenseRec objects

    Returns:
        New list with duplicates removed and sense_order renumbered
    """
    seen: set[tuple[str | None, str | None]] = set()
    kept: list[SenseRec] = []

    for sense in senses:
        key = (sense.pos, sense.gloss_en)
        if key not in seen:
            seen.add(key)
            kept.append(sense)

    # Renumber and regenerate ids
    result: list[SenseRec] = []
    for idx, sense in enumerate(kept, start=1):
        new_sense = sense.model_copy(
            update={
                "sense_order": idx,
                "id": f"{sense.entry_id}#{idx}",
            }
        )
        result.append(new_sense)

    return result
