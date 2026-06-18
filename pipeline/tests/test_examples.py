from __future__ import annotations

import json
from pathlib import Path

from pipeline.enrich.examples import parse_tatoeba

_FIXTURE = Path(__file__).parent / "fixtures" / "tatoeba_dog.json"


def _fixture() -> dict:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


def test_parse_real_fixture_shape() -> None:
    rows = parse_tatoeba("dog", _fixture())
    assert 1 <= len(rows) <= 5
    assert all(r.text and r.source_id == "tatoeba" and r.tier == "open" for r in rows)


def test_translation_vi_extracted() -> None:
    # Synthetic minimal raw exercising vie-translation extraction.
    # Real shape: translations is a list of lists; each inner list contains
    # translation objects with keys: id, text, lang, isDirect, audios, etc.
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [[{"id": 1, "text": "Con cho sua.", "lang": "vie", "audios": []}]],
        "audios": [],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].translation_vi == "Con cho sua."


def test_audio_url_built() -> None:
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [],
        "audios": [{"id": 827950, "download_url": "/en/audio/download/827950"}],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].audio_url == "https://tatoeba.org/en/audio/download/827950"


def test_entry_id_matches_headword() -> None:
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [],
        "audios": [],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].entry_id == "en:dog"


def test_capped_at_five() -> None:
    result_template = {
        "text": "The dog barks.",
        "translations": [],
        "audios": [],
    }
    raw = {"results": [result_template] * 10}
    rows = parse_tatoeba("dog", raw)
    assert len(rows) == 5
