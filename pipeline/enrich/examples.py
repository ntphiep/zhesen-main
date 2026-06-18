"""Pull example sentences from Tatoeba (English + Vietnamese translation + audio).

API endpoint:
  https://tatoeba.org/en/api_v0/search?from=eng&to=vie&query={word}

Real fixture shape (confirmed from tatoeba_dog.json, 2026-06-19):
  {
    "paging": {...},
    "results": [
      {
        "id": int,
        "text": str,            # English sentence
        "lang": "eng",
        "audios": [             # audio for the English sentence
          {
            "id": int,
            "download_url": str,  # relative, e.g. "/en/audio/download/827950"
            "source": str,
            "author": str,
            ...
          }
        ],
        "translations": [       # list of lists (direct, then indirect translations)
          [                     # inner list = one group of translation objects
            {
              "id": int,
              "text": str,      # translated sentence
              "lang": str,      # e.g. "vie"
              "audios": [...],
              "isDirect": bool,
              ...
            }
          ],
          []                    # second sublist (indirect) — often empty
        ],
        ...
      }
    ]
  }

Audio URL construction:
  Full URL = "https://tatoeba.org" + download_url
  e.g. "https://tatoeba.org/en/audio/download/827950"
"""
from __future__ import annotations

import json

import requests

from pipeline.config import settings
from pipeline.models.records import ExampleRec

_SOURCE = "tatoeba"
_BASE_URL = "https://tatoeba.org"
_SEARCH_URL = _BASE_URL + "/en/api_v0/search?from=eng&to=vie&query={word}"
_USER_AGENT = "chesen-langlearn/0.1 (personal study project)"
_MAX_RESULTS = 5


def parse_tatoeba(headword: str, raw: dict) -> list[ExampleRec]:
    """Map a Tatoeba API response dict to a list of ExampleRec (capped at 5).

    Args:
        headword: The English headword (e.g. "dog").
        raw: The dict returned by the Tatoeba api_v0/search endpoint.

    Returns:
        A list of up to 5 ExampleRec records.
    """
    entry_id = f"en:{headword}"
    records: list[ExampleRec] = []

    for result in raw.get("results", [])[:_MAX_RESULTS]:
        text: str = result.get("text", "").strip()
        if not text:
            continue

        # Find the first Vietnamese translation across all sublists.
        translation_vi: str | None = None
        for sublist in result.get("translations", []):
            for trans_obj in sublist:
                if isinstance(trans_obj, dict) and trans_obj.get("lang") == "vie":
                    translation_vi = trans_obj.get("text") or None
                    break
            if translation_vi is not None:
                break

        # Build the English audio URL from the first audio entry.
        audio_url: str | None = None
        audios: list[dict] = result.get("audios", [])
        if audios and isinstance(audios[0], dict):
            dl: str = audios[0].get("download_url", "")
            if dl:
                audio_url = _BASE_URL + dl

        records.append(
            ExampleRec(
                entry_id=entry_id,
                text=text,
                translation_vi=translation_vi,
                audio_url=audio_url,
                source_id=_SOURCE,
                tier="open",
            )
        )

    return records


def fetch_tatoeba(headword: str) -> dict:
    """Read-through cache; fetches Tatoeba search results for a headword.

    Cache path: settings.CACHE_DIR / "tatoeba" / "{headword}.json"
    On miss: GETs the api_v0/search URL, raises on non-2xx, writes JSON cache,
    and returns the parsed dict.

    Args:
        headword: The English word to search for.

    Returns:
        The raw Tatoeba API response dict.
    """
    cache_dir = settings.CACHE_DIR / "tatoeba"
    cache_path = cache_dir / f"{headword}.json"

    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    url = _SEARCH_URL.format(word=headword)
    resp = requests.get(url, headers={"User-Agent": _USER_AGENT}, timeout=30)
    resp.raise_for_status()
    data: dict = resp.json()

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data
