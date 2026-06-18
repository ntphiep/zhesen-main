"""Wikidata enrichment: images (P18 → Wikimedia Commons) + cross-language links.

Real fixture shape confirmed from wikidata_dog.json (Q144, 2026-06-19):

  {
    "qid": "Q144",
    "entity": {
      "type": "item",
      "id": "Q144",
      "labels": {
        "en": {"language": "en", "value": "dog"},
        "es": {"language": "es", "value": "perro"},
        "zh": {"language": "zh", "value": "犬"},
        "zh-hans": {"language": "zh-hans", "value": "犬"},
        ...
      },
      "claims": {
        "P18": [
          {
            "mainsnak": {
              "snaktype": "value",
              "property": "P18",
              "datavalue": {
                "value": "Greenland 467 (35130903436) (cropped).jpg",
                "type": "string"
              }
            },
            ...
          }
        ],
        ...
      }
    }
  }

Commons image URL: https://commons.wikimedia.org/wiki/Special:FilePath/<urlencoded filename>
  Spaces in filename are encoded as %20 (or can use underscores — Commons accepts both;
  urllib.parse.quote with safe='()' handles it cleanly).
"""
from __future__ import annotations

import json
from typing import cast
from urllib.parse import quote

import requests

from pipeline.config import settings
from pipeline.models.records import CrossLinkRec, ImageRec

_SOURCE_IMAGE = "wikimedia-commons"
_SOURCE_LINKS = "wikidata-lexemes"
_COMMONS_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath/"
_API_URL = "https://www.wikidata.org/w/api.php"
_USER_AGENT = "chesen-langlearn/0.1 (personal study project)"
_CROSS_LANGS = ("es", "zh", "zh-hans")


# ---------------------------------------------------------------------------
# Parsers (work on a pre-fetched raw dict — no I/O, fully testable)
# ---------------------------------------------------------------------------


def image_for(headword: str, raw: dict) -> ImageRec | None:
    """Extract the first Wikimedia Commons image from a Wikidata entity dict.

    Reads raw["entity"]["claims"]["P18"]; returns None if absent or malformed.

    Args:
        headword: The English headword (unused in parsing but kept for symmetry).
        raw: The fixture/cache dict with keys "qid" and "entity".

    Returns:
        An ImageRec with sense_id="" (merge stage will attach it) or None.
    """
    try:
        p18_claims: list[dict] = raw["entity"]["claims"]["P18"]
        filename: str = p18_claims[0]["mainsnak"]["datavalue"]["value"]
    except (KeyError, IndexError, TypeError):
        return None

    if not isinstance(filename, str) or not filename:
        return None

    # Commons accepts underscores or %20; use quote with safe characters.
    encoded = quote(filename, safe="()!,")
    url = _COMMONS_BASE + encoded

    return ImageRec(
        sense_id="",
        url=url,
        source_id=_SOURCE_IMAGE,
        license="see Commons",
        tier="open",
    )


def cross_links_for(headword: str, raw: dict) -> list[CrossLinkRec]:
    """Extract cross-language translation links from a Wikidata entity dict.

    Reads raw["entity"]["labels"] for Spanish ("es") and Chinese ("zh", "zh-hans").
    For zh-hans, emits the link under lang key "zh" if "zh" itself is absent.

    Args:
        headword: The English headword used to build from_entry_id.
        raw: The fixture/cache dict with keys "qid" and "entity".

    Returns:
        A list of CrossLinkRec, one per language found; empty list if none.
    """
    labels: dict = raw.get("entity", {}).get("labels", {})
    qid: str | None = raw.get("qid")
    from_entry_id = f"en:{headword}"
    results: list[CrossLinkRec] = []

    # Collect es and zh; zh-hans is a fallback when zh itself is absent.
    seen_langs: set[str] = set()
    for lang in _CROSS_LANGS:
        label_obj = labels.get(lang)
        if not isinstance(label_obj, dict):
            continue
        value: str = label_obj.get("value", "")
        if not value:
            continue

        # Normalise zh-hans → zh for the to_entry_id lang prefix.
        emit_lang = "zh" if lang == "zh-hans" else lang
        if emit_lang in seen_langs:
            continue
        seen_langs.add(emit_lang)

        results.append(
            CrossLinkRec(
                from_entry_id=from_entry_id,
                to_entry_id=f"{emit_lang}:{value}",
                link_type="translation",
                concept_id=qid,
                source_id=_SOURCE_LINKS,
            )
        )

    return results


# ---------------------------------------------------------------------------
# Read-through cache + API fetch
# ---------------------------------------------------------------------------


def fetch_wikidata(headword: str) -> dict:
    """Return Wikidata entity data for a headword, using a local JSON cache.

    Cache path: settings.CACHE_DIR / "wikidata" / "{headword}.json"

    On a cache miss:
      1. Search Wikidata for the headword via wbsearchentities (English, item).
      2. If no result: return empty dict {"qid": None, "entity": {"claims": {}, "labels": {}}}.
      3. Fetch labels + claims via wbgetentities.
      4. Assemble {"qid": ..., "entity": ...}, cache, and return.

    One retry on request failure; raises on second failure.

    Args:
        headword: The English word to look up.

    Returns:
        The raw Wikidata dict (same shape as the fixture).
    """
    cache_dir = settings.CACHE_DIR / "wikidata"
    cache_path = cache_dir / f"{headword}.json"

    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    headers = {"User-Agent": _USER_AGENT}
    empty: dict = {"qid": None, "entity": {"claims": {}, "labels": {}}}

    # --- Step 1: resolve QID ---
    search_data = _get_with_retry(
        _API_URL,
        params={
            "action": "wbsearchentities",
            "search": headword,
            "language": "en",
            "format": "json",
            "type": "item",
            "limit": 1,
        },
        headers=headers,
    )
    results: list[dict] = search_data.get("search", [])
    if not results:
        _write_cache(cache_path, cache_dir, empty)
        return empty

    qid: str = results[0]["id"]

    # --- Step 2: fetch labels + claims ---
    entity_data = _get_with_retry(
        _API_URL,
        params={
            "action": "wbgetentities",
            "ids": qid,
            "props": "labels|claims",
            "format": "json",
        },
        headers=headers,
    )
    entity: dict = entity_data.get("entities", {}).get(qid, {})
    payload: dict = {"qid": qid, "entity": entity}
    _write_cache(cache_path, cache_dir, payload)
    return payload


def _get_with_retry(url: str, params: dict, headers: dict) -> dict:
    """GET with one retry on failure; raises on second failure."""
    for attempt in range(2):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            return cast(dict, resp.json())
        except requests.RequestException:
            if attempt == 1:
                raise
    raise AssertionError("unreachable")


def _write_cache(path: Path, cache_dir: Path, data: dict) -> None:
    """Write data as JSON to path, creating cache_dir if needed."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
