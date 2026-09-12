# Phase 3 Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python ETL pipeline that assembles a rich English vocabulary bank from multiple sources and loads it into the Supabase `lex` schema, proving the full pipeline end-to-end on a small batch of words.

**Architecture:** A staged pipeline (acquire → parse → normalize → merge → enrich → load → QA). Each stage reads and writes file artifacts under `data/interim/` so runs are reproducible and resumable. Heavy work runs locally in Python; only the load stage writes to Supabase. Sources are tagged `open` (bulk dumps / open APIs) or `personal` (crawled dictionary sites). The English slice validates the schema; Chinese and Spanish reuse the same pipeline later (out of scope here).

**Tech Stack:** Python 3.14, pydantic v2, requests, beautifulsoup4 (builtin `html.parser`), wordfreq, cmudict, supabase-py, pytest. Supabase Postgres (project `cvltsyoweddhpkomuevz`).

## Global Constraints

- Python 3.14 in a local venv at `.venv`; dependencies pinned in `requirements.txt`. Keep dependencies minimal; avoid C-extension-heavy libs (use BeautifulSoup with the builtin `html.parser`, not `lxml`; do not use pandas).
- Type hints everywhere; intermediate records are pydantic v2 models. No `Any` in production code.
- **No fabricated parser code.** For any stage that reads external data (Wiktionary, CMU, Tatoeba, Cambridge, Wikidata), the implementer MUST first fetch one real sample, save it as a fixture under `pipeline/tests/fixtures/`, then TDD the parser against that fixture. Do not invent HTML selectors or JSON shapes.
- Every emitted record carries `source_id` and `tier` (`open` or `personal`). Crawled dictionary data is `personal`; dumps/open APIs are `open`.
- Audio and images are stored as URLs only, never as blobs.
- Loads are idempotent: upsert keyed on stable ids (`en:<headword>` for entries, `<entry_id>#<n>` for senses). Re-running must not duplicate rows.
- Polite crawling: max ~1 request/second per host, cache every HTTP response under `data/raw/cache/`, send a descriptive User-Agent. Cached responses are reused on re-runs.
- pytest for all tests; pure logic (normalize, merge, banding, ARPAbet→IPA) is TDD-first.
- Commit after each task. Scope is the English vertical slice only.

---

## File Structure

- `requirements.txt` — pinned dependencies.
- `pipeline/__init__.py`, `pipeline/__main__.py` — package + CLI orchestrator.
- `pipeline/config.py` — paths, env loading (Supabase url/keys), constants.
- `pipeline/models/records.py` — pydantic intermediate-representation models.
- `pipeline/sources.py` — source catalog (id, name, url, license, tier).
- `pipeline/acquire/frequency.py` — headword selection + frequency via wordfreq.
- `pipeline/acquire/http.py` — cached, rate-limited HTTP client shared by fetchers/crawlers.
- `pipeline/parse/wiktionary.py`, `pipeline/parse/cmu.py` — source parsers.
- `pipeline/crawl/cambridge.py` — Cambridge crawler+parser (tier=personal).
- `pipeline/enrich/examples.py` — Tatoeba example sentences.
- `pipeline/enrich/wikidata.py` — images (P18) + cross-language links (Lexemes).
- `pipeline/normalize.py` — POS/IPA normalization, frequency banding, dedup.
- `pipeline/merge.py` — combine per-headword records into Entry trees with provenance.
- `pipeline/load/supabase_load.py` — idempotent upsert into `lex`.
- `pipeline/qa/coverage.py` — coverage report.
- `supabase/migrations/0003_lex_schema.sql` — `lex` schema + RLS.
- `pipeline/tests/` — unit tests + fixtures.
- `data/raw/`, `data/interim/`, `data/manifest.json` — artifacts (gitignored except a `.gitkeep`).

---

### Task 1: Project scaffold, config, and test harness

