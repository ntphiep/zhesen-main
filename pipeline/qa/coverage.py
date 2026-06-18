"""Coverage report: compute quality metrics over a list of EntryRec objects.

Pure function — no I/O, no network, no database.
"""
from __future__ import annotations

from pipeline.models.records import EntryRec


def coverage_report(entries: list[EntryRec]) -> dict:
    """Return coverage counts and percentages for *entries*.

    Keys returned:
        n               – total entry count
        pct_ipa         – % entries with ≥1 pronunciation whose ipa is non-empty
        pct_gloss_vi    – % entries with ≥1 sense whose gloss_vi is set
        pct_example     – % entries with ≥1 example
        pct_audio       – % entries with ≥1 pronunciation OR example having audio_url
        pct_image_nouns – among entries with ≥1 noun sense, % that have ≥1 image;
                          0.0 when no noun-bearing entries exist
        bands           – {band: count} of entries per frequency_band (falsy bands skipped)

    Percentages are floats 0..100 rounded to 1 decimal.
    Empty input → n=0 and all pct 0.0.
    """
    n = len(entries)
    if n == 0:
        return {
            "n": 0,
            "pct_ipa": 0.0,
            "pct_gloss_vi": 0.0,
            "pct_example": 0.0,
            "pct_audio": 0.0,
            "pct_image_nouns": 0.0,
            "bands": {},
        }

    def _pct(numerator: int, denominator: int) -> float:
        if denominator == 0:
            return 0.0
        return round(100.0 * numerator / denominator, 1)

    has_ipa = 0
    has_gloss_vi = 0
    has_example = 0
    has_audio = 0
    noun_entries = 0
    noun_with_image = 0
    bands: dict[str, int] = {}

    for entry in entries:
        # pct_ipa: ≥1 pronunciation with non-empty ipa
        if any(p.ipa for p in entry.pronunciations):
            has_ipa += 1

        # pct_gloss_vi: ≥1 sense with gloss_vi set
        if any(s.gloss_vi for s in entry.senses):
            has_gloss_vi += 1

        # pct_example: ≥1 example
        if entry.examples:
            has_example += 1

        # pct_audio: ≥1 pronunciation OR example with audio_url
        pron_audio = any(p.audio_url for p in entry.pronunciations)
        ex_audio = any(ex.audio_url for ex in entry.examples)
        if pron_audio or ex_audio:
            has_audio += 1

        # pct_image_nouns: among entries with ≥1 noun sense, % with ≥1 image
        if any(s.pos == "noun" for s in entry.senses):
            noun_entries += 1
            if entry.images:
                noun_with_image += 1

        # bands
        band = entry.frequency_band
        if band:
            bands[band] = bands.get(band, 0) + 1

    return {
        "n": n,
        "pct_ipa": _pct(has_ipa, n),
        "pct_gloss_vi": _pct(has_gloss_vi, n),
        "pct_example": _pct(has_example, n),
        "pct_audio": _pct(has_audio, n),
        "pct_image_nouns": _pct(noun_with_image, noun_entries),
        "bands": bands,
    }
