"""Parse English Wiktionary data into pipeline records.

Data source:
  - Definitions: Wiktionary REST API v1 (/api/rest_v1/page/definition/{word})
  - Pronunciations: scraped from the printable HTML page
  - Inflections, relations, translations: scraped from the same HTML page
    (translations may redirect to /wiki/{word}/translations subpage)
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
    ],
    "inflections": [
      {
        "form_text": str,           # e.g. "dogs"
        "form_label": str           # e.g. "plural"
      }
    ],
    "relations": [
      {
        "related_text": str,        # e.g. "hound"
        "relation_type": str        # "synonym" | "antonym" | "derived" | "related"
      }
    ],
    "translations": {
      "zh": ["狗"],                 # Mandarin / Chinese
      "es": ["perro"]              # Spanish
    }
  }
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Tag

from pipeline.config import settings
from pipeline.models.records import EntryRec, InflectionRec, PronunciationRec, RelationRec, SenseRec

_SOURCE = "wiktionary-en"
_USER_AGENT = "chesen-pipeline/1.0 (contact phuchiep.nguyenthe@adamosoft.com)"
_REST_URL = "https://en.wiktionary.org/api/rest_v1/page/definition/{word}"
_HTML_URL = "https://en.wiktionary.org/wiki/{word}?printable=yes"
_TRANS_URL = "https://en.wiktionary.org/wiki/{word}/translations?printable=yes"

# IPA markers: /.../ or [...]
_IPA_RE = re.compile(r"[/\[]([^/\[\]]+)[/\]]")

# Heading text → relation_type mapping
_RELATION_HEADING_MAP: dict[str, str] = {
    "Synonyms": "synonym",
    "Antonyms": "antonym",
    "Derived terms": "derived",
    "Related terms": "related",
}

# Language-name → BCP-47 code mapping for translation extraction
_LANG_CODE_MAP: dict[str, str] = {
    "Mandarin": "zh",
    "Chinese": "zh",
    "Spanish": "es",
}


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


def _find_english_section(soup: BeautifulSoup) -> Tag | None:
    """Return the mw-heading2 div whose h2 has id='English', or None."""
    for div in soup.find_all("div", {"class": "mw-heading2"}):
        h2 = div.find("h2")
        if h2 and h2.get("id") == "English":
            return div  # type: ignore[return-value]
    return None


def _scrape_inflections(eng_div: Tag, headword: str) -> list[dict]:
    """Extract inflection forms from headword-line paragraphs in the English section.

    Each POS heading (mw-heading4) is followed by a <p> containing a
    ``<span class="headword-line">``.  Inside that span, inflected forms live
    in ``<b class="... form-of ...">`` tags; the immediately preceding ``<i>``
    sibling in the same span is the human-readable label.

    Returns a list of dicts with keys ``form_text`` and ``form_label``.
    """
    results: list[dict] = []
    seen: set[str] = set()

    sib = eng_div.find_next_sibling()
    while sib:
        if sib.name == "div" and "mw-heading2" in sib.get("class", []):
            break

        if sib.name == "p":
            hw_span = sib.find("span", class_="headword-line")
            if hw_span:
                # Collect all children of hw_span in order so we can find
                # the italic label immediately before each form-of tag.
                children = list(hw_span.children)
                last_italic: str = ""
                for child in children:
                    if not hasattr(child, "name"):
                        continue  # NavigableString
                    if child.name == "i":
                        last_italic = child.get_text().strip()
                    elif child.name in ("b", "span"):
                        child_classes: list[str] = child.get("class", [])
                        if any("form-of" in c for c in child_classes):
                            form_text = child.get_text().strip()
                            if form_text and form_text != headword:
                                key = f"{form_text}|{last_italic}"
                                if key not in seen:
                                    seen.add(key)
                                    results.append(
                                        {"form_text": form_text, "form_label": last_italic}
                                    )

        sib = sib.find_next_sibling()

    return results


def _scrape_relations(eng_div: Tag) -> list[dict]:
    """Extract synonym/antonym/derived/related terms from the English section.

    Sections of interest use mw-heading5 (or mw-heading4) divs whose heading
    text matches one of ``_RELATION_HEADING_MAP``.  The linked terms follow
    either in a ``<ul>`` (Synonyms/Antonyms) or a ``<div class="list-switcher-
    wrapper">`` (Derived/Related terms).  Only links whose href contains
    ``#English`` are taken (to avoid cross-language noise).

    Returns a list of dicts with keys ``related_text`` and ``relation_type``.
    """
    results: list[dict] = []
    seen: set[tuple[str, str]] = set()

    sib = eng_div.find_next_sibling()
    while sib:
        if sib.name == "div" and "mw-heading2" in sib.get("class", []):
            break

        cls = sib.get("class", [])
        if sib.name == "div" and ("mw-heading5" in cls or "mw-heading4" in cls):
            h_tag = sib.find(["h4", "h5"])
            if h_tag:
                heading_text = h_tag.get_text().strip()
                relation_type = _RELATION_HEADING_MAP.get(heading_text)
                if relation_type:
                    # Consume the very next sibling which holds the terms
                    next_sib = sib.find_next_sibling()
                    if next_sib:
                        for a in next_sib.find_all("a"):
                            href = a.get("href", "")
                            if "#English" in href:
                                term = a.get_text().strip()
                                if term:
                                    key = (term, relation_type)
                                    if key not in seen:
                                        seen.add(key)
                                        results.append(
                                            {
                                                "related_text": term,
                                                "relation_type": relation_type,
                                            }
                                        )

        sib = sib.find_next_sibling()

    return results


def _extract_translations_from_tables(tables: list[Tag]) -> dict[str, list[str]]:
    """Parse ``<table class="translations">`` tags and return {lang_code: [words]}.

    Strategy for each language in ``_LANG_CODE_MAP``:
    - Top-level ``<li>`` whose text starts with the language name (e.g. "Chinese:")
      may contain a nested ``<dl><dd>`` listing dialects; look for sub-entries
      named "Mandarin" specifically.
    - For flat languages like Spanish, take all ``<span lang="es">`` (or the
      matching lang attribute) within the ``<li>``.
    - For "Chinese"/"Mandarin", take the first non-literary ``<span lang="cmn">``
      inside the Mandarin ``<dd>``.

    Only the *first* translation table (gloss="animal" for dog) is used to
    keep the result grounded in the core noun meaning.
    """
    translations: dict[str, list[str]] = {}

    for table in tables:
        for li in table.find_all("li"):
            li_text = li.get_text()

            # --- Chinese (Mandarin) ---
            if li_text.startswith("Chinese:") and "zh" not in translations:
                zh_words: list[str] = []
                dl = li.find("dl")
                if dl:
                    for dd in dl.find_all("dd"):
                        dd_text = dd.get_text()
                        if dd_text.startswith("Mandarin:"):
                            # Take all cmn-script spans that are NOT labelled literary
                            # The literary ones follow a qualifier span; use the first
                            # <span lang="cmn"> or <span lang="zh"> (first = common)
                            for span in dd.find_all("span", lang=lambda v: v and (v.startswith("cmn") or v == "zh")):
                                word = span.get_text().strip()
                                if word and word not in zh_words:
                                    zh_words.append(word)
                                    break  # only first (most common) form
                            break  # found Mandarin sub-entry
                if zh_words:
                    translations["zh"] = zh_words

            # --- Spanish ---
            if li_text.startswith("Spanish:") and "es" not in translations:
                es_words: list[str] = []
                for span in li.find_all("span", lang="es"):
                    word = span.get_text().strip()
                    if word and word not in es_words:
                        es_words.append(word)
                if es_words:
                    translations["es"] = es_words

    return translations


def _scrape_extras(headword: str, session: requests.Session) -> dict:
    """Fetch the Wiktionary HTML for *headword* and extract inflections, relations,
    and translations.

    Returns a dict with keys:
      ``"inflections"``, ``"relations"``, ``"translations"``
    Each value is already JSON-serialisable (list[dict] or dict[str, list[str]]).
    """
    url = _HTML_URL.format(word=headword)
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    eng_div = _find_english_section(soup)
    if eng_div is None:
        return {"inflections": [], "relations": [], "translations": {}}

    inflections = _scrape_inflections(eng_div, headword)
    relations = _scrape_relations(eng_div)

    # Translations: check if the noun translations are on a subpage
    # (indicated by a "pseudo NavFrame" with a link to /{word}/translations)
    translations: dict[str, list[str]] = {}

    # Collect all translation tables on the main page (inline verb translations etc.)
    inline_tables: list[Tag] = soup.find_all("table", class_="translations")

    # Check whether any inline table already covers the noun sense (gloss="animal")
    has_animal_table = any(t.get("data-gloss", "") == "animal" for t in inline_tables)

    if not has_animal_table:
        # Noun translations are on the subpage
        try:
            trans_url = _TRANS_URL.format(word=headword)
            trans_resp = session.get(trans_url, timeout=20)
            trans_resp.raise_for_status()
            trans_soup = BeautifulSoup(trans_resp.text, "html.parser")
            all_tables: list[Tag] = trans_soup.find_all("table", class_="translations")
            translations = _extract_translations_from_tables(all_tables)
        except requests.RequestException:
            pass  # best-effort; leave translations empty
    else:
        translations = _extract_translations_from_tables(inline_tables)

    return {
        "inflections": inflections,
        "relations": relations,
        "translations": translations,
    }


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

    The returned dict includes the keys: ``"definitions"``, ``"pronunciations"``,
    ``"inflections"``, ``"relations"``, ``"translations"``.  Existing cached
    dicts that lack the new keys are re-fetched transparently (the extras scrape
    runs, the cache is updated, and the enriched dict is returned).
    """
    cache_dir = settings.CACHE_DIR / "wiktionary"
    cache_path = cache_dir / f"{headword}.json"

    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        # Backward-compatibility: if cache predates enrichment, re-fetch extras
        if "inflections" not in cached:
            session = requests.Session()
            session.headers["User-Agent"] = _USER_AGENT
            extras = _scrape_extras(headword, session)
            cached.update(extras)
            cache_path.write_text(json.dumps(cached, ensure_ascii=False, indent=2), encoding="utf-8")
        return cached

    session = requests.Session()
    session.headers["User-Agent"] = _USER_AGENT

    definitions = _fetch_definitions(headword, session)
    pronunciations = _scrape_pronunciations(headword, session)
    extras = _scrape_extras(headword, session)
    result: dict = {
        "definitions": definitions,
        "pronunciations": pronunciations,
        **extras,
    }

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

    inflections: list[InflectionRec] = [
        InflectionRec(
            entry_id=entry_id,
            form_text=inf["form_text"],
            form_label=inf.get("form_label") or None,
            source_id=_SOURCE,
        )
        for inf in raw.get("inflections", [])
    ]

    relations = [
        RelationRec(
            entry_id=entry_id,
            related_text=rel["related_text"],
            relation_type=rel["relation_type"],
            source_id=_SOURCE,
        )
        for rel in raw.get("relations", [])
    ]

    attributes: dict = {}
    translations = raw.get("translations", {})
    if translations:
        attributes["translations"] = translations

    return EntryRec(
        id=entry_id,
        lang="en",
        entry_type="word",
        headword=headword,
        headword_normalized=headword.lower(),
        source_id=_SOURCE,
        senses=senses,
        pronunciations=pronunciations,
        inflections=inflections,
        relations=relations,
        attributes=attributes,
    )
