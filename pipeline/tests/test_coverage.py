"""Unit tests for pipeline.qa.coverage — pure function, no network, no DB."""
from __future__ import annotations

import pytest

from pipeline.models.records import (
    EntryRec,
    ExampleRec,
    ImageRec,
    PronunciationRec,
    SenseRec,
)
from pipeline.qa.coverage import coverage_report


def _make_noun_entry() -> EntryRec:
    """Entry with IPA, gloss_vi, example, image, and a noun sense."""
    sense = SenseRec(id="en:apple:s0", entry_id="en:apple", pos="noun", sense_order=0, gloss_vi="táo")
    pron = PronunciationRec(entry_id="en:apple", accent="en-US", ipa="/ˈæp.əl/")
    example = ExampleRec(entry_id="en:apple", text="I ate an apple.")
    image = ImageRec(sense_id="en:apple:s0", url="https://example.com/apple.jpg")
    return EntryRec(
        id="en:apple",
        lang="en",
        headword="apple",
        headword_normalized="apple",
        frequency_band="common",
        senses=[sense],
        pronunciations=[pron],
        examples=[example],
        images=[image],
    )


def _make_bare_entry() -> EntryRec:
    """Entry with no IPA, no gloss_vi, no example, no image, no noun sense."""
    sense = SenseRec(id="en:run:s0", entry_id="en:run", pos="verb", sense_order=0)
    return EntryRec(
        id="en:run",
        lang="en",
        headword="run",
        headword_normalized="run",
        frequency_band="very_common",
        senses=[sense],
    )


class TestCoverageReportEmpty:
    def test_empty_input(self) -> None:
        report = coverage_report([])
        assert report["n"] == 0
        assert report["pct_ipa"] == 0.0
        assert report["pct_gloss_vi"] == 0.0
        assert report["pct_example"] == 0.0
        assert report["pct_audio"] == 0.0
        assert report["pct_image_nouns"] == 0.0
        assert report["bands"] == {}


class TestCoverageReportTwoEntries:
    def setup_method(self) -> None:
        self.entries = [_make_noun_entry(), _make_bare_entry()]
        self.report = coverage_report(self.entries)

    def test_n(self) -> None:
        assert self.report["n"] == 2

    def test_pct_ipa(self) -> None:
        # 1 of 2 has IPA → 50.0
        assert self.report["pct_ipa"] == 50.0

    def test_pct_gloss_vi(self) -> None:
        # 1 of 2 has gloss_vi → 50.0
        assert self.report["pct_gloss_vi"] == 50.0

    def test_pct_example(self) -> None:
        # 1 of 2 has example → 50.0
        assert self.report["pct_example"] == 50.0

    def test_pct_audio(self) -> None:
        # Neither has audio_url on pron or example → 0.0
        assert self.report["pct_audio"] == 0.0

    def test_pct_image_nouns(self) -> None:
        # Only apple is a noun-bearing entry; apple has an image → 100.0
        assert self.report["pct_image_nouns"] == 100.0

    def test_bands(self) -> None:
        assert self.report["bands"]["common"] == 1
        assert self.report["bands"]["very_common"] == 1

    def test_keys_present(self) -> None:
        expected = {"n", "pct_ipa", "pct_gloss_vi", "pct_example", "pct_audio", "pct_image_nouns", "bands"}
        assert set(self.report.keys()) == expected


class TestCoverageReportAudio:
    def test_audio_via_pronunciation(self) -> None:
        pron = PronunciationRec(entry_id="en:dog", accent="en-US", ipa="/dɒɡ/", audio_url="https://ex.com/dog.ogg")
        entry = EntryRec(
            id="en:dog", lang="en", headword="dog", headword_normalized="dog",
            pronunciations=[pron],
        )
        report = coverage_report([entry])
        assert report["pct_audio"] == 100.0

    def test_audio_via_example(self) -> None:
        ex = ExampleRec(entry_id="en:cat", text="The cat sat.", audio_url="https://ex.com/cat.ogg")
        entry = EntryRec(
            id="en:cat", lang="en", headword="cat", headword_normalized="cat",
            examples=[ex],
        )
        report = coverage_report([entry])
        assert report["pct_audio"] == 100.0


class TestCoverageReportImageNouns:
    def test_no_noun_entries_returns_zero(self) -> None:
        # Only verb senses → pct_image_nouns = 0.0 (no noun-bearing entries)
        sense = SenseRec(id="en:run:s0", entry_id="en:run", pos="verb", sense_order=0)
        entry = EntryRec(id="en:run", lang="en", headword="run", headword_normalized="run", senses=[sense])
        report = coverage_report([entry])
        assert report["pct_image_nouns"] == 0.0

    def test_noun_without_image(self) -> None:
        sense = SenseRec(id="en:apple:s0", entry_id="en:apple", pos="noun", sense_order=0)
        entry = EntryRec(id="en:apple", lang="en", headword="apple", headword_normalized="apple", senses=[sense])
        report = coverage_report([entry])
        assert report["pct_image_nouns"] == 0.0

    def test_rounding(self) -> None:
        # 2 noun-bearing entries, 1 has image → 50.0
        s1 = SenseRec(id="en:apple:s0", entry_id="en:apple", pos="noun", sense_order=0)
        img = ImageRec(sense_id="en:apple:s0", url="https://ex.com/apple.jpg")
        e1 = EntryRec(id="en:apple", lang="en", headword="apple", headword_normalized="apple",
                      senses=[s1], images=[img])
        s2 = SenseRec(id="en:cat:s0", entry_id="en:cat", pos="noun", sense_order=0)
        e2 = EntryRec(id="en:cat", lang="en", headword="cat", headword_normalized="cat", senses=[s2])
        report = coverage_report([e1, e2])
        assert report["pct_image_nouns"] == 50.0
