"""Tests for pipeline.enrich.wikidata — images (P18) + cross-language links.

Fixture: pipeline/tests/fixtures/wikidata_dog.json
  qid: Q144
  P18 filename: Greenland 467 (35130903436) (cropped).jpg
  es label: perro
  zh label: 犬
"""
from __future__ import annotations

import json
from pathlib import Path

from pipeline.enrich.wikidata import cross_links_for, image_for

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "wikidata_dog.json"


def _fixture() -> dict:
    return json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))


def test_image_for_dog() -> None:
    img = image_for("dog", _fixture())
    assert img is not None
    assert "commons.wikimedia.org" in img.url or "upload.wikimedia.org" in img.url
    assert img.source_id == "wikimedia-commons"
    assert img.sense_id == ""


def test_cross_links_for_dog() -> None:
    links = cross_links_for("dog", _fixture())
    langs = {link.to_entry_id.split(":")[0] for link in links if link.to_entry_id}
    assert "es" in langs or "zh" in langs
    assert all(
        link.from_entry_id == "en:dog" and link.source_id == "wikidata-lexemes"
        for link in links
    )


def test_absent_data_safe() -> None:
    empty: dict = {"qid": "Q0", "entity": {"claims": {}, "labels": {}}}
    assert image_for("x", empty) is None
    assert cross_links_for("x", empty) == []
