"""Merge stage: combines records from all pipeline sources into one rich EntryRec.

Precedence and provenance are documented per field. This is a pure function — no I/O.
"""

from __future__ import annotations

from pipeline.models.records import (
    CrossLinkRec,
    EntryRec,
    ExampleRec,
    ImageRec,
    PronunciationRec,
    SenseRec,
)
from pipeline.normalize import clean_ipa, dedup_senses, normalize_accent, normalize_pos


def merge_entry(
    headword: str,
    freq: tuple[int | None, str],
    wiktionary: EntryRec,
    cmu_pron: PronunciationRec | None,
    cambridge: dict,
    examples: list[ExampleRec],
    image: ImageRec | None,
    cross_links: list[CrossLinkRec],
) -> EntryRec:
    """Merge records from all pipeline sources into one rich EntryRec.

    Args:
        headword:    The word being merged (e.g. "dog").
        freq:        (frequency_rank, frequency_band) from frequency_for.
        wiktionary:  Structural base entry from Wiktionary parser.
        cmu_pron:    US pronunciation from CMUdict, or None.
        cambridge:   Dict with keys: level, gloss_vi, pronunciations, examples.
        examples:    Tatoeba ExampleRec list.
        image:       Wikimedia Commons ImageRec (sense_id="" placeholder), or None.
        cross_links: Wikidata cross-language links (from_entry_id="" placeholder).

    Returns:
        A new EntryRec combining all sources with documented provenance.
    """
    entry_id = f"en:{headword}"

    # ------------------------------------------------------------------ #
    # 1. Structural base — copy from wiktionary, override id and lang.    #
    # ------------------------------------------------------------------ #
    entry = wiktionary.model_copy(
        update={
            "id": entry_id,
            "lang": "en",
        }
    )

    # ------------------------------------------------------------------ #
    # 2. Senses — normalize pos, then dedup.                              #
    # ------------------------------------------------------------------ #
    normalized_senses: list[SenseRec] = [
        s.model_copy(update={"pos": normalize_pos(s.pos)})
        for s in entry.senses
    ]
    senses = dedup_senses(normalized_senses)

    # ------------------------------------------------------------------ #
    # 3. Vietnamese glosses — positional/approximate alignment.           #
    # NOTE: Wiktionary↔Cambridge sense alignment is positional (index-   #
    # based). This is a known approximation and a documented refinement   #
    # target — a future task should do semantic alignment via embeddings. #
    # ------------------------------------------------------------------ #
    gloss_vi: list[str] = cambridge.get("gloss_vi") or []
    for i in range(min(len(senses), len(gloss_vi))):
        senses[i] = senses[i].model_copy(
            update={"gloss_vi": gloss_vi[i], "gloss_vi_is_mt": False}
        )

    # ------------------------------------------------------------------ #
    # 4. Pronunciations — wiktionary base → CMU → Cambridge, dedup.      #
    # ------------------------------------------------------------------ #
    pronunciations: list[PronunciationRec] = []
    seen_accent_ipa: set[tuple[str, str | None]] = set()

    def _add_pron(pron: PronunciationRec) -> None:
        acc = normalize_accent(pron.accent)
        ipa = clean_ipa(pron.ipa) if pron.ipa is not None else None
        key = (acc, ipa)
        if key not in seen_accent_ipa:
            seen_accent_ipa.add(key)
            pronunciations.append(
                pron.model_copy(update={"accent": acc, "ipa": ipa})
            )

    for p in entry.pronunciations:
        _add_pron(p)

    # Add CMU only when no en-US accent exists yet.
    us_accents = {normalize_accent(p.accent) for p in pronunciations}
    if cmu_pron is not None and "en-US" not in us_accents:
        _add_pron(cmu_pron)

    # Add each Cambridge pronunciation only when (accent, ipa) pair is new.
    for p in cambridge.get("pronunciations") or []:
        _add_pron(p)

    # ------------------------------------------------------------------ #
    # 5. Level — from Cambridge.                                          #
    # ------------------------------------------------------------------ #
    level: str | None = cambridge.get("level")

    # ------------------------------------------------------------------ #
    # 6. Frequency.                                                       #
    # ------------------------------------------------------------------ #
    frequency_rank, frequency_band = freq

    # ------------------------------------------------------------------ #
    # 7. Examples — Tatoeba + Cambridge, entry_id set, sense_id cleared.  #
    # ------------------------------------------------------------------ #
    cambridge_examples: list[ExampleRec] = cambridge.get("examples") or []
    merged_examples: list[ExampleRec] = [
        ex.model_copy(update={"entry_id": entry_id, "sense_id": None})
        for ex in (list(examples) + list(cambridge_examples))
    ]

    # ------------------------------------------------------------------ #
    # 8. Image — attach to first noun sense; fallback to senses[0]; drop  #
    #    when no senses exist.                                            #
    # ------------------------------------------------------------------ #
    images: list[ImageRec] = []
    if image is not None:
        noun_sense: SenseRec | None = next(
            (s for s in senses if s.pos == "noun"), None
        )
        if noun_sense is not None:
            images = [image.model_copy(update={"sense_id": noun_sense.id})]
        elif senses:
            images = [image.model_copy(update={"sense_id": senses[0].id})]
        # else: no senses — drop the image (images stays [])

    # ------------------------------------------------------------------ #
    # 9. Cross-links — set from_entry_id and clear from_sense_id.        #
    # ------------------------------------------------------------------ #
    merged_cross_links: list[CrossLinkRec] = [
        xl.model_copy(update={"from_entry_id": entry_id, "from_sense_id": None})
        for xl in cross_links
    ]

    # 10. Relations — kept as-is from wiktionary (already on entry copy).

    # ------------------------------------------------------------------ #
    # 11. Provenance — record origin of each field actually present.      #
    # ------------------------------------------------------------------ #
    provenance: dict[str, str] = {}
    provenance["senses"] = "wiktionary-en"
    if frequency_rank is not None or frequency_band:
        provenance["frequency"] = "wordfreq"
    if gloss_vi:
        provenance["gloss_vi"] = "cambridge"
    if level is not None:
        provenance["level"] = "cambridge"
    if images:
        provenance["image"] = "wikimedia-commons"
    if merged_cross_links:
        provenance["cross_links"] = "wikidata-lexemes"

    # ------------------------------------------------------------------ #
    # 12. source_id stays "wiktionary-en" (structural base, already set). #
    # ------------------------------------------------------------------ #

    # Merge attributes — preserve any existing wiktionary attributes and add gloss_vi_all.
    attributes: dict = dict(entry.attributes)
    attributes["gloss_vi_all"] = gloss_vi

    return entry.model_copy(
        update={
            "id": entry_id,
            "lang": "en",
            "senses": senses,
            "pronunciations": pronunciations,
            "level": level,
            "level_is_estimated": False,
            "frequency_rank": frequency_rank,
            "frequency_band": frequency_band,
            "examples": merged_examples,
            "images": images,
            "cross_links": merged_cross_links,
            "provenance": provenance,
            "attributes": attributes,
        }
    )
