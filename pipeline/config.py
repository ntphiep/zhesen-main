from __future__ import annotations
import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent

class Settings:
    ROOT = _ROOT
    DATA_DIR = _ROOT / "data"
    RAW_DIR = DATA_DIR / "raw"
    CACHE_DIR = RAW_DIR / "cache"
    INTERIM_DIR = DATA_DIR / "interim"
    MANIFEST_PATH = DATA_DIR / "manifest.json"
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    def ensure_dirs(self) -> None:
        for d in (self.DATA_DIR, self.RAW_DIR, self.CACHE_DIR, self.INTERIM_DIR):
            d.mkdir(parents=True, exist_ok=True)

settings = Settings()
