from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class SourceRow:
    """Frozen dataclass representing a data source in the catalog."""
    id: str
    name: str
    url: str
    license: str
    tier: str
    notes: str


# Catalog of all data sources with license and tier information.
# Keyed by source id.
SOURCES: dict[str, SourceRow] = {
    "wiktionary-en": SourceRow(
        id="wiktionary-en",
        name="English Wiktionary (Kaikki/wiktextract)",
        url="https://kaikki.org",
        license="CC BY-SA 4.0",
        tier="open",
        notes=""
    ),
    "cambridge": SourceRow(
        id="cambridge",
        name="Cambridge Dictionary",
        url="https://dictionary.cambridge.org",
        license="proprietary",
        tier="personal",
        notes=""
    ),
    "cmudict": SourceRow(
        id="cmudict",
        name="CMU Pronouncing Dictionary",
        url="https://github.com/cmusphinx/cmudict",
        license="BSD-2-Clause",
        tier="open",
        notes=""
    ),
    "wordfreq": SourceRow(
        id="wordfreq",
        name="wordfreq word frequency lists",
        url="https://github.com/rspeer/wordfreq",
        license="MIT (mixed corpora)",
        tier="open",
        notes=""
    ),
    "tatoeba": SourceRow(
        id="tatoeba",
        name="Tatoeba example sentences",
        url="https://tatoeba.org",
        license="CC BY 2.0 FR",
        tier="open",
        notes=""
    ),
    "wikidata-lexemes": SourceRow(
        id="wikidata-lexemes",
        name="Wikidata Lexemes",
        url="https://www.wikidata.org",
        license="CC0 1.0",
        tier="open",
        notes=""
    ),
    "wikimedia-commons": SourceRow(
        id="wikimedia-commons",
        name="Wikimedia Commons",
        url="https://commons.wikimedia.org",
        license="mixed (per-file)",
        tier="open",
        notes="license varies per file; store per-image license on the image row"
    ),
}


def seed_rows() -> list[dict]:
    """
    Returns a list of dicts suitable for inserting into lex.sources.
    Each dict is created from asdict(SourceRow).
    """
    return [asdict(s) for s in SOURCES.values()]
