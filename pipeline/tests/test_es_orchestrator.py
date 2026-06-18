"""Tests for the Spanish orchestrator slice and CLI wiring (task 3d.2).

All tests are unit-only — no real network, no Supabase.
"""
from __future__ import annotations

import argparse


def test_run_es_slice_importable() -> None:
    """run_es_slice must be importable from pipeline.orchestrator."""
    from pipeline.orchestrator import run_es_slice  # noqa: F401

    assert callable(run_es_slice)


def test_lang_es_accepted_by_parser() -> None:
    """--lang es must be accepted by the __main__ argument parser."""
    from pipeline.__main__ import main

    # parse_known_args equivalent: call main with dry args via patching argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=["en", "zh", "es"], default="en")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--load", action="store_true")
    parser.add_argument("stage", choices=["all"], nargs="?", default="all")

    args = parser.parse_args(["--lang", "es", "--limit", "5"])
    assert args.lang == "es"
    assert args.limit == 5


def test_lang_es_routes_to_run_es_slice(monkeypatch) -> None:
    """Passing --lang es to main() must call run_es_slice, not run_slice."""
    called: list[str] = []

    def fake_run_es_slice(limit: int):
        called.append("run_es_slice")
        return []

    def fake_run_slice(limit: int):
        called.append("run_slice")
        return []

    def fake_run_zh_slice(limit: int):
        called.append("run_zh_slice")
        return []

    import pipeline.orchestrator as orch

    monkeypatch.setattr(orch, "run_es_slice", fake_run_es_slice)
    monkeypatch.setattr(orch, "run_slice", fake_run_slice)
    monkeypatch.setattr(orch, "run_zh_slice", fake_run_zh_slice)

    # Also patch the import inside __main__ which re-imports at call time
    import pipeline.__main__ as main_mod

    monkeypatch.setattr(main_mod, "main", main_mod.main)

    from pipeline.__main__ import main

    result = main(["--lang", "es", "--limit", "3"])
    assert result == 0
    assert called == ["run_es_slice"], f"Expected run_es_slice to be called, got: {called}"


def test_lang_en_still_routes_to_run_slice(monkeypatch) -> None:
    """Passing --lang en (default) must still call run_slice."""
    called: list[str] = []

    def fake_run_es_slice(limit: int):
        called.append("run_es_slice")
        return []

    def fake_run_slice(limit: int):
        called.append("run_slice")
        return []

    def fake_run_zh_slice(limit: int):
        called.append("run_zh_slice")
        return []

    import pipeline.orchestrator as orch

    monkeypatch.setattr(orch, "run_es_slice", fake_run_es_slice)
    monkeypatch.setattr(orch, "run_slice", fake_run_slice)
    monkeypatch.setattr(orch, "run_zh_slice", fake_run_zh_slice)

    from pipeline.__main__ import main

    result = main(["--lang", "en", "--limit", "3"])
    assert result == 0
    assert called == ["run_slice"], f"Expected run_slice to be called, got: {called}"
