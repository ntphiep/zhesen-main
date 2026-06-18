from __future__ import annotations

import json
from pathlib import Path

from wordfreq import top_n_list, zipf_frequency

from pipeline.config import settings

# Module-level cache for the rank index
_rank_index: dict[str, int] | None = None


def band_for_zipf(z: float) -> str:
    """Map a zipf value to a frequency band."""
    if z >= 5.0:
        return "very_common"
    elif z >= 4.0:
        return "common"
    elif z >= 3.0:
        return "uncommon"
    else:
        return "rare"


def select_headwords(limit: int) -> list[str]:
    """
    Select the top-limit English words, lowercased, alphabetic only, de-duplicated,
    preserving frequency order.

    Fetches a buffer from top_n_list("en", limit * 5 + 50) and filters down.
    """
    buffer_size = limit * 5 + 50
    candidates = top_n_list("en", buffer_size)

    seen: set[str] = set()
    result: list[str] = []

    for word in candidates:
        # Only include lowercased, alphabetic words
        if word.isalpha() and word == word.lower():
            if word not in seen:
                seen.add(word)
                result.append(word)
                if len(result) >= limit:
                    break

    return result


def frequency_for(word: str) -> tuple[int | None, str]:
    """
    Return (rank, band) for a word.

    Rank is the 1-based position in a lazily-cached top_n_list("en", 50000) index,
    or None if not in that list.
    Band is computed from zipf_frequency(word, "en").
    """
    global _rank_index

    # Lazily build and cache the rank index
    if _rank_index is None:
        _rank_index = {}
        for i, w in enumerate(top_n_list("en", 50000)):
            _rank_index[w] = i + 1

    # Get rank (None if not in index)
    rank = _rank_index.get(word)

    # Compute band from zipf frequency
    z = zipf_frequency(word, "en")
    band = band_for_zipf(z)

    return rank, band


def run(limit: int) -> list[dict]:
    """
    Select headwords, compute rank+band, write to INTERIM_DIR/headwords.jsonl,
    and return the list of dicts.
    """
    settings.ensure_dirs()

    headwords = select_headwords(limit)
    rows: list[dict] = []

    for headword in headwords:
        rank, band = frequency_for(headword)
        row = {
            "headword": headword,
            "frequency_rank": rank,
            "frequency_band": band,
        }
        rows.append(row)

    # Write to JSONL file
    output_path = settings.INTERIM_DIR / "headwords.jsonl"
    with output_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    return rows
