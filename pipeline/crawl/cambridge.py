"""Cambridge English-Vietnamese dictionary crawler.

Extracts CEFR level, Vietnamese glosses, IPA pronunciation, and example
sentences from dictionary.cambridge.org/dictionary/english-vietnamese/<word>.

Real selectors verified against fixture cambridge_dog.html:
  - CEFR level:         span.cefr.dcefr (text, e.g. "A1")
  - IPA:                span.ipa.dipa  (inside .pron-info.dpron-info)
  - Vietnamese gloss:   span.trans.dtrans  (inside .def-block .def-body)
  - English examples:   span.eg.deg  (inside .examp.dexamp inside .def-block)
  - Audio:              audio > source[src]  (absent in this page; handled
                        gracefully when present)
"""
from __future__ import annotations

import pathlib
import re
import time

import requests
from bs4 import BeautifulSoup, Tag

from pipeline.config import settings
from pipeline.models.records import ExampleRec, PronunciationRec

_BASE = "https://dictionary.cambridge.org"
_DICT_PATH = "/dictionary/english-vietnamese/"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en,vi;q=0.9",
}


# ---------------------------------------------------------------------------
# Fetch / cache
# ---------------------------------------------------------------------------

def fetch_cambridge(headword: str) -> str:
    """Return HTML for *headword* from a read-through disk cache.

    Cache location: settings.CACHE_DIR / "cambridge" / "<headword>.html".
    On a cache miss the page is fetched from Cambridge with the browser
    User-Agent and cached before being returned.
    """
    cache_dir = settings.CACHE_DIR / "cambridge"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{headword}.html"

    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    url = f"{_BASE}{_DICT_PATH}{headword}"
    resp = requests.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text
    cache_file.write_text(html, encoding="utf-8")
    return html


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def _absolute_audio(src: str) -> str:
    """Make a Cambridge audio src absolute."""
    if src.startswith("http"):
        return src
    return _BASE + src


def parse_cambridge(headword: str, html: str) -> dict:  # noqa: ARG001
    """Parse a Cambridge English-Vietnamese page and return extracted data.

    Parameters
    ----------
    headword:
        The word being looked up (used to populate ``entry_id`` fields).
    html:
        Raw HTML of the Cambridge page (may come from fixture or live fetch).

    Returns
    -------
    dict with keys:
        ``"level"``         – ``str | None`` first CEFR badge, e.g. ``"A1"``.
        ``"gloss_vi"``      – ``list[str]`` de-duplicated Vietnamese glosses.
        ``"pronunciations"``– ``list[PronunciationRec]``.
        ``"examples"``      – ``list[ExampleRec]``.
    """
    soup = BeautifulSoup(html, "html.parser")

    # ------------------------------------------------------------------
    # CEFR level — first .cefr.dcefr badge on the page
    # ------------------------------------------------------------------
    level: str | None = None
    cefr_el = soup.select_one("span.cefr.dcefr")
    if cefr_el:
        text = cefr_el.get_text(strip=True)
        if re.match(r"^[AB][12]$", text):
            level = text

    # ------------------------------------------------------------------
    # Pronunciation
    # Actual DOM: one .pron-info.dpron-info per POS block when present.
    # Contains .ipa.dipa for the phoneme string.
    # Audio: audio > source[src]  (graceful — may be absent).
    # Cambridge E-V typically shows a single IPA (no UK/US split).
    # We emit accent="en-GB" for the single pronunciation found.
    # ------------------------------------------------------------------
    pronunciations: list[PronunciationRec] = []
    seen_ipa: set[str] = set()

    for pron_el in soup.select("span.pron-info.dpron-info"):
        ipa_el = pron_el.select_one("span.ipa.dipa")
        ipa_text = ipa_el.get_text(strip=True) if ipa_el else None

        audio_url: str | None = None
        audio_el = pron_el.select_one("audio source[src]")
        if audio_el:
            src = audio_el.get("src", "")
            if src:
                audio_url = _absolute_audio(str(src))

        # De-duplicate by IPA string
        key = ipa_text or ""
        if key in seen_ipa:
            continue
        seen_ipa.add(key)

        pronunciations.append(
            PronunciationRec(
                entry_id=headword,
                accent="en-GB",
                ipa=ipa_text,
                audio_url=audio_url,
                source_id="cambridge",
                tier="personal",
            )
        )

    # ------------------------------------------------------------------
    # Vietnamese glosses and examples
    # Structure: .def-block > .def-body > span.trans.dtrans
    #            .def-block > .def-body > .examp.dexamp > span.eg.deg
    # ------------------------------------------------------------------
    gloss_vi_seen: dict[str, None] = {}  # ordered set
    examples: list[ExampleRec] = []

    for def_block in soup.select("div.def-block.ddef_block"):
        def_body = def_block.select_one("div.def-body")
        if not isinstance(def_body, Tag):
            continue

        # Vietnamese translation for this sense
        trans_el = def_body.select_one("span.trans.dtrans")
        vi_text: str | None = None
        if trans_el:
            vi_text = trans_el.get_text(strip=True) or None
            if vi_text and vi_text not in gloss_vi_seen:
                gloss_vi_seen[vi_text] = None

        # Examples in this def-block
        for examp_el in def_body.select("div.examp.dexamp"):
            eg_el = examp_el.select_one("span.eg.deg")
            if not eg_el:
                continue
            eg_text = eg_el.get_text(strip=True)
            if not eg_text:
                continue

            # Example-level translation (Cambridge E-V rarely provides these,
            # but handle gracefully if present as a sibling .trans element)
            ex_trans_el = examp_el.select_one("span.trans")
            ex_vi: str | None = None
            if ex_trans_el:
                ex_vi = ex_trans_el.get_text(strip=True) or None

            examples.append(
                ExampleRec(
                    entry_id=headword,
                    text=eg_text,
                    translation_vi=ex_vi if ex_vi else vi_text,
                    source_id="cambridge",
                    tier="personal",
                )
            )

    return {
        "level": level,
        "gloss_vi": list(gloss_vi_seen),
        "pronunciations": pronunciations,
        "examples": examples,
    }
