"""Tests for Spanish entry builder (task 3d.1).

Covers:
  - conjugate_es: full verb conjugation via verbecc
  - build_es_entry: live Wiktionary fetch for "hablar"
  - select_es_headwords: wordfreq-based headword selection

All live-network tests are skipped when offline (requests.RequestException).
"""
from __future__ import annotations

import pytest
import requests

from pipeline.es_build import conjugate_es, build_es_entry, select_es_headwords
from pipeline.models.records import InflectionRec


# ---------------------------------------------------------------------------
# conjugate_es
# ---------------------------------------------------------------------------


def test_conjugate_es_hablar_returns_many_forms() -> None:
    """conjugate_es('hablar') must return a substantial list of InflectionRec."""
    forms = conjugate_es("hablar")
    assert len(forms) > 20, f"Expected >20 forms, got {len(forms)}"


def test_conjugate_es_hablar_all_entry_id() -> None:
    """All InflectionRec must carry entry_id=='es:hablar'."""
    forms = conjugate_es("hablar")
    assert forms, "Expected non-empty conjugation list"
    assert all(f.entry_id == "es:hablar" for f in forms)


def test_conjugate_es_hablar_indicativo_presente_yo() -> None:
    """conjugate_es must include 'hablo' as indicativo presente first-person singular."""
    forms = conjugate_es("hablar")
    # Find the present indicative 1st person singular form
    matches = [
        f for f in forms
        if f.form_text == "hablo"
        and f.mood is not None and "indicativo" in f.mood
        and f.tense is not None and "presente" in f.tense
        and f.person == 1
        and f.number == "sing"
    ]
    assert matches, (
        "Expected InflectionRec with form_text='hablo', mood=indicativo, "
        "tense=presente, person=1, number=sing. "
        f"Got forms: {[(f.form_text, f.mood, f.tense, f.person, f.number) for f in forms[:5]]}"
    )


def test_conjugate_es_hablar_has_subjuntivo_form() -> None:
    """conjugate_es must include at least one subjuntivo form."""
    forms = conjugate_es("hablar")
    subjunctive = [f for f in forms if f.mood and "subjuntivo" in f.mood]
    assert subjunctive, "Expected at least one subjuntivo form"


def test_conjugate_es_hablar_source_id() -> None:
    """All InflectionRec must carry source_id=='verbecc'."""
    forms = conjugate_es("hablar")
    assert forms, "Expected non-empty conjugation list"
    assert all(f.source_id == "verbecc" for f in forms)


def test_conjugate_es_invalid_verb_returns_empty() -> None:
    """conjugate_es must return [] for an unknown/invalid verb."""
    result = conjugate_es("xyznotaverbatall")
    assert result == []


def test_conjugate_es_hablar_form_label_not_empty() -> None:
    """Every InflectionRec must have a non-empty form_label."""
    forms = conjugate_es("hablar")
    assert forms, "Expected non-empty conjugation list"
    assert all(f.form_label for f in forms), "Expected all forms to have form_label"


# ---------------------------------------------------------------------------
# build_es_entry — live network (skip if offline)
# ---------------------------------------------------------------------------


def _live(word: str):
    """Attempt a live Wiktionary fetch; skip if network is unavailable."""
    try:
        return build_es_entry(word)
    except requests.RequestException as exc:
        pytest.skip(f"Network unavailable: {exc}")


def test_build_es_entry_hablar_id_and_lang() -> None:
    entry = _live("hablar")
    assert entry.id == "es:hablar"
    assert entry.lang == "es"


def test_build_es_entry_hablar_has_senses() -> None:
    entry = _live("hablar")
    assert entry.senses, "Expected at least one sense"
    assert any(s.gloss_en for s in entry.senses), "Expected at least one gloss_en"


def test_build_es_entry_hablar_has_pronunciation() -> None:
    entry = _live("hablar")
    assert entry.pronunciations, "Expected at least one pronunciation"


def test_build_es_entry_hablar_has_full_conjugation() -> None:
    """build_es_entry for 'hablar' (a verb) must attach >20 inflections."""
    entry = _live("hablar")
    assert len(entry.inflections) > 20, (
        f"Expected >20 inflections for verb 'hablar', got {len(entry.inflections)}"
    )


def test_build_es_entry_hablar_source_id() -> None:
    entry = _live("hablar")
    assert entry.source_id == "wiktionary-es"


# ---------------------------------------------------------------------------
# select_es_headwords
# ---------------------------------------------------------------------------


def test_select_es_headwords_returns_limit() -> None:
    words = select_es_headwords(10)
    assert len(words) == 10


def test_select_es_headwords_sorted() -> None:
    words = select_es_headwords(20)
    assert words == sorted(words), "Expected alphabetically sorted headwords"


def test_select_es_headwords_lowercase() -> None:
    words = select_es_headwords(20)
    assert all(w == w.lower() for w in words), "Expected all words to be lowercase"


def test_select_es_headwords_no_duplicates() -> None:
    words = select_es_headwords(20)
    assert len(words) == len(set(words)), "Expected no duplicate headwords"


def test_select_es_headwords_valid_chars() -> None:
    """All returned headwords must contain only valid Spanish letters."""
    _ES_VALID_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzáéíóúñü")
    words = select_es_headwords(30)
    for word in words:
        invalid = [ch for ch in word if ch not in _ES_VALID_CHARS]
        assert not invalid, f"Word {word!r} contains invalid chars: {invalid}"
