"""End-to-end orchestrator: runs all pipeline stages for each headword and
produces a merged EntryRec.  Network-facing calls are wrapped in try/except so
a single flaky source never aborts a whole entry.
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import TYPE_CHECKING

from pipeline.acquire.frequency import frequency_for, select_headwords
from pipeline.config import settings
from pipeline.crawl.cambridge import fetch_cambridge, parse_cambridge
from pipeline.enrich.examples import fetch_tatoeba, parse_tatoeba
from pipeline.enrich.wikidata import cross_links_for, fetch_wikidata, image_for
from pipeline.es_build import build_es_entry, select_es_headwords
from pipeline.load.supabase_load import get_service_client, seed_sources, upsert_entry
from pipeline.merge import merge_entry
from pipeline.models.records import EntryRec, ExampleRec
from pipeline.parse.cmu import us_pronunciation
from pipeline.parse.wiktionary import fetch_wiktionary, parse_wiktionary
from pipeline.qa.coverage import coverage_report
from pipeline.zh_build import build_zh_entry, select_zh_headwords

if TYPE_CHECKING:
    from supabase import Client

# Inter-word delay for bulk crawls; overridable via PIPELINE_REQUEST_DELAY env var.
REQUEST_DELAY_SECONDS: float = float(os.environ.get("PIPELINE_REQUEST_DELAY", 1.0))


def build_entry(headword: str) -> EntryRec:
    """Run every pipeline stage for *headword* and return the merged EntryRec.

    Each external (network) call is wrapped in a try/except: on failure the
    stage result falls back to a safe empty value so one bad source never
    aborts the whole entry.
    """
    # Frequency — local, never fails in practice
    freq = frequency_for(headword)

    # Wiktionary — structural base
    try:
        wik_raw = fetch_wiktionary(headword)
        wik = parse_wiktionary(headword, wik_raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] wiktionary failed for {headword!r}: {exc}", file=sys.stderr)
        wik = parse_wiktionary(headword, {})

    # CMU pronunciation — local dict, rarely fails
    try:
        cmu = us_pronunciation(headword)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] cmu failed for {headword!r}: {exc}", file=sys.stderr)
        cmu = None

    # Cambridge crawler
    try:
        camb_html = fetch_cambridge(headword)
        camb = parse_cambridge(headword, camb_html)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] cambridge failed for {headword!r}: {exc}", file=sys.stderr)
        camb = {}

    # Tatoeba examples
    try:
        tat_raw = fetch_tatoeba(headword)
        ex: list[ExampleRec] = parse_tatoeba(headword, tat_raw)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] tatoeba failed for {headword!r}: {exc}", file=sys.stderr)
        ex = []

    # Wikidata (image + cross-links)
    try:
        wd = fetch_wikidata(headword)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] wikidata failed for {headword!r}: {exc}", file=sys.stderr)
        wd = {}

    try:
        img = image_for(headword, wd)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] image_for failed for {headword!r}: {exc}", file=sys.stderr)
        img = None

    try:
        xlinks = cross_links_for(headword, wd)
    except Exception as exc:  # noqa: BLE001
        print(f"[orchestrator] cross_links_for failed for {headword!r}: {exc}", file=sys.stderr)
        xlinks = []

    return merge_entry(headword, freq, wik, cmu, camb, ex, img, xlinks)


def run_slice(limit: int) -> list[EntryRec]:
    """Select *limit* headwords, build each entry, write JSONL, print coverage.

    Returns:
        The list of built EntryRec objects.
    """
    settings.ensure_dirs()
    headwords = select_headwords(limit)
    entries: list[EntryRec] = []
    for hw in headwords:
        entry = build_entry(hw)
        entries.append(entry)
        time.sleep(REQUEST_DELAY_SECONDS)

    # Write interim JSONL
    out_path = settings.INTERIM_DIR / "entries.jsonl"
    with out_path.open("w", encoding="utf-8") as fh:
        for entry in entries:
            fh.write(entry.model_dump_json() + "\n")

    # Print coverage report
    report = coverage_report(entries)
    print(json.dumps(report, ensure_ascii=False, indent=2))

    return entries


def run_zh_slice(limit: int) -> list[EntryRec]:
    """Select *limit* Chinese headwords, build each entry, write JSONL, print coverage.

    build_zh_entry is offline (uses local CC-CEDICT/Unihan), so no inter-word
    network delay is needed.

    Returns:
        The list of built EntryRec objects.
    """
    settings.ensure_dirs()
    headwords = select_zh_headwords(limit)
    entries: list[EntryRec] = []
    for hw in headwords:
        try:
            entry = build_zh_entry(hw)
            entries.append(entry)
        except Exception as exc:  # noqa: BLE001
            print(f"[orchestrator] zh_build failed for {hw!r}: {exc}", file=sys.stderr)

    # Write interim JSONL
    out_path = settings.INTERIM_DIR / "zh_entries.jsonl"
    with out_path.open("w", encoding="utf-8") as fh:
        for entry in entries:
            fh.write(entry.model_dump_json() + "\n")

    # Print coverage report
    report = coverage_report(entries)
    print(json.dumps(report, ensure_ascii=False, indent=2))

    return entries


def run_es_slice(limit: int) -> list[EntryRec]:
    """Select *limit* Spanish headwords, build each entry, write JSONL, print coverage.

    Each entry is fetched from en.wiktionary.org (Spanish section) and
    conjugated via verbecc when a verb sense is detected.  A polite delay of
    REQUEST_DELAY_SECONDS is inserted between words to avoid hammering the
    Wiktionary API.

    Returns:
        The list of built EntryRec objects.
    """
    settings.ensure_dirs()
    headwords = select_es_headwords(limit)
    entries: list[EntryRec] = []
    for hw in headwords:
        try:
            entry = build_es_entry(hw)
            entries.append(entry)
        except Exception as exc:  # noqa: BLE001
            print(f"[orchestrator] es_build failed for {hw!r}: {exc}", file=sys.stderr)
        time.sleep(REQUEST_DELAY_SECONDS)

    # Write interim JSONL
    out_path = settings.INTERIM_DIR / "es_entries.jsonl"
    with out_path.open("w", encoding="utf-8") as fh:
        for entry in entries:
            fh.write(entry.model_dump_json() + "\n")

    # Print coverage report
    report = coverage_report(entries)
    print(json.dumps(report, ensure_ascii=False, indent=2))

    return entries


def load_all(entries: list[EntryRec], client: "Client | None" = None) -> int:
    """Load *entries* into Supabase via the service-role client.

    Args:
        entries: Entries to load.
        client:  Optional injectable Supabase client (for testing). If None,
                 a live service-role client is created from env vars.

    Returns:
        Number of entries loaded.
    """
    client = client or get_service_client()
    seed_sources(client)
    for e in entries:
        upsert_entry(client, e)
    return len(entries)
