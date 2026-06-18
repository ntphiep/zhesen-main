from pipeline.merge import merge_entry
from pipeline.models.records import EntryRec, SenseRec, PronunciationRec, ExampleRec, ImageRec, CrossLinkRec


def _wik():
    e = "en:dog"
    return EntryRec(
        id=e, lang="en", headword="dog", headword_normalized="dog", source_id="wiktionary-en",
        senses=[SenseRec(id=f"{e}#1", entry_id=e, pos="Noun", sense_order=1, gloss_en="a canine", source_id="wiktionary-en")],
        pronunciations=[PronunciationRec(entry_id=e, accent="en-UK", ipa="/dɒɡ/", source_id="wiktionary-en")],
    )


def test_merge_combines_sources():
    e = "en:dog"
    cmu = PronunciationRec(entry_id=e, accent="en-US", ipa="dɔg", source_id="cmudict")
    cambridge = {"level": "A1", "gloss_vi": ["con chó"],
                 "pronunciations": [], "examples": []}
    img = ImageRec(sense_id="", url="https://commons.wikimedia.org/x.jpg", source_id="wikimedia-commons")
    xlinks = [CrossLinkRec(from_entry_id="", to_entry_id="es:perro", link_type="translation", source_id="wikidata-lexemes")]
    ex = [ExampleRec(text="The dog barks.", translation_vi="Con chó sủa.", source_id="tatoeba", tier="open")]

    entry = merge_entry("dog", (1, "very_common"), _wik(), cmu, cambridge, ex, img, xlinks)

    accents = {p.accent for p in entry.pronunciations}
    assert "en-UK" in accents and "en-US" in accents       # base + CMU
    assert entry.level == "A1"
    assert entry.frequency_band == "very_common" and entry.frequency_rank == 1
    assert entry.senses[0].gloss_vi == "con chó"           # cambridge vi attached
    assert entry.senses[0].pos == "noun"                   # normalized
    assert entry.images and entry.images[0].sense_id == entry.senses[0].id   # attached to noun sense
    assert entry.cross_links[0].from_entry_id == "en:dog"
    assert entry.examples[0].entry_id == "en:dog"
    assert entry.provenance.get("level") == "cambridge"


def test_no_cmu_when_us_already_present():
    """CMU pron is NOT added when wiktionary already has en-US."""
    e = "en:cat"
    wik = EntryRec(
        id=e, lang="en", headword="cat", headword_normalized="cat", source_id="wiktionary-en",
        senses=[SenseRec(id=f"{e}#1", entry_id=e, pos="noun", sense_order=1, gloss_en="a feline", source_id="wiktionary-en")],
        pronunciations=[
            PronunciationRec(entry_id=e, accent="en-US", ipa="/kæt/", source_id="wiktionary-en"),
        ],
    )
    cmu = PronunciationRec(entry_id=e, accent="en-US", ipa="k ae t", source_id="cmudict")
    cambridge = {"level": None, "gloss_vi": [], "pronunciations": [], "examples": []}

    entry = merge_entry("cat", (None, "common"), wik, cmu, cambridge, [], None, [])

    us_prons = [p for p in entry.pronunciations if p.accent == "en-US"]
    assert len(us_prons) == 1, "Should not duplicate en-US pronunciation"


def test_image_attached_to_noun_sense():
    """Image attaches to the first noun sense."""
    e = "en:run"
    wik = EntryRec(
        id=e, lang="en", headword="run", headword_normalized="run", source_id="wiktionary-en",
        senses=[
            SenseRec(id=f"{e}#1", entry_id=e, pos="verb", sense_order=1, gloss_en="to move fast", source_id="wiktionary-en"),
            SenseRec(id=f"{e}#2", entry_id=e, pos="Noun", sense_order=2, gloss_en="a running session", source_id="wiktionary-en"),
        ],
        pronunciations=[],
    )
    img = ImageRec(sense_id="", url="https://commons.wikimedia.org/run.jpg", source_id="wikimedia-commons")
    cambridge = {"level": None, "gloss_vi": [], "pronunciations": [], "examples": []}

    entry = merge_entry("run", (None, "common"), wik, None, cambridge, [], img, [])

    # image should be attached to the noun sense (index 1 in original, but after normalize/dedup it becomes the noun)
    noun_sense = next(s for s in entry.senses if s.pos == "noun")
    assert entry.images[0].sense_id == noun_sense.id


def test_image_fallback_to_first_sense_when_no_noun():
    """When no noun sense exists, image falls back to senses[0]."""
    e = "en:quickly"
    wik = EntryRec(
        id=e, lang="en", headword="quickly", headword_normalized="quickly", source_id="wiktionary-en",
        senses=[SenseRec(id=f"{e}#1", entry_id=e, pos="adverb", sense_order=1, gloss_en="at speed", source_id="wiktionary-en")],
        pronunciations=[],
    )
    img = ImageRec(sense_id="", url="https://commons.wikimedia.org/q.jpg", source_id="wikimedia-commons")
    cambridge = {"level": None, "gloss_vi": [], "pronunciations": [], "examples": []}

    entry = merge_entry("quickly", (None, "common"), wik, None, cambridge, [], img, [])

    assert entry.images[0].sense_id == entry.senses[0].id