**Files:**
- Create: `requirements.txt`, `pipeline/__init__.py`, `pipeline/__main__.py`, `pipeline/config.py`, `pipeline/tests/__init__.py`, `pipeline/tests/test_config.py`
- Modify: `.gitignore` (add `.venv/`, `data/raw/`, `data/interim/`, `__pycache__/`, `*.pyc`, `.env`)
- Create: `data/.gitkeep`

**Interfaces:**
- Produces: `pipeline.config.settings` with attributes `RAW_DIR`, `INTERIM_DIR`, `CACHE_DIR`, `MANIFEST_PATH` (all `pathlib.Path`), `SUPABASE_URL: str | None`, `SUPABASE_SERVICE_ROLE_KEY: str | None`, and `ensure_dirs() -> None`.

- [ ] **Step 1: Write `requirements.txt`**

```
pydantic>=2.7
requests>=2.32
beautifulsoup4>=4.12
wordfreq>=3.1
cmudict>=1.0
supabase>=2.4
pytest>=8.0
```

- [ ] **Step 2: Create the venv and install**

Run: `py -m venv .venv && .venv\Scripts\python.exe -m pip install -U pip -r requirements.txt`
Expected: all packages install. If any package lacks a Python 3.14 wheel, pin the nearest version that does and note it in the report; if none works, fall back to creating the venv with `py -3.13` and record that decision.

- [ ] **Step 3: Write `pipeline/config.py`**

```python
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
```

- [ ] **Step 4: Write `pipeline/__main__.py`** (minimal CLI, stages wired in later tasks)

```python
from __future__ import annotations
import argparse
from pipeline.config import settings

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline", description="Zhesen data pipeline")
    parser.add_argument("--limit", type=int, default=50, help="number of headwords to process")
    parser.add_argument("stage", choices=["all"], nargs="?", default="all")
    args = parser.parse_args(argv)
    settings.ensure_dirs()
    print(f"pipeline ready (stage={args.stage}, limit={args.limit})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Write `pipeline/tests/test_config.py`**

```python
from pipeline.config import settings

def test_settings_paths_under_root():
    assert settings.RAW_DIR.is_relative_to(settings.ROOT)
    assert settings.INTERIM_DIR.name == "interim"

def test_ensure_dirs_creates(tmp_path, monkeypatch):
    settings.ensure_dirs()
    assert settings.CACHE_DIR.exists()
```

- [ ] **Step 6: Run tests + CLI**

Run: `.venv\Scripts\python.exe -m pytest pipeline/tests/test_config.py -v`
Expected: PASS.
Run: `.venv\Scripts\python.exe -m pipeline --limit 5`
Expected: prints `pipeline ready (stage=all, limit=5)`.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt pipeline .gitignore data/.gitkeep
git commit -m "feat(pipeline): scaffold python ETL project"
```

---

### Task 2: Pydantic intermediate-representation models

**Files:**
- Create: `pipeline/models/__init__.py`, `pipeline/models/records.py`, `pipeline/tests/test_models.py`

**Interfaces:**
- Produces: pydantic models `SourceRef`, `PronunciationRec`, `SenseRec`, `InflectionRec`, `RelationRec`, `ExampleRec`, `ImageRec`, `CrossLinkRec`, and the aggregate `EntryRec`. Field names mirror the `lex` schema columns (mid-design spec §5). `EntryRec` holds lists of its children. `tier` is a `Literal["open","personal"]`. Later tasks import these.

- [ ] **Step 1: Write the failing test** `pipeline/tests/test_models.py`

```python
import pytest
from pydantic import ValidationError
from pipeline.models.records import EntryRec, SenseRec, PronunciationRec

def test_entry_minimal_ok():
    e = EntryRec(id="en:dog", lang="en", entry_type="word",
                 headword="dog", headword_normalized="dog", source_id="wiktionary-en", tier="open")
    assert e.senses == [] and e.frequency_rank is None

def test_sense_requires_order():
    with pytest.raises(ValidationError):
        SenseRec(id="en:dog#1", entry_id="en:dog")  # missing sense_order

def test_tier_literal_rejects_bad_value():
    with pytest.raises(ValidationError):
        PronunciationRec(entry_id="en:dog", accent="en-US", tier="public")
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv\Scripts\python.exe -m pytest pipeline/tests/test_models.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `pipeline/models/records.py`**

```python
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

