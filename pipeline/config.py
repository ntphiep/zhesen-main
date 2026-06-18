from __future__ import annotations
import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent


def _load_env_files() -> None:
    """Load .env and .env.local (KEY=VALUE lines) into os.environ.

    No external dependency. Existing environment variables take precedence
    (we only fill in keys that are not already set). .env holds secrets like
    SUPABASE_SERVICE_ROLE_KEY; .env.local holds NEXT_PUBLIC_SUPABASE_URL.
    Both are gitignored.
    """
    for name in (".env", ".env.local"):
        path = _ROOT / name
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_env_files()


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
