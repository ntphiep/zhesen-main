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


# ---------------------------------------------------------------------------
# Phase 3b.1 — enrichment: inflections, relations, translations
# ---------------------------------------------------------------------------


def test_dog_inflections_plural() -> None:
    """Inflections must include the noun plural form 'dogs'."""
    e = parse_wiktionary("dog", _fixture())
    plural_forms = [inf for inf in e.inflections if inf.form_text == "dogs"]
    assert plural_forms, "Expected at least one inflection with form_text='dogs'"
    # One of those should carry the label 'plural'
    assert any(inf.form_label == "plural" for inf in plural_forms), (
        "Expected an inflection labelled 'plural' with form_text='dogs'"
    )


def test_dog_inflections_verb_forms() -> None:
    """Verb inflections must include dogging (present participle) and dogged (past)."""
    e = parse_wiktionary("dog", _fixture())
    form_texts = {inf.form_text for inf in e.inflections}
    assert "dogging" in form_texts, "Expected 'dogging' (present participle) in inflections"
    assert "dogged" in form_texts, "Expected 'dogged' (simple past/past participle) in inflections"


def test_dog_inflections_source_id() -> None:
    """All inflection records must carry the wiktionary-en source_id."""
    e = parse_wiktionary("dog", _fixture())
    assert e.inflections, "Expected non-empty inflections list"
    assert all(inf.source_id == "wiktionary-en" for inf in e.inflections)


def test_dog_relations_non_empty() -> None:
    """Relations must be non-empty (Wiktionary dog page has Synonyms + Derived terms)."""
    e = parse_wiktionary("dog", _fixture())
    assert e.relations, "Expected non-empty relations list"


def test_dog_relations_synonyms_present() -> None:
    """At least one synonym relation must exist (e.g. 'hound' or 'canine')."""
    e = parse_wiktionary("dog", _fixture())
    synonyms = [r.related_text for r in e.relations if r.relation_type == "synonym"]
    assert synonyms, "Expected at least one synonym relation"
    assert any(w in synonyms for w in ("hound", "canine", "domestic dog")), (
        f"Expected common synonym among relations, got: {synonyms[:10]}"
    )


def test_dog_relations_derived_terms_present() -> None:
    """Derived terms must be present."""
    e = parse_wiktionary("dog", _fixture())
    derived = [r.related_text for r in e.relations if r.relation_type == "derived"]
    assert derived, "Expected at least one derived term relation"


def test_dog_relations_source_id() -> None:
    """All relation records must carry the wiktionary-en source_id."""
    e = parse_wiktionary("dog", _fixture())
    assert all(r.source_id == "wiktionary-en" for r in e.relations)


def test_dog_translations_zh() -> None:
    """Translations must include Mandarin Chinese '狗' under key 'zh'."""
    e = parse_wiktionary("dog", _fixture())
    zh = e.attributes.get("translations", {}).get("zh", [])
    assert "狗" in zh, f"Expected '狗' in zh translations, got: {zh}"


def test_dog_translations_es() -> None:
    """Translations must include Spanish 'perro' under key 'es'."""
    e = parse_wiktionary("dog", _fixture())
    es = e.attributes.get("translations", {}).get("es", [])
    assert "perro" in es, f"Expected 'perro' in es translations, got: {es}"


def test_dog_translations_stashed_in_attributes() -> None:
    """Translations must be stashed in EntryRec.attributes['translations']."""
    e = parse_wiktionary("dog", _fixture())
    assert "translations" in e.attributes, "Expected 'translations' key in EntryRec.attributes"
    trans = e.attributes["translations"]
    assert isinstance(trans, dict), "Expected translations to be a dict"
    assert "zh" in trans and "es" in trans


# ---------------------------------------------------------------------------
# Phase 3b.3 — de-blob: no blobby multi-sense glosses, no duplicate glosses
# ---------------------------------------------------------------------------


def test_dog_no_blob_senses() -> None:
    """No gloss_en should contain a newline (i.e. multi-sense blob)."""
    e = parse_wiktionary("dog", _fixture())
    blobs = [s.gloss_en for s in e.senses if "\n" in s.gloss_en]
    assert not blobs, f"Found {len(blobs)} blobby senses: {blobs[:3]}"


def test_dog_no_duplicate_senses() -> None:
    """No two senses should have identical gloss_en."""
    e = parse_wiktionary("dog", _fixture())
    glosses = [s.gloss_en for s in e.senses]
    seen: set[str] = set()
    dups: list[str] = []
    for g in glosses:
        if g in seen:
            dups.append(g)
        seen.add(g)
    assert not dups, f"Found {len(dups)} duplicate senses: {dups[:3]}"


def test_dog_senses_count_sane() -> None:
    """After de-blob, 'dog' should have at most 35 distinct senses.

    The fixture has 33 genuine distinct senses (noun + verb + adjective) once
    blobs are split into lead + sub-senses and duplicates are removed.
    """
    e = parse_wiktionary("dog", _fixture())
    assert len(e.senses) <= 35, f"Expected ≤35 senses after de-blob, got {len(e.senses)}"
