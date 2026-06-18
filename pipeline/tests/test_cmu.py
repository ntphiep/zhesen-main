from pipeline.parse.cmu import arpabet_to_ipa, us_pronunciation

def test_arpabet_to_ipa_dog():
    out = arpabet_to_ipa(["D", "AO1", "G"])
    assert out == "dɔg"
    assert not any(ch.isdigit() for ch in out)

def test_us_pronunciation_present():
    p = us_pronunciation("dog")
    assert p is not None
    assert p.accent == "en-US" and p.ipa and p.source_id == "cmudict"
    assert p.entry_id == "en:dog"

def test_us_pronunciation_absent():
    assert us_pronunciation("zzzznotaword") is None
