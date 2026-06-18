"""Tests for pipeline.zh_build — task 3c.2 / 3c.4."""
from __future__ import annotations

from pathlib import Path
import zipfile
from unittest.mock import patch

import pytest

from pipeline.zh_build import numbered_to_diacritic, build_zh_entry, select_zh_headwords

FIXTURES = Path(__file__).parent / "fixtures"
CEDICT_SAMPLE = FIXTURES / "cedict_sample.txt"
UNIHAN_SAMPLE = FIXTURES / "unihan_sample"


# ---------------------------------------------------------------------------
# numbered_to_diacritic
# ---------------------------------------------------------------------------


def test_tone3_ou():
    assert numbered_to_diacritic("gou3") == "gǒu"


def test_tone3_i():
    assert numbered_to_diacritic("ni3") == "nǐ"


def test_multi_syllable():
    assert numbered_to_diacritic("ni3 hao3") == "nǐ hǎo"


def test_tone1_ong():
    assert numbered_to_diacritic("zhong1 guo2") == "zhōng guó"


def test_neutral_tone5():
    assert numbered_to_diacritic("ma5") == "ma"


def test_neutral_tone0():
    assert numbered_to_diacritic("ma0") == "ma"


def test_tone4_a():
    assert numbered_to_diacritic("da4") == "dà"


def test_tone2_u():
    assert numbered_to_diacritic("guo2") == "guó"


def test_tone1_e():
    assert numbered_to_diacritic("he1") == "hē"


def test_v_converted_to_umlaut():
    # v should be treated as u-umlaut (ü)
    result = numbered_to_diacritic("lv4")
    assert result == "lǜ"


def test_already_no_digit():
    # If no trailing digit, return as-is (defensive)
    assert numbered_to_diacritic("gǒu") == "gǒu"


# ---------------------------------------------------------------------------
# build_zh_entry — using real CC-CEDICT + Unihan (cached from prior 3c.1 tests)
# ---------------------------------------------------------------------------


def test_build_gou_id():
    entry = build_zh_entry("狗")
    assert entry.id == "zh:狗"


def test_build_gou_lang():
    entry = build_zh_entry("狗")
    assert entry.lang == "zh"


def test_build_gou_headword():
    entry = build_zh_entry("狗")
    assert entry.headword == "狗"
    assert entry.headword_normalized == "狗"


def test_build_gou_pronunciation_pinyin():
    entry = build_zh_entry("狗")
    pron_ipas = [p.ipa for p in entry.pronunciations if p.accent == "zh-pinyin"]
    assert any("gǒu" in (ipa or "") for ipa in pron_ipas)


def test_build_gou_senses_have_dog():
    entry = build_zh_entry("狗")
    assert len(entry.senses) >= 1
    all_glosses = [s.gloss_en or "" for s in entry.senses]
    assert any("dog" in g.lower() for g in all_glosses)


def test_build_gou_char_attributes():
    entry = build_zh_entry("狗")
    chars = entry.attributes.get("characters", [])
    assert len(chars) == 1
    char0 = chars[0]
    assert char0["char"] == "狗"
    assert char0["position"] == 0
    assert "cẩu" in char0["han_viet"]
    assert char0["radical"] != ""
    assert char0["stroke_count"] > 0


def test_build_gou_attributes_pinyin():
    entry = build_zh_entry("狗")
    assert "gǒu" in entry.attributes.get("pinyin", "")


def test_build_gou_source_id():
    entry = build_zh_entry("狗")
    assert entry.source_id == "cc-cedict"


def test_build_traditional_same_omitted():
    # 狗 has same simplified and traditional; traditional field should be None
    entry = build_zh_entry("狗")
    assert entry.traditional is None


def test_build_ai_traditional_different():
    # 愛 (traditional) vs 爱 (simplified) — build 爱
    entry = build_zh_entry("爱")
    # traditional should be set (愛 != 爱)
    assert entry.traditional is not None


def test_build_sense_order():
    entry = build_zh_entry("狗")
    orders = [s.sense_order for s in entry.senses]
    assert orders == list(range(1, len(orders) + 1))


# ---------------------------------------------------------------------------
# select_zh_headwords
# ---------------------------------------------------------------------------


def test_select_headwords_count():
    words = select_zh_headwords(10)
    assert len(words) == 10


def test_select_headwords_are_cjk():
    import re
    cjk_re = re.compile(r"^[一-鿿㐀-䶿\U00020000-\U0002a6df]+$")
    words = select_zh_headwords(10)
    for w in words:
        assert cjk_re.match(w), f"{w!r} is not pure CJK"


def test_select_headwords_in_cedict():
    from pipeline.zh_build import _cedict
    cedict = _cedict()
    words = select_zh_headwords(10)
    for w in words:
        assert w in cedict, f"{w!r} not in CC-CEDICT"


def test_select_headwords_no_duplicates():
    words = select_zh_headwords(20)
    assert len(words) == len(set(words))


# ---------------------------------------------------------------------------
# Stroke count + radical character correctness (task 3c.4 A+B)
# ---------------------------------------------------------------------------


def test_ren_stroke_count_is_total() -> None:
    # 人 has kTotalStrokes=2; previously kRSUnicode additional strokes=0 (wrong)
    entry = build_zh_entry("人")
    chars = entry.attributes.get("characters", [])
    assert len(chars) == 1
    assert chars[0]["stroke_count"] == 2


def test_ren_radical_is_character() -> None:
    # radical should be the Kangxi character 人, not the index "9"
    entry = build_zh_entry("人")
    chars = entry.attributes.get("characters", [])
    assert chars[0]["radical"] == "人"


def test_ni_stroke_count_is_total() -> None:
    # 你 has kTotalStrokes=7; previously kRSUnicode additional strokes=5 (wrong)
    entry = build_zh_entry("你")
    chars = entry.attributes.get("characters", [])
    assert len(chars) == 1
    assert chars[0]["stroke_count"] == 7


def test_ni_radical_is_character() -> None:
    entry = build_zh_entry("你")
    chars = entry.attributes.get("characters", [])
    assert chars[0]["radical"] == "人"


# ---------------------------------------------------------------------------
# Tatoeba Chinese examples (task 3c.4 C)
# ---------------------------------------------------------------------------


def test_zh_examples_attached_when_tatoeba_returns_results() -> None:
    """When fetch_tatoeba returns results, examples are attached to entry."""
    fake_raw = {
        "results": [
            {
                "text": "你好。",
                "translations": [[{"id": 1, "text": "Xin chào.", "lang": "vie", "audios": []}]],
                "audios": [],
            }
        ]
    }
    with patch("pipeline.zh_build.fetch_tatoeba", return_value=fake_raw):
        entry = build_zh_entry("你")
    assert len(entry.examples) >= 1
    ex = entry.examples[0]
    assert ex.source_id == "tatoeba"
    assert ex.entry_id == "zh:你"
    assert ex.translation_vi == "Xin chào."


def test_zh_examples_capped_at_five() -> None:
    """Examples are capped at 5 even when Tatoeba returns more."""
    result_template = {
        "text": "你好。",
        "translations": [],
        "audios": [],
    }
    fake_raw = {"results": [result_template] * 10}
    with patch("pipeline.zh_build.fetch_tatoeba", return_value=fake_raw):
        entry = build_zh_entry("你")
    assert len(entry.examples) <= 5


def test_zh_examples_empty_on_network_error() -> None:
    """Network errors are swallowed; entry is still returned without examples."""
    with patch("pipeline.zh_build.fetch_tatoeba", side_effect=OSError("timeout")):
        entry = build_zh_entry("你")
    assert isinstance(entry.examples, list)
