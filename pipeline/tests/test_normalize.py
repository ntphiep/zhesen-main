from pipeline.normalize import normalize_pos, clean_ipa, normalize_accent, dedup_senses
from pipeline.models.records import SenseRec

def test_normalize_pos():
    assert normalize_pos("Noun") == "noun"
    assert normalize_pos("PROPER NOUN") == "noun"
    assert normalize_pos("adj") == "adjective"
    assert normalize_pos("exclamation") == "interjection"
    assert normalize_pos("number") == "numeral"
    assert normalize_pos("phrase") is None
    assert normalize_pos(None) is None

def test_clean_ipa():
    assert clean_ipa("/dɔɡ/") == "dɔɡ"
    assert clean_ipa("[dɔ(ː)ɡ]") == "dɔ(ː)ɡ"
    assert clean_ipa("  /kæt/ ") == "kæt"

def test_normalize_accent():
    assert normalize_accent("en-GB") == "en-UK"
    assert normalize_accent("gb") == "en-UK"
    assert normalize_accent("US") == "en-US"
    assert normalize_accent("en") == "en"
    assert normalize_accent("weird") == "weird"

def test_dedup_senses():
    e = "en:dog"
    senses = [
        SenseRec(id=f"{e}#1", entry_id=e, pos="noun", sense_order=1, gloss_en="a canine"),
        SenseRec(id=f"{e}#2", entry_id=e, pos="noun", sense_order=2, gloss_en="a canine"),  # dup
        SenseRec(id=f"{e}#3", entry_id=e, pos="verb", sense_order=3, gloss_en="to follow"),
    ]
    out = dedup_senses(senses)
    assert len(out) == 2
    assert [s.sense_order for s in out] == [1, 2]
    assert [s.id for s in out] == [f"{e}#1", f"{e}#2"]
    assert out[1].gloss_en == "to follow"