Tier = Literal["open", "personal"]

class PronunciationRec(BaseModel):
    entry_id: str
    accent: str
    ipa: str | None = None
    audio_url: str | None = None
    audio_source: str | None = None
    source_id: str | None = None
    tier: Tier = "open"

class SenseRec(BaseModel):
    id: str
    entry_id: str
    pos: str | None = None
    sense_order: int
    gloss_vi: str | None = None
    gloss_vi_is_mt: bool = False
    gloss_en: str | None = None
    register: str | None = None
    domain: str | None = None
    source_id: str | None = None

class InflectionRec(BaseModel):
    entry_id: str
    form_text: str
    ipa: str | None = None
    mood: str | None = None
    tense: str | None = None
    person: int | None = None
    number: str | None = None
    gender: str | None = None
    degree: str | None = None
    form_label: str | None = None
    source_id: str | None = None

class RelationRec(BaseModel):
    entry_id: str
    related_entry_id: str | None = None
    related_text: str | None = None
    relation_type: str
    source_id: str | None = None

class ExampleRec(BaseModel):
    sense_id: str | None = None
    entry_id: str | None = None
    text: str
    reading: str | None = None
    translation_vi: str | None = None
    translation_en: str | None = None
    audio_url: str | None = None
    audio_source: str | None = None
    source_id: str | None = None
    tier: Tier = "open"

class ImageRec(BaseModel):
    sense_id: str
    url: str
    thumbnail_url: str | None = None
    source_id: str | None = None
    license: str | None = None
    attribution: str | None = None
    tier: Tier = "open"

class CrossLinkRec(BaseModel):
    from_entry_id: str
    to_entry_id: str | None = None
    from_sense_id: str | None = None
    to_sense_id: str | None = None
    link_type: str = "translation"
    concept_id: str | None = None
    source_id: str | None = None

class EntryRec(BaseModel):
    id: str
    lang: str
    entry_type: Literal["word", "phrase", "idiom", "collocation"] = "word"
    headword: str
    headword_normalized: str
    traditional: str | None = None
    frequency_rank: int | None = None
    frequency_band: str | None = None
    level: str | None = None
    level_is_estimated: bool = False
    etymology: str | None = None
    attributes: dict = Field(default_factory=dict)
    source_id: str | None = None
    provenance: dict = Field(default_factory=dict)
    senses: list[SenseRec] = Field(default_factory=list)
    pronunciations: list[PronunciationRec] = Field(default_factory=list)
    inflections: list[InflectionRec] = Field(default_factory=list)
    relations: list[RelationRec] = Field(default_factory=list)
    examples: list[ExampleRec] = Field(default_factory=list)
    images: list[ImageRec] = Field(default_factory=list)
    cross_links: list[CrossLinkRec] = Field(default_factory=list)
```

Also create `pipeline/models/__init__.py` re-exporting the records.

- [ ] **Step 4: Run tests** — Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): pydantic intermediate models"`

---

### Task 3: Supabase `lex` schema migration

**Files:**
- Create: `supabase/migrations/0003_lex_schema.sql`

**Interfaces:**
- Produces: the `lex` schema (13 tables from spec §5) with RLS enabled and a `SELECT`-for-`authenticated` policy on every table. Bigint identity PKs where the spec uses them; text PKs for `entries`/`senses`/`sources`/`grammar_concepts`/`characters`.

- [ ] **Step 1: Write the migration** — transcribe the DDL from spec §5 verbatim into `0003_lex_schema.sql`, then append for EACH of the 13 tables:

```sql
alter table lex.<table> enable row level security;
create policy "lex_<table>_select_auth" on lex.<table>
  for select to authenticated using (true);
```

