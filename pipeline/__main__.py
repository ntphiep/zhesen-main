from __future__ import annotations
import argparse
from pipeline.config import settings

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline", description="Chesen data pipeline")
    parser.add_argument("--limit", type=int, default=50, help="number of headwords to process")
    parser.add_argument("stage", choices=["all"], nargs="?", default="all")
    args = parser.parse_args(argv)
    settings.ensure_dirs()
    print(f"pipeline ready (stage={args.stage}, limit={args.limit})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
