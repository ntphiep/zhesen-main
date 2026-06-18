from __future__ import annotations

import urllib.request
import zipfile
from pathlib import Path

from pipeline.config import settings

_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip"
_CACHE = settings.RAW_DIR / "Unihan.zip"

# ---------------------------------------------------------------------------
# Kangxi radical index → character (214 radicals, 1-indexed)
# ---------------------------------------------------------------------------

# The 214 Kangxi radicals in canonical order (index 1 … 214).
# This table is stable (Unicode Standard Annex #38 / Kangxi dictionary).
_KANGXI_RADICALS = (
    "一丨丶丿乙亅二亠人儿入八冂冖冫几凵刀力勺匕匚匸十卜卩厂厶又"
    "口囗土士夂夊夕大女子宀寸小尢尸屮山巛工己巾干幺广廴廾弋弓彐"
    "彡彳心戈戸手支攴文斗斤方无日曰月木欠止歹殳毋比毛氏气水火爪"
    "父爻爿片牙牛犬玄玉瓜瓦甘生用田疋疒癶白皮皿目矛矢石示禸禾穴"
    "立竹米糸缶网羊羽老而耒耳聿肉臣自至臼舌舛舟艮色艸虍虫血行衣"
    "襾見角言谷豆豕豸貝赤走足身車辛辰辵邑酉釆里金長門阜隶隹雨靑"
    "非面革韋韭音頁風飛食首香馬骨高髟鬥鬯鬲鬼魚鳥鹵鹿麥麻黃黍黑"
    "黹黽鼎鼓鼠鼻齊齒龍龜龠"
)

# Build a dict mapping integer index (1-based) → radical character.
RADICAL_INDEX_TO_CHAR: dict[int, str] = {
    i + 1: ch for i, ch in enumerate(_KANGXI_RADICALS)
}


def radical_char(index: int) -> str:
    """Return the Kangxi radical character for a 1-based index.

    Returns the index as a string if the index is out of range (defensive).
    """
    return RADICAL_INDEX_TO_CHAR.get(index, str(index))


# ---------------------------------------------------------------------------


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
        radical (str)             — Kangxi radical CHARACTER (e.g. '人')
        radical_index (int)       — Kangxi radical index number (e.g. 9)
        stroke_count (int)        — total stroke count from kTotalStrokes
        pinyin (list[str])
        cantonese (list[str])
        han_viet (list[str])
        gloss (str)
        simplified_variant (str | None)
        traditional_variant (str | None)
    """
    result: dict[str, dict] = {}

    def _get(char: str) -> dict:
        if char not in result:
            result[char] = {
                "radical": "",
                "radical_index": 0,
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
                        radical_str, _ = _parse_rs_unicode(value)
                        idx = int(radical_str)
                        entry["radical_index"] = idx
                        entry["radical"] = radical_char(idx)
                    elif field == "kTotalStrokes":
                        # May have multiple space-separated values; take first.
                        first_val = value.split()[0]
                        entry["stroke_count"] = int(first_val)
                    elif field == "kSimplifiedVariant":
                        # Value may be space-separated codepoints; take first
                        first_cp = value.split()[0]
                        entry["simplified_variant"] = _decode_codepoint(first_cp)
                    elif field == "kTraditionalVariant":
                        first_cp = value.split()[0]
                        entry["traditional_variant"] = _decode_codepoint(first_cp)

    return result