Add helpful indexes: `create index on lex.senses (entry_id);`, `create index on lex.pronunciations (entry_id);`, `create index on lex.examples (sense_id);`, `create index on lex.entries (lang, frequency_rank);`, `create index on lex.entry_characters (char);`.

- [ ] **Step 2: Apply the migration** via the Supabase MCP `apply_migration` (name `lex_schema`, the file contents as query). This runs with elevated privileges and bypasses RLS.

- [ ] **Step 3: Verify** with the Supabase MCP `list_tables` (schema `lex`) — expect all 13 tables present — and `execute_sql`: `select count(*) from lex.entries;` returns 0 without error.

- [ ] **Step 4: Commit** — `git commit -m "feat(db): add lex schema migration"`

---

### Task 4: Source catalog

**Files:**
- Create: `pipeline/sources.py`, `pipeline/tests/test_sources.py`

**Interfaces:**
- Produces: `SOURCES: dict[str, SourceRow]` and `seed_rows() -> list[dict]`. `SourceRow` fields: `id, name, url, license, tier, notes`. Ids used elsewhere: `wiktionary-en` (open, CC BY-SA 4.0), `cambridge` (personal, proprietary), `cmudict` (open, BSD-2), `wordfreq` (open, MIT/various), `tatoeba` (open, CC BY 2.0 FR), `wikidata-lexemes` (open, CC0), `wikimedia-commons` (open, varies).

- [ ] **Step 1: Write test** asserting `len(SOURCES) >= 7`, `SOURCES["cambridge"].tier == "personal"`, all others `tier == "open"`, and every `seed_rows()` item has non-empty `id` and `license`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `pipeline/sources.py` with a frozen dataclass `SourceRow` and the dict above; `seed_rows()` returns `[asdict(s) for s in SOURCES.values()]`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): source catalog"`

---

### Task 5: Acquire stage — headwords + frequency (wordfreq)

**Files:**
- Create: `pipeline/acquire/__init__.py`, `pipeline/acquire/frequency.py`, `pipeline/tests/test_frequency.py`

**Interfaces:**
- Consumes: `wordfreq.top_n_list`, `wordfreq.zipf_frequency`.
- Produces: `select_headwords(limit: int) -> list[str]` (top-N English lemmas, lowercased, alphabetic only) and `frequency_for(word: str) -> tuple[int | None, str]` returning `(rank, band)` where band ∈ {`very_common`,`common`,`uncommon`,`rare`} mapped from zipf (`>=5 very_common`, `>=4 common`, `>=3 uncommon`, else `rare`). Writes `data/interim/headwords.jsonl` with `{headword, frequency_rank, frequency_band}` per line.

- [ ] **Step 1: Write test** — `select_headwords(10)` returns 10 distinct lowercased alphabetic words containing `"the"`; `frequency_for("the")[1] == "very_common"`; banding boundaries via a small monkeypatched zipf.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the functions and a `run(limit)` that writes the JSONL artifact.
- [ ] **Step 4: Run — PASS.** Then `.venv\Scripts\python.exe -c "from pipeline.acquire.frequency import run; run(20)"` and confirm `data/interim/headwords.jsonl` has 20 lines.
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): headword selection via wordfreq"`

---

### Task 6: Cached rate-limited HTTP client

**Files:**
- Create: `pipeline/acquire/http.py`, `pipeline/tests/test_http.py`

**Interfaces:**
- Produces: `get(url: str, *, host_key: str, force: bool = False) -> str`. Caches response text at `CACHE_DIR/<host_key>/<sha1(url)>.html`; on cache hit returns cached text without a network call. Enforces ≥1.0s between live requests per `host_key`. Sets header `User-Agent: zhesen-langlearn/0.1 (personal study project)`.

- [ ] **Step 1: Write test** (no network): monkeypatch the internal `_fetch` to a counter; first `get` writes cache and calls `_fetch` once; second `get` (same url) returns cached text and does NOT call `_fetch`; `force=True` re-fetches.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** with `requests`, `hashlib.sha1`, a module-level `dict[str, float]` of last-request timestamps, `time.sleep` to honor the gap. Keep the network call isolated in `_fetch(url)` so tests can patch it.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): cached rate-limited http client"`

