from __future__ import annotations
import pathlib
from pipeline.crawl.cambridge import parse_cambridge


def _html() -> str:
    fixture = pathlib.Path(__file__).parent / "fixtures" / "cambridge_dog.html"
    return fixture.read_text(encoding="utf-8")


def test_parse_cambridge_dog() -> None:
    out = parse_cambridge("dog", _html())
    assert any(p.ipa for p in out["pronunciations"])
    assert len(out["gloss_vi"]) >= 1
    assert all(
        p.tier == "personal" and p.source_id == "cambridge"
        for p in out["pronunciations"]
    )
    # level may be None for some words but should be a str when present
    assert out["level"] is None or isinstance(out["level"], str)


def test_parse_cambridge_dog_level() -> None:
    """CEFR level for 'dog' is A1."""
    out = parse_cambridge("dog", _html())
    assert out["level"] == "A1"


def test_parse_cambridge_dog_gloss_vi() -> None:
    """Should extract all 3 Vietnamese glosses."""
    out = parse_cambridge("dog", _html())
    # dog fixture has: con chó, cáo đực, theo ai nhằng nhẵng
    assert len(out["gloss_vi"]) == 3
    assert "con chó" in out["gloss_vi"]


def test_parse_cambridge_dog_examples() -> None:
    """Should extract at least one example sentence."""
    out = parse_cambridge("dog", _html())
    assert len(out["examples"]) >= 1
    assert all(
        e.tier == "personal" and e.source_id == "cambridge"
        for e in out["examples"]
    )


def test_parse_cambridge_dog_pronunciation_ipa() -> None:
    """IPA for 'dog' should contain 'doɡ'."""
    out = parse_cambridge("dog", _html())
    ipas = [p.ipa for p in out["pronunciations"] if p.ipa]
    assert any("doɡ" in ipa for ipa in ipas)
