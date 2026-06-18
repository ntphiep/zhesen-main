from __future__ import annotations

import json
from pathlib import Path

from pipeline.parse.wiktionary import parse_wiktionary

_FIXTURE = Path(__file__).parent / "fixtures" / "wiktionary_dog.json"


def _fixture() -> dict:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


def test_parse_dog_entry() -> None:
    e = parse_wiktionary("dog", _fixture())
    assert e.id == "en:dog" and e.lang == "en" and e.headword == "dog"
    assert any(s.pos == "noun" and s.gloss_en for s in e.senses)
    assert e.senses[0].sense_order == 1
    assert any(p.ipa for p in e.pronunciations)
    assert all(s.source_id == "wiktionary-en" for s in e.senses)
    assert all(p.source_id == "wiktionary-en" for p in e.pronunciations)