---

### Task 7: Wiktionary source (per-word) → records

**Files:**
- Create: `pipeline/parse/__init__.py`, `pipeline/parse/wiktionary.py`, `pipeline/tests/test_wiktionary.py`, `pipeline/tests/fixtures/wiktionary_dog.json`

**Interfaces:**
- Consumes: `EntryRec` and child records; the `wiktionaryparser` library OR the en.wiktionary REST API via `pipeline.acquire.http`.
- Produces: `parse_wiktionary(headword: str, raw: list[dict]) -> EntryRec` mapping definitions to `SenseRec` (pos, gloss_en=definition text, sense_order by position), related words to `RelationRec`, and pronunciations to `PronunciationRec` (accent `en-UK`/`en-US` when distinguishable, IPA + audio_url). All `source_id="wiktionary-en"`, `tier="open"`.

- [ ] **Step 1: Acquire a real sample.** Run `wiktionaryparser` (or the REST API) for the word `dog`, save the raw JSON to `pipeline/tests/fixtures/wiktionary_dog.json`. Inspect its actual shape before writing the parser. (This satisfies the no-fabrication constraint.)
- [ ] **Step 2: Write the failing test** that loads the fixture, calls `parse_wiktionary("dog", fixture)`, and asserts: `entry.id == "en:dog"`, at least one noun sense with non-empty `gloss_en`, `sense_order` starts at 1, at least one pronunciation with an IPA string, and every child `source_id == "wiktionary-en"`.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** `parse_wiktionary` against the real fixture shape, plus a thin `fetch_wiktionary(headword)` wrapper (cached) used by the orchestrator.
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): wiktionary parser"`

---

### Task 8: CMU pronouncing dictionary → US pronunciation

**Files:**
- Create: `pipeline/parse/cmu.py`, `pipeline/tests/test_cmu.py`

**Interfaces:**
- Consumes: the `cmudict` library.
- Produces: `arpabet_to_ipa(phones: list[str]) -> str` (complete ARPAbet→IPA mapping, stress digits stripped) and `us_pronunciation(headword: str) -> PronunciationRec | None` (accent `en-US`, `source_id="cmudict"`, `tier="open"`, `ipa` from the first CMU variant; `None` if absent).

- [ ] **Step 1: Write test** — `arpabet_to_ipa(["D","AO1","G"]) == "dɔɡ"` (adjust expected to your mapping, but assert it is non-empty and contains no digits); `us_pronunciation("dog")` returns a `PronunciationRec` with `accent=="en-US"` and non-empty `ipa`; `us_pronunciation("zzzznotaword")` is `None`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the full ARPAbet→IPA table (all 39 phonemes) and the lookup.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): cmudict us pronunciation"`

---

### Task 9: Cambridge crawler (CEFR, Anh-Việt gloss, UK/US IPA + audio)

**Files:**
- Create: `pipeline/crawl/__init__.py`, `pipeline/crawl/cambridge.py`, `pipeline/tests/test_cambridge.py`, `pipeline/tests/fixtures/cambridge_dog.html`

**Interfaces:**
- Consumes: `pipeline.acquire.http.get` (host_key `cambridge`), BeautifulSoup (`html.parser`).
- Produces: `parse_cambridge(headword: str, html: str) -> dict` with keys `level` (CEFR e.g. `B1` or None), `gloss_vi` (list of Vietnamese glosses), `pronunciations` (list of `PronunciationRec` accent `en-UK`/`en-US` with ipa + audio_url), and `examples` (list of `ExampleRec`). All `source_id="cambridge"`, `tier="personal"`. Plus `fetch_cambridge(headword) -> str` (cached) using the english-vietnamese dictionary URL.

