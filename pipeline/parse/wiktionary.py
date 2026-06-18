"""Parse English Wiktionary data into pipeline records.

Data source:
  - Definitions: Wiktionary REST API v1 (/api/rest_v1/page/definition/{word})
  - Pronunciations: scraped from the printable HTML page
  The combined dict is produced by fetch_wiktionary() and matches the
  fixture at pipeline/tests/fixtures/wiktionary_dog.json.

Fixture shape (top-level keys):
  {
    "definitions": [
      {
        "partOfSpeech": str,        # e.g. "Noun", "Verb"
        "language": str,            # "English"
        "definitions": [
          {
            "definition": str,      # HTML; empty string = placeholder, skip
            "parsedExamples"?: [...],
            "examples"?: [str]
          }
        ]
      }
    ],
    "pronunciations": [
      {
        "text": str,                # e.g. "(Received Pronunciation) IPA: /dɒɡ/"
        "ipa": [str],               # e.g. ["/dɒɡ/"] — already bracketed strings
        "audio": [str]              # list of .ogg URLs
      }
    ]
  }
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from pipeline.config import settings
from pipeline.models.records import EntryRec, PronunciationRec, RelationRec, SenseRec

_SOURCE = "wiktionary-en"
_USER_AGENT = "chesen-pipeline/1.0 (contact phuchiep.nguyenthe@adamosoft.com)"
_REST_URL = "https://en.wiktionary.org/api/rest_v1/page/definition/{word}"
_HTML_URL = "https://en.wiktionary.org/wiki/{word}?printable=yes"

# IPA markers: /.../ or [...]
_IPA_RE = re.compile(r"[/\[]([^/\[\]]+)[/\]]")


def _strip_html(html: str) -> str:
    """Return plain text from an HTML fragment, stripping tags."""
    return BeautifulSoup(html, "html.parser").get_text().strip()


def _extract_ipa(raw: str) -> str:
    """Return the IPA string including its delimiters, or the whole string."""
    m = _IPA_RE.search(raw)
    if m:
        delim_open = raw[m.start()]
        delim_close = "/" if delim_open == "/" else "]"
        return f"{delim_open}{m.group(1)}{delim_close}"
    return raw


def _accent_from_text(text: str) -> str:
    """Heuristically map pronunciation label text to an accent tag."""
    t = text.lower()
    if "received pronunciation" in t or " uk" in t or "british" in t:
        return "en-UK"
    if "general american" in t or " us" in t or "american" in t:
        return "en-US"
    if "canada" in t or "canadian" in t:
        return "en-CA"
    if "australia" in t or "australian" in t:
        return "en-AU"
    return "en"


def _fetch_definitions(headword: str, session: requests.Session) -> list[dict]:
    url = _REST_URL.format(word=headword)
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    data: dict = resp.json()
    return data.get("en", [])


def _scrape_pronunciations(headword: str, session: requests.Session) -> list[dict]:
    url = _HTML_URL.format(word=headword)
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    eng_div: BeautifulSoup | None = None
    for div in soup.find_all("div", {"class": "mw-heading2"}):
        h2 = div.find("h2")
        if h2 and h2.get("id") == "English":
            eng_div = div
            break
    if eng_div is None:
        return []

    pronunciations: list[dict] = []
    sib = eng_div.find_next_sibling()
    in_pron = False
    while sib:
        if sib.name == "div" and "mw-heading2" in sib.get("class", []):
            break
        if sib.name == "div" and "mw-heading3" in sib.get("class", []):
            in_pron = "Pronunciation" in sib.get_text()
        elif in_pron and sib.name == "ul":
            for li in sib.find_all("li", recursive=False):
                ipa_spans = li.find_all("span", {"class": lambda c: c and "IPA" in c})
                ipa_texts = [sp.get_text() for sp in ipa_spans]
                audio_srcs: list[str] = []
                for src_tag in li.find_all("source"):
                    src = src_tag.get("src", "")
                    if src and ".ogg" in src and "transcoded" not in src:
                        audio_srcs.append(("https:" + src) if src.startswith("//") else src)
                li_clone = BeautifulSoup(str(li), "html.parser")
                for tag in li_clone.find_all(["div", "table", "ul", "sup"]):
                    tag.decompose()
                li_text = li_clone.get_text().strip()
                if ipa_texts or li_text:
                    pronunciations.append({"text": li_text, "ipa": ipa_texts, "audio": audio_srcs})
            in_pron = False
        sib = sib.find_next_sibling()

    return pronunciations


def fetch_wiktionary(headword: str) -> dict:
    """Read-through cache; returns the combined fixture dict.

    Cache path: settings.CACHE_DIR / "wiktionary" / "{headword}.json"
    On miss: fetches from Wiktionary REST API + HTML, writes JSON, returns it.
    """
    cache_dir = settings.CACHE_DIR / "wiktionary"
    cache_path = cache_dir / f"{headword}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    session = requests.Session()
    session.headers["User-Agent"] = _USER_AGENT

    definitions = _fetch_definitions(headword, session)
    pronunciations = _scrape_pronunciations(headword, session)
    result: dict = {"definitions": definitions, "pronunciations": pronunciations}

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def parse_wiktionary(headword: str, raw: dict) -> EntryRec:
    """Map a combined Wiktionary fetch dict to an EntryRec.

    Args:
        headword: The word (e.g. "dog").
        raw: The dict produced by fetch_wiktionary() (or loaded from the fixture).

    Returns:
        An EntryRec populated with senses, pronunciations, and relations.
    """
    entry_id = f"en:{headword}"

    senses: list[SenseRec] = []
    relations: list[RelationRec] = []
    n = 0  # sense counter, 1-based across the whole entry

    for pos_group in raw.get("definitions", []):
        pos = pos_group.get("partOfSpeech", "").lower()
        for def_item in pos_group.get("definitions", []):
            html = def_item.get("definition", "")
            if not html:
                continue  # skip blank placeholders
            gloss = _strip_html(html)
            if not gloss:
                continue
            n += 1
            senses.append(
                SenseRec(
                    id=f"{entry_id}#{n}",
                    entry_id=entry_id,
                    pos=pos or None,
                    sense_order=n,
                    gloss_en=gloss,
                    source_id=_SOURCE,
                )
            )

    pronunciations: list[PronunciationRec] = []
    for pron_item in raw.get("pronunciations", []):
        text = pron_item.get("text", "")
        ipa_list: list[str] = pron_item.get("ipa", [])
        audio_list: list[str] = pron_item.get("audio", [])
        accent = _accent_from_text(text)
        # Pair each IPA with an audio URL where available
        for idx, raw_ipa in enumerate(ipa_list):
            ipa = _extract_ipa(raw_ipa)
            audio_url = audio_list[idx] if idx < len(audio_list) else None
            pronunciations.append(
                PronunciationRec(
                    entry_id=entry_id,
                    accent=accent,
                    ipa=ipa,
                    audio_url=audio_url,
                    source_id=_SOURCE,
                )
            )

    return EntryRec(
        id=entry_id,
        lang="en",
        entry_type="word",
        headword=headword,
        headword_normalized=headword.lower(),
        source_id=_SOURCE,
        senses=senses,
        pronunciations=pronunciations,
        relations=relations,
    )
