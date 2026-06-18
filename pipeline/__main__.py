from __future__ import annotations
import argparse
from pipeline.config import settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline", description="Chesen data pipeline")
    parser.add_argument("--limit", type=int, default=10, help="number of headwords to process")
    parser.add_argument("--load", action="store_true", help="load entries into Supabase after building")
    parser.add_argument("--lang", choices=["en", "zh"], default="en", help="language to process (en or zh)")
    parser.add_argument("stage", choices=["all"], nargs="?", default="all")
    args = parser.parse_args(argv)

    settings.ensure_dirs()

    from pipeline.orchestrator import load_all, run_slice, run_zh_slice

    if args.lang == "zh":
        entries = run_zh_slice(args.limit)
    else:
        entries = run_slice(args.limit)

    if args.load:
        count = load_all(entries)
        print(f"Loaded {count} entries into Supabase.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
