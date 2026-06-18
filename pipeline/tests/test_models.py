import pytest
from pydantic import ValidationError
from pipeline.models.records import EntryRec, SenseRec, PronunciationRec

def test_entry_minimal_ok():
    e = EntryRec(id="en:dog", lang="en", entry_type="word",
                 headword="dog", headword_normalized="dog", source_id="wiktionary-en")
    assert e.senses == [] and e.frequency_rank is None

def test_sense_requires_order():
    with pytest.raises(ValidationError):
        SenseRec(id="en:dog#1", entry_id="en:dog")  # missing sense_order

def test_tier_literal_rejects_bad_value():
    with pytest.raises(ValidationError):
        PronunciationRec(entry_id="en:dog", accent="en-US", tier="public")
