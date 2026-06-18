from __future__ import annotations

import zipfile
import io
from pathlib import Path

import pytest

from pipeline.acquire.unihan import parse_unihan, _decode_codepoint, _parse_rs_unicode, radical_char, RADICAL_INDEX_TO_CHAR

FIXTURES = Path(__file__).parent / "fixtures" / "unihan_sample"


def _make_zip_from_fixtures() -> Path:
    """
    Build a minimal in-memory zip from the fixture tsv files.
    Returns a temporary zip path under the fixtures dir.
    """
    tmp = FIXTURES.parent / "unihan_test.zip"
    with zipfile.ZipFile(tmp, "w") as zf:
        for fname in ["Unihan_Readings.txt", "Unihan_IRGSources.txt", "Unihan_Variants.txt"]:
            fpath = FIXTURES / fname
            if fpath.exists():
                zf.write(fpath, fname)
    return tmp


# --- unit helpers ---


def test_decode_codepoint_gou():
    assert _decode_codepoint("U+72D7") == "狗"


def test_decode_codepoint_mao():
    assert _decode_codepoint("U+732B") == "猫"


def test_parse_rs_unicode_simple():
    radical, strokes = _parse_rs_unicode("94.5")
    assert radical == "94"
    assert strokes == 5


def test_parse_rs_unicode_multiple_values():
    # Takes first entry
    radical, strokes = _parse_rs_unicode("94.5 0.8")
    assert radical == "94"
    assert strokes == 5


def test_parse_rs_unicode_apostrophe_variant():
    # Simplified radical variant uses trailing apostrophe
    radical, strokes = _parse_rs_unicode("94'.5")
    assert radical == "94"
    assert strokes == 5


# --- parse_unihan from fixture zip ---


@pytest.fixture(scope="module")
def unihan_data() -> dict[str, dict]:
    zp = _make_zip_from_fixtures()
    data = parse_unihan(zp)
    zp.unlink(missing_ok=True)
    return data


def test_gou_present(unihan_data: dict) -> None:
    assert "狗" in unihan_data


def test_gou_han_viet(unihan_data: dict) -> None:
    gou = unihan_data["狗"]
    assert "cẩu" in gou["han_viet"]


def test_gou_radical(unihan_data: dict) -> None:
    # radical is now the Kangxi radical CHARACTER, not the index string
    gou = unihan_data["狗"]
    assert gou["radical"] == "犬"


def test_gou_radical_index(unihan_data: dict) -> None:
    gou = unihan_data["狗"]
    assert gou["radical_index"] == 94


def test_gou_stroke_count(unihan_data: dict) -> None:
    # stroke_count now comes from kTotalStrokes (total strokes), not kRSUnicode additional strokes
    gou = unihan_data["狗"]
    assert gou["stroke_count"] == 8


def test_gou_pinyin_contains_gou(unihan_data: dict) -> None:
    gou = unihan_data["狗"]
    assert any("gǒu" in p for p in gou["pinyin"])


def test_gou_cantonese(unihan_data: dict) -> None:
    gou = unihan_data["狗"]
    assert "gau2" in gou["cantonese"]


def test_gou_gloss(unihan_data: dict) -> None:
    gou = unihan_data["狗"]
    assert "dog" in gou["gloss"].lower()


def test_entry_structure(unihan_data: dict) -> None:
    for char, entry in unihan_data.items():
        assert "radical" in entry
        assert "radical_index" in entry
        assert "stroke_count" in entry
        assert "pinyin" in entry
        assert "cantonese" in entry
        assert "han_viet" in entry
        assert "gloss" in entry
        assert "simplified_variant" in entry
        assert "traditional_variant" in entry
        assert isinstance(entry["pinyin"], list)
        assert isinstance(entry["cantonese"], list)
        assert isinstance(entry["han_viet"], list)


def test_mao_present(unihan_data: dict) -> None:
    assert "猫" in unihan_data


def test_ren_present(unihan_data: dict) -> None:
    assert "人" in unihan_data


def test_ren_stroke_count(unihan_data: dict) -> None:
    ren = unihan_data["人"]
    assert ren["stroke_count"] == 2


def test_ren_radical(unihan_data: dict) -> None:
    ren = unihan_data["人"]
    assert ren["radical"] == "人"


def test_ni_present(unihan_data: dict) -> None:
    assert "你" in unihan_data


def test_ni_stroke_count(unihan_data: dict) -> None:
    ni = unihan_data["你"]
    assert ni["stroke_count"] == 7


def test_ni_radical(unihan_data: dict) -> None:
    ni = unihan_data["你"]
    assert ni["radical"] == "人"


# --- radical_char helper ---


def test_radical_char_table_length() -> None:
    assert len(RADICAL_INDEX_TO_CHAR) == 214


def test_radical_char_9_is_ren() -> None:
    assert radical_char(9) == "人"


def test_radical_char_94_is_quan() -> None:
    assert radical_char(94) == "犬"


def test_radical_char_1_is_yi() -> None:
    assert radical_char(1) == "一"


def test_radical_char_out_of_range() -> None:
    # Defensive: returns the index as string when out of range
    assert radical_char(999) == "999"