def test_image_dropped_when_no_senses():
    """Image is dropped when the entry has no senses."""
    e = "en:hmm"
    wik = EntryRec(
        id=e, lang="en", headword="hmm", headword_normalized="hmm", source_id="wiktionary-en",
        senses=[],
        pronunciations=[],
    )
    img = ImageRec(sense_id="", url="https://commons.wikimedia.org/hmm.jpg", source_id="wikimedia-commons")
    cambridge = {"level": None, "gloss_vi": [], "pronunciations": [], "examples": []}

    entry = merge_entry("hmm", (None, "rare"), wik, None, cambridge, [], img, [])

    assert entry.images == []


def test_cambridge_pron_dedup():
    """Cambridge pronunciations are not added when the same (accent, ipa) already exists."""
    e = "en:fish"
    wik = EntryRec(
        id=e, lang="en", headword="fish", headword_normalized="fish", source_id="wiktionary-en",
        senses=[SenseRec(id=f"{e}#1", entry_id=e, pos="noun", sense_order=1, gloss_en="a water animal", source_id="wiktionary-en")],
        pronunciations=[PronunciationRec(entry_id=e, accent="en-UK", ipa="/fɪʃ/", source_id="wiktionary-en")],
    )
    cambridge = {
        "level": "A1",
        "gloss_vi": [],
        "pronunciations": [
            # Same accent+ipa as the wiktionary one (after normalization)
            PronunciationRec(entry_id=e, accent="en-UK", ipa="/fɪʃ/", source_id="cambridge"),
        ],
        "examples": [],
    }

    entry = merge_entry("fish", (None, "common"), wik, None, cambridge, [], None, [])

    uk_prons = [p for p in entry.pronunciations if p.accent == "en-UK"]
    assert len(uk_prons) == 1, "Duplicate (accent, ipa) from Cambridge should be dropped"


def test_provenance_keys():
    """Provenance dict records the correct source keys."""
    e = "en:dog"
    entry = merge_entry(
        "dog", (5, "common"), _wik(),
        PronunciationRec(entry_id=e, accent="en-US", ipa="dɔg", source_id="cmudict"),
        {"level": "B2", "gloss_vi": ["con chó"], "pronunciations": [], "examples": []},
        [],
        ImageRec(sense_id="", url="https://commons.wikimedia.org/dog.jpg", source_id="wikimedia-commons"),
        [CrossLinkRec(from_entry_id="", to_entry_id="es:perro", link_type="translation", source_id="wikidata-lexemes")],
    )

    assert entry.provenance["level"] == "cambridge"
    assert entry.provenance["frequency"] == "wordfreq"
    assert entry.provenance["gloss_vi"] == "cambridge"
    assert entry.provenance["senses"] == "wiktionary-en"
    assert entry.provenance["image"] == "wikimedia-commons"
    assert entry.provenance["cross_links"] == "wikidata-lexemes"


def test_examples_combined_and_entry_id_set():
    """Tatoeba + cambridge examples are merged and entry_id is set on all."""
    e = "en:dog"
    tatoeba_ex = [
        ExampleRec(text="The dog runs.", source_id="tatoeba", tier="open"),
        ExampleRec(text="A dog barks.", source_id="tatoeba", tier="open"),
    ]
    cambridge_ex = [ExampleRec(text="The dog is friendly.", source_id="cambridge", tier="open")]
    cambridge = {"level": None, "gloss_vi": [], "pronunciations": [], "examples": cambridge_ex}

    entry = merge_entry("dog", (None, "common"), _wik(), None, cambridge, tatoeba_ex, None, [])

    assert len(entry.examples) == 3
    assert all(ex.entry_id == "en:dog" for ex in entry.examples)
    assert all(ex.sense_id is None for ex in entry.examples)


def test_gloss_vi_all_stored_in_attributes():
    """All cambridge gloss_vi strings are stored in entry.attributes['gloss_vi_all']."""
    e = "en:dog"
    vi_glosses = ["con chó", "chó"]
    cambridge = {"level": None, "gloss_vi": vi_glosses, "pronunciations": [], "examples": []}

    entry = merge_entry("dog", (None, "common"), _wik(), None, cambridge, [], None, [])

    assert entry.attributes.get("gloss_vi_all") == vi_glosses
    # gloss_vi is from a human-curated bilingual dict, not machine translation.
    assert entry.senses[0].gloss_vi == "con chó"
    assert entry.senses[0].gloss_vi_is_mt is False


def test_pron_dedup_with_none_ipa():
    """Two pronunciations with the same accent and no IPA are deduped consistently."""
    e = "en:uh"
    wik = EntryRec(
        id=e, lang="en", headword="uh", headword_normalized="uh", source_id="wiktionary-en",
        senses=[SenseRec(id=f"{e}#1", entry_id=e, pos="interjection", sense_order=1, gloss_en="a filler", source_id="wiktionary-en")],
        pronunciations=[PronunciationRec(entry_id=e, accent="en-UK", ipa=None, source_id="wiktionary-en")],
    )
    cambridge = {
        "level": None,
        "gloss_vi": [],
        # Same accent, also no IPA: must be deduped against the wiktionary one.
        "pronunciations": [PronunciationRec(entry_id=e, accent="en-UK", ipa=None, source_id="cambridge")],
        "examples": [],
    }

    entry = merge_entry("uh", (None, "common"), wik, None, cambridge, [], None, [])

    uk_prons = [p for p in entry.pronunciations if p.accent == "en-UK"]
    assert len(uk_prons) == 1
    assert uk_prons[0].ipa is None
