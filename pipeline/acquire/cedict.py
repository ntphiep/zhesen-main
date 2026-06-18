from __future__ import annotations

import gzip
import re
import urllib.request
from pathlib import Path

from pipeline.config import settings

_URL = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
_CACHE = settings.RAW_DIR / "cedict.txt.gz"

# Matches: TRADITIONAL SIMPLIFIED [pinyin] /gloss1/gloss2/.../
_LINE_RE = re.compile(
    r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/\s*$"
)


def fetch_cedict() -> Path:
    """Download CC-CEDICT gz to data/raw/cedict.txt.gz; skip if already cached."""
    if not _CACHE.exists():
        settings.ensure_dirs()
        urllib.request.urlretrieve(_URL, _CACHE)
    return _CACHE


def parse_cedict_line(line: str) -> dict | None:
    """
    Parse one CC-CEDICT line.

    Returns dict with keys: traditional, simplified, pinyin, glosses (list[str]).
    Returns None for comment/blank lines.
    """
    line = line.rstrip("\n")
    if not line or line.startswith("#"):
        return None
    m = _LINE_RE.match(line)
    if not m:
        return None
    traditional, simplified, pinyin, gloss_str = m.groups()
    glosses = [g for g in gloss_str.split("/") if g]
    return {
        "traditional": traditional,
        "simplified": simplified,
        "pinyin": pinyin,
        "glosses": glosses,
    }


def load_cedict() -> dict[str, list[dict]]:
    """
    Load CC-CEDICT into a dict mapping simplified → list[entry dicts].

    Downloads and caches the gz if not present.
    """
    path = fetch_cedict()
    result: dict[str, list[dict]] = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            entry = parse_cedict_line(line)
            if entry is None:
                continue
            simp = entry["simplified"]
            result.setdefault(simp, []).append(entry)
    return result