- [ ] **Step 1: Acquire a real sample.** Fetch the Cambridge english-vietnamese page for `dog`, save HTML to the fixture. Inspect the real DOM (class names like `.pos`, `.ipa`, `.epp-xref`/CEFR badge, `.trans`, `.eg`) before writing selectors.
- [ ] **Step 2: Write the failing test** against the fixture asserting: at least one `en-UK` and/or `en-US` pronunciation with non-empty `ipa`, at least one Vietnamese gloss, every produced record `tier=="personal"`. Make selector-specific assertions only after inspecting the fixture.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** `parse_cambridge` against the real DOM, and `fetch_cambridge` (cached, rate-limited).
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): cambridge crawler"`

---

### Task 10: Tatoeba example sentences

**Files:**
- Create: `pipeline/enrich/__init__.py`, `pipeline/enrich/examples.py`, `pipeline/tests/test_examples.py`, `pipeline/tests/fixtures/tatoeba_dog.json`

**Interfaces:**
- Consumes: Tatoeba API (`https://tatoeba.org/en/api_v0/search?from=eng&to=vie&query=<word>`) via cached http; `ExampleRec`.
- Produces: `parse_tatoeba(headword: str, raw: dict) -> list[ExampleRec]` (English `text`, Vietnamese `translation_vi` when a vie translation exists, `audio_url` when present, `source_id="tatoeba"`, `tier="open"`), capped at 5 examples per headword. `fetch_tatoeba(headword) -> dict` (cached).

- [ ] **Step 1: Acquire a real sample** for `dog`, save JSON fixture, inspect shape (results → translations array; audio under sentence `audios`).
- [ ] **Step 2: Write the failing test** against the fixture: returns ≤5 `ExampleRec`, each with non-empty `text` and `source_id=="tatoeba"`; at least one has `translation_vi`.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): tatoeba examples"`

---

### Task 11: Wikidata enrichment — images + cross-language links

**Files:**
- Create: `pipeline/enrich/wikidata.py`, `pipeline/tests/test_wikidata.py`, `pipeline/tests/fixtures/wikidata_dog.json`

**Interfaces:**
- Consumes: Wikidata REST/SPARQL via cached http; `ImageRec`, `CrossLinkRec`.
- Produces: `image_for(headword: str, raw: dict) -> ImageRec | None` (Commons image URL from P18, `source_id="wikimedia-commons"`) and `cross_links_for(headword: str, raw: dict) -> list[CrossLinkRec]` (es/zh equivalents from the lexeme/item, `source_id="wikidata-lexemes"`). Best-effort: return `None`/`[]` when data is absent. Fetchers cached.

- [ ] **Step 1: Acquire a real sample** for `dog` (item Q144 / its lexeme), save JSON fixture, inspect P18 + translation structure.
- [ ] **Step 2: Write the failing test** against the fixture: `image_for` returns an `ImageRec` whose `url` contains `commons`/`upload.wikimedia.org`; `cross_links_for` returns links including a Spanish or Chinese target; absent-data inputs yield `None`/`[]`.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** (image attached at enrichment time to the entry's first noun sense by the merge/orchestrator).
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(pipeline): wikidata images + cross-links"`

---

### Task 12: Normalize stage

**Files:**
- Create: `pipeline/normalize.py`, `pipeline/tests/test_normalize.py`

**Interfaces:**
- Produces: `normalize_pos(raw_pos: str) -> str | None` (map Wiktionary/Cambridge POS spellings to a canonical set: `noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, determiner, numeral`); `clean_ipa(s: str) -> str` (strip slashes/brackets/whitespace); `dedup_senses(senses: list[SenseRec]) -> list[SenseRec]` (drop senses with identical `(pos, gloss_en)`, renumber `sense_order` from 1). Pure functions.

- [ ] **Step 1: Write tests** covering each function incl. an unknown POS → `None`, `clean_ipa("/dɔɡ/") == "dɔɡ"`, and dedup collapsing duplicates and renumbering.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): normalize helpers"`

---

### Task 13: Merge stage

