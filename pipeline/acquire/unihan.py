from __future__ import annotations

import urllib.request
import zipfile
from pathlib import Path

from pipeline.config import settings

_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"
_CACHE = settings.RAW_DIR / "Unihan.zip"


def fetch_unihan() -> Path:
    """Download Unihan.zip to data/raw/Unihan.zip; skip if already cached."""
    if not _CACHE.exists():
        settings.ensure_dirs()
        urllib.request.urlretrieve(_URL, _CACHE)
    return _CACHE


def _decode_codepoint(cp: str) -> str:
    """Convert 'U+72D7' → '狗'."""
    return chr(int(cp[2:], 16))


def _parse_rs_unicode(value: str) -> tuple[str, int]:
    """
    Parse kRSUnicode value like '94.5' → (radical='94', stroke_count=5).

    The value may have multiple space-separated entries; we take the first.
    The part before '.' is the radical number (may end with ' for simplified
    radical variant); the part after '.' is additional strokes.
    """
    first = value.split()[0]
    radical_part, _, strokes_part = first.partition(".")
    radical = radical_part.rstrip("'")
    return radical, int(strokes_part)


def parse_unihan(zip_path: Path) -> dict[str, dict]:
    """
    Parse the Unihan zip and return a dict mapping character → data dict.

    Data dict keys:
        radical (str), stroke_count (int), pinyin (list[str]),
        cantonese (list[str]), han_viet (list[str]), gloss (str),
        simplified_variant (str | None), traditional_variant (str | None)
    """
    result: dict[str, dict] = {}

    def _get(char: str) -> dict:
        if char not in result:
            result[char] = {
                "radical": "",
                "stroke_count": 0,
                "pinyin": [],
                "cantonese": [],
                "han_viet": [],
                "gloss": "",
                "simplified_variant": None,
                "traditional_variant": None,
            }
        return result[char]

    files_to_parse = {
        "Unihan_Readings.txt",
        "Unihan_IRGSources.txt",
        "Unihan_Variants.txt",
    }

    with zipfile.ZipFile(zip_path) as z:
        for fname in files_to_parse:
            with z.open(fname) as f:
                for raw in f:
                    line = raw.decode("utf-8").rstrip("\n")
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split("\t")
                    if len(parts) < 3:
                        continue
                    cp, field, value = parts[0], parts[1], parts[2]
                    char = _decode_codepoint(cp)
                    entry = _get(char)

                    if field == "kMandarin":
                        # One or more space-separated readings
                        entry["pinyin"] = value.split()
                    elif field == "kCantonese":
                        entry["cantonese"] = value.split()
                    elif field == "kVietnamese":
                        entry["han_viet"] = value.split()
                    elif field == "kDefinition":
                        entry["gloss"] = value
                    elif field == "kRSUnicode":
                        radical, strokes = _parse_rs_unicode(value)
                        entry["radical"] = radical
                        entry["stroke_count"] = strokes
                    elif field == "kSimplifiedVariant":
                        # Value may be space-separated codepoints; take first
                        first_cp = value.split()[0]
                        entry["simplified_variant"] = _decode_codepoint(first_cp)
                    elif field == "kTraditionalVariant":
                        first_cp = value.split()[0]
                        entry["traditional_variant"] = _decode_codepoint(first_cp)

    return result
