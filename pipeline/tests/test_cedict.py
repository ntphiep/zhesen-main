from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.acquire.cedict import load_cedict, parse_cedict_line

FIXTURES = Path(__file__).parent / "fixtures"
SAMPLE = FIXTURES / "cedict_sample.txt"


# --- parse_cedict_line ---


def test_parse_comment_returns_none():
    assert parse_cedict_line("# This is a comment") is None


def test_parse_blank_returns_none():
    assert parse_cedict_line("") is None
    assert parse_cedict_line("\n") is None


def test_parse_bang_comment_returns_none():
    assert parse_cedict_line("#! version=1") is None


def test_parse_gou_simplified():
    line = "狗 狗 [gou3] /dog/CL:隻|只[zhi1],條|条[tiao2]/"
    result = parse_cedict_line(line)
    assert result is not None
    assert result["simplified"] == "狗"
    assert result["traditional"] == "狗"
    assert result["pinyin"] == "gou3"
    assert "dog" in result["glosses"]


def test_parse_gou_glosses_list():
    line = "狗 狗 [gou3] /dog/CL:隻|只[zhi1],條|条[tiao2]/"
    result = parse_cedict_line(line)
    assert result is not None
    assert isinstance(result["glosses"], list)
    assert len(result["glosses"]) >= 1


def test_parse_traditional_different_from_simplified():
    line = "貓 猫 [mao1] /cat (CL:隻|只[zhi1])/(dialect) to hide oneself/(loanword) (coll.) modem/"
    result = parse_cedict_line(line)
    assert result is not None
    assert result["traditional"] == "貓"
    assert result["simplified"] == "猫"
    assert result["pinyin"] == "mao1"
    assert any("cat" in g for g in result["glosses"])


def test_parse_multiple_glosses():
    line = "中 中 [zhong1] /within; among; in/middle; center/while (doing sth); during/(dialect) OK; all right/"
    result = parse_cedict_line(line)
    assert result is not None
    assert len(result["glosses"]) == 4


def test_parse_numeric_entry():
    line = "110 110 [yao1 yao1 ling2] /the emergency number for law enforcement in Mainland China and Taiwan/"
    result = parse_cedict_line(line)
    assert result is not None
    assert result["simplified"] == "110"
    assert result["pinyin"] == "yao1 yao1 ling2"


# --- load_cedict from fixture ---


def _load_fixture() -> dict[str, list[dict]]:
    """Load from the small sample fixture file."""
    import gzip
    import io
    import gzip as gz

    result: dict[str, list[dict]] = {}
    with open(SAMPLE, encoding="utf-8") as f:
        for line in f:
            from pipeline.acquire.cedict import parse_cedict_line as _parse
            entry = _parse(line)
            if entry is None:
                continue
            result.setdefault(entry["simplified"], []).append(entry)
    return result


def test_fixture_contains_gou():
    data = _load_fixture()
    assert "狗" in data


def test_fixture_gou_pinyin():
    data = _load_fixture()
    gou_entries = data["狗"]
    pinyins = [e["pinyin"] for e in gou_entries]
    assert any("gou3" in p for p in pinyins)


def test_fixture_gou_gloss_dog():
    data = _load_fixture()
    gou_entries = data["狗"]
    all_glosses = [g for e in gou_entries for g in e["glosses"]]
    assert any("dog" in g.lower() for g in all_glosses)


def test_fixture_multiple_readings_for_zhong():
    data = _load_fixture()
    assert "中" in data
    assert len(data["中"]) >= 2


def test_fixture_mao_traditional():
    data = _load_fixture()
    assert "猫" in data
    mao = data["猫"]
    assert any(e["traditional"] == "貓" for e in mao)


def test_fixture_no_comment_entries():
    data = _load_fixture()
    for simp, entries in data.items():
        for e in entries:
            assert "traditional" in e
            assert "simplified" in e
            assert "pinyin" in e
            assert "glosses" in e