**Files:**
- Create: `pipeline/merge.py`, `pipeline/tests/test_merge.py`

**Interfaces:**
- Consumes: `EntryRec` (Wiktionary base), `PronunciationRec` (CMU US), the Cambridge dict, Tatoeba `ExampleRec` list, Wikidata `ImageRec`/`CrossLinkRec`.
- Produces: `merge_entry(headword, freq, wiktionary, cmu_pron, cambridge, examples, image, cross_links) -> EntryRec`. Precedence: Wiktionary is the structural base; add CMU US pronunciation if Wiktionary lacks `en-US`; take `level` and `gloss_vi` from Cambridge (attach Vietnamese gloss to matching/first senses, `gloss_vi_is_mt=False`); attach examples to the first sense; attach the image to the first noun sense; set `frequency_rank`/`frequency_band` from freq; record per-field origin in `provenance`. Pure function (no I/O).

- [ ] **Step 1: Write tests** with small hand-built inputs: result has both `en-UK` (Wiktionary) and `en-US` (CMU) pronunciations; `level` comes from Cambridge; `frequency_band` set; `provenance` records `level -> "cambridge"`; image attached to a noun sense only.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(pipeline): merge stage"`

---

### Task 14: Load stage, orchestrator, QA, end-to-end run

**Files:**
- Create: `pipeline/load/__init__.py`, `pipeline/load/supabase_load.py`, `pipeline/qa/__init__.py`, `pipeline/qa/coverage.py`, `pipeline/tests/test_load.py`, `pipeline/tests/test_coverage.py`
- Modify: `pipeline/__main__.py` (wire acquire→parse→merge→enrich→load→qa), `.env` (add `SUPABASE_SERVICE_ROLE_KEY` — gitignored; the user supplies it from the Supabase dashboard, Project Settings → API)

**Interfaces:**
- Consumes: `supabase` client (service role key, bypasses RLS), all prior stages.
- Produces: `upsert_entry(client, entry: EntryRec) -> None` (idempotent upserts into `lex.entries` then children, keyed on stable ids; deletes-then-inserts identity-PK children for that entry to stay idempotent); `coverage_report(entries: list[EntryRec]) -> dict` (counts + percentages: has_ipa, has_gloss_vi, has_example, has_audio, has_image-among-nouns, band distribution).

- [ ] **Step 1: Write `coverage_report` test** with two hand-built entries asserting the percentage math.
- [ ] **Step 2: Write `upsert_entry` test** using a fake client (records calls) asserting entries upsert before children and that a second call with the same entry does not create duplicate child rows (delete-then-insert path invoked).
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** `coverage_report`, `upsert_entry` (using `client.schema("lex").table(...).upsert(...)`), and wire `pipeline/__main__.py` to run the full slice for `--limit N`, writing merged entries to `data/interim/entries.jsonl`, loading them, and printing the coverage report.
- [ ] **Step 5: Run unit tests — PASS.**
- [ ] **Step 6: End-to-end smoke run.** Ensure `SUPABASE_SERVICE_ROLE_KEY` is set, then `.venv\Scripts\python.exe -m pipeline --limit 10`. Expected: completes, prints coverage report, writes `entries.jsonl`.
- [ ] **Step 7: Verify in Supabase** via MCP `execute_sql`: `select count(*) from lex.entries;` ≥ 10; spot-check one entry has senses, pronunciations, and (for a noun) an image; re-run `--limit 10` and confirm counts do not double (idempotency).
- [ ] **Step 8: Commit** — `git commit -m "feat(pipeline): load + qa + end-to-end english slice"`

---

## Notes for the executor

- Tasks 7, 9, 10, 11 each begin by fetching ONE real sample into a fixture; never write selectors/shape-handling before inspecting the real data.
- If a chosen library lacks a Python 3.14 wheel, pin a working version or recreate the venv on 3.13 and record it.
- Scaling from the small batch to the full top-N, and replicating to Chinese/Spanish, are follow-on plans, not part of this one.
