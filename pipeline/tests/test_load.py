"""Unit tests for pipeline.load.supabase_load — fake client, no network, no DB."""
from __future__ import annotations

import pytest

from pipeline.models.records import (
    EntryRec,
    ExampleRec,
    ImageRec,
    PronunciationRec,
    RelationRec,
    SenseRec,
)
from pipeline.load.supabase_load import entry_to_rows, upsert_entry
from pipeline.orchestrator import load_all


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------

class FakeResp:
    """Minimal stand-in for a Supabase APIResponse."""
    pass


class FakeTable:
    def __init__(self, log: list[tuple[object, ...]], name: str) -> None:
        self.log = log
        self.name = name

    def delete(self) -> "FakeTable":
        self.log.append(("delete", self.name))
        return self

    def eq(self, k: str, v: object) -> "FakeTable":
        self.log.append(("eq", self.name, k, v))
        return self

    def insert(self, rows: list[dict]) -> "FakeTable":
        self.log.append(("insert", self.name, len(rows)))
        return self

    def upsert(self, rows: list[dict], **kwargs: object) -> "FakeTable":
        self.log.append(("upsert", self.name, len(rows)))
        return self

    def execute(self) -> FakeResp:
        return FakeResp()


class FakeSchema:
    def __init__(self, log: list[tuple[object, ...]]) -> None:
        self.log = log

    def table(self, name: str) -> FakeTable:
        return FakeTable(self.log, name)


class FakeClient:
    def __init__(self) -> None:
        self.log: list[tuple[object, ...]] = []

    def schema(self, name: str) -> FakeSchema:
        return FakeSchema(self.log)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rich_entry() -> EntryRec:
    """Entry with 1 sense + 1 pronunciation + 1 example + 1 image."""
    sense = SenseRec(id="en:dog:s0", entry_id="en:dog", pos="noun", sense_order=0, gloss_vi="chó")
    pron = PronunciationRec(entry_id="en:dog", accent="en-US", ipa="/dɒɡ/")
    example = ExampleRec(entry_id="en:dog", text="The dog barked.")
    image = ImageRec(sense_id="en:dog:s0", url="https://ex.com/dog.jpg")
    return EntryRec(
        id="en:dog",
        lang="en",
        headword="dog",
        headword_normalized="dog",
        senses=[sense],
        pronunciations=[pron],
        examples=[example],
        images=[image],
    )


# ---------------------------------------------------------------------------
# Tests for entry_to_rows
# ---------------------------------------------------------------------------

class TestEntryToRows:
    def setup_method(self) -> None:
        self.entry = _rich_entry()
        self.rows = entry_to_rows(self.entry)

    def test_has_expected_table_keys(self) -> None:
        expected = {
            "entries", "senses", "pronunciations", "inflections",
            "lex_relations", "examples", "images", "cross_language_links",
            "characters", "entry_characters",
        }
        assert set(self.rows.keys()) == expected

    def test_entries_one_row(self) -> None:
        assert len(self.rows["entries"]) == 1
        row = self.rows["entries"][0]
        assert row["id"] == "en:dog"
        assert row["headword"] == "dog"
        # Child lists must NOT appear in the entries row
        assert "senses" not in row
        assert "pronunciations" not in row

    def test_senses_count(self) -> None:
        assert len(self.rows["senses"]) == 1
        assert self.rows["senses"][0]["id"] == "en:dog:s0"

    def test_pronunciations_count(self) -> None:
        assert len(self.rows["pronunciations"]) == 1

    def test_examples_count(self) -> None:
        assert len(self.rows["examples"]) == 1

    def test_images_count(self) -> None:
        assert len(self.rows["images"]) == 1

    def test_inflections_empty(self) -> None:
        assert self.rows["inflections"] == []

    def test_lex_relations_key(self) -> None:
        """relations field on EntryRec → table key 'lex_relations'."""
        assert "lex_relations" in self.rows
        assert self.rows["lex_relations"] == []

    def test_cross_language_links_key(self) -> None:
        """cross_links field on EntryRec → table key 'cross_language_links'."""
        assert "cross_language_links" in self.rows
        assert self.rows["cross_language_links"] == []

    def test_relations_populated(self) -> None:
        rel = RelationRec(entry_id="en:dog", related_text="canine", relation_type="synonym")
        entry = self.entry.model_copy(update={"relations": [rel]})
        rows = entry_to_rows(entry)
        assert len(rows["lex_relations"]) == 1

    def test_cross_links_populated(self) -> None:
        from pipeline.models.records import CrossLinkRec
        xl = CrossLinkRec(from_entry_id="en:dog", to_entry_id="vi:chó", link_type="translation")
        entry = self.entry.model_copy(update={"cross_links": [xl]})
        rows = entry_to_rows(entry)
        assert len(rows["cross_language_links"]) == 1


# ---------------------------------------------------------------------------
# Tests for upsert_entry
# ---------------------------------------------------------------------------

class TestUpsertEntry:
    def setup_method(self) -> None:
        self.entry = _rich_entry()

    def _upsert(self) -> list:
        client = FakeClient()
        upsert_entry(client, self.entry)
        return client.log

    def test_first_op_is_delete_on_entries(self) -> None:
        log = self._upsert()
        assert log[0] == ("delete", "entries")

    def test_second_op_is_eq_with_id(self) -> None:
        log = self._upsert()
        assert log[1] == ("eq", "entries", "id", "en:dog")

    def test_entries_inserted(self) -> None:
        log = self._upsert()
        inserts = [(op, tbl) for op, tbl, *_ in log if op == "insert"]
        tables = [tbl for _, tbl in inserts]
        assert "entries" in tables

    def test_entries_inserted_before_senses(self) -> None:
        log = self._upsert()
        inserts = [tbl for op, tbl, *_ in log if op == "insert"]
        assert inserts.index("entries") < inserts.index("senses")

    def test_senses_inserted_before_images(self) -> None:
        log = self._upsert()
        inserts = [tbl for op, tbl, *_ in log if op == "insert"]
        assert inserts.index("senses") < inserts.index("images")

    def test_senses_inserted_before_examples(self) -> None:
        log = self._upsert()
        inserts = [tbl for op, tbl, *_ in log if op == "insert"]
        assert inserts.index("senses") < inserts.index("examples")

    def test_idempotent_same_pattern_on_second_call(self) -> None:
        client = FakeClient()
        upsert_entry(client, self.entry)
        log1 = list(client.log)
        client.log.clear()
        upsert_entry(client, self.entry)
        log2 = list(client.log)
        # Pattern should be identical on both calls
        assert log1 == log2

    def test_delete_precedes_insert_on_each_call(self) -> None:
        client = FakeClient()
        for _ in range(2):
            client.log.clear()
            upsert_entry(client, self.entry)
            log = client.log
            delete_pos = next(i for i, ev in enumerate(log) if ev[0] == "delete")
            first_insert_pos = next(i for i, ev in enumerate(log) if ev[0] == "insert")
            assert delete_pos < first_insert_pos

    def test_empty_tables_skipped(self) -> None:
        """inflections and lex_relations are empty → no insert for them."""
        log = self._upsert()
        inserted_tables = {tbl for op, tbl, *_ in log if op == "insert"}
        assert "inflections" not in inserted_tables
        assert "lex_relations" not in inserted_tables
        assert "cross_language_links" not in inserted_tables

    def test_insert_row_counts(self) -> None:
        log = self._upsert()
        insert_map: dict[str, int] = {
            ev[1]: ev[2] for ev in log if ev[0] == "insert"
        }
        assert insert_map["entries"] == 1
        assert insert_map["senses"] == 1
        assert insert_map["pronunciations"] == 1
        assert insert_map["examples"] == 1
        assert insert_map["images"] == 1


# ---------------------------------------------------------------------------
# Tests for load_all (sources seeding + ordering)
# ---------------------------------------------------------------------------

class TestLoadAll:
    def test_sources_seeded_before_entries(self) -> None:
        """load_all must upsert lex.sources BEFORE any entries insert."""
        entry = _rich_entry()
        client = FakeClient()
        result = load_all([entry], client)

        # Check return value
        assert result == 1

        # Find positions of the sources upsert and the first entries insert
        sources_upsert_pos: int | None = None
        entries_insert_pos: int | None = None
        for i, ev in enumerate(client.log):
            if ev[0] == "upsert" and ev[1] == "sources" and sources_upsert_pos is None:
                sources_upsert_pos = i
            if ev[0] == "insert" and ev[1] == "entries" and entries_insert_pos is None:
                entries_insert_pos = i

        assert sources_upsert_pos is not None, "sources upsert not found in log"
        assert entries_insert_pos is not None, "entries insert not found in log"
        assert sources_upsert_pos < entries_insert_pos, (
            f"sources upsert (pos {sources_upsert_pos}) must precede "
            f"entries insert (pos {entries_insert_pos})"
        )


# ---------------------------------------------------------------------------
# Tests for Chinese character load (characters + entry_characters)
# ---------------------------------------------------------------------------

def _zh_entry_with_chars() -> EntryRec:
    """EntryRec with attributes['characters'] list (one char: 狗)."""
    return EntryRec(
        id="zh:狗",
        lang="zh",
        headword="狗",
        headword_normalized="狗",
        source_id="cc-cedict",
        attributes={
            "pinyin": "gǒu",
            "characters": [
                {
                    "char": "狗",
                    "position": 0,
                    "radical": "94",
                    "stroke_count": 5,
                    "pinyin": ["gǒu"],
                    "cantonese": ["gau2"],
                    "han_viet": ["cẩu"],
                    "gloss": "dog",
                    "simplified_variant": None,
                    "traditional_variant": None,
                }
            ],
        },
    )


class TestZhCharacterLoad:
    """Fake-client tests for the per-character table load path."""

    def _upsert_zh(self) -> tuple[EntryRec, list]:
        entry = _zh_entry_with_chars()
        client = FakeClient()
        upsert_entry(client, entry)
        return entry, client.log

    def test_characters_upserted(self) -> None:
        """upsert_entry must call upsert on lex.characters."""
        _, log = self._upsert_zh()
        upserts = [(op, tbl) for op, tbl, *_ in log if op == "upsert"]
        tables_upserted = [tbl for _, tbl in upserts]
        assert "characters" in tables_upserted, (
            f"expected 'characters' upsert; got upserts: {upserts}"
        )

    def test_entry_characters_inserted(self) -> None:
        """upsert_entry must insert into lex.entry_characters."""
        _, log = self._upsert_zh()
        inserts = [(op, tbl) for op, tbl, *_ in log if op == "insert"]
        tables_inserted = [tbl for _, tbl in inserts]
        assert "entry_characters" in tables_inserted, (
            f"expected 'entry_characters' insert; got inserts: {inserts}"
        )

    def test_entries_attributes_strip_characters_key(self) -> None:
        """The entries row jsonb must NOT contain the 'characters' key."""
        entry = _zh_entry_with_chars()
        rows = entry_to_rows(entry)
        entries_attrs = rows["entries"][0].get("attributes", {})
        assert "characters" not in entries_attrs, (
            "entries row attributes still contains 'characters' — must be stripped"
        )

    def test_entries_attributes_retain_pinyin(self) -> None:
        """Other attributes (e.g. pinyin) must survive the strip."""
        entry = _zh_entry_with_chars()
        rows = entry_to_rows(entry)
        entries_attrs = rows["entries"][0].get("attributes", {})
        assert "pinyin" in entries_attrs

    def test_characters_upserted_before_entry_characters(self) -> None:
        """characters upsert must precede entry_characters insert (FK order)."""
        _, log = self._upsert_zh()
        char_upsert_pos: int | None = None
        ec_insert_pos: int | None = None
        for i, ev in enumerate(log):
            if ev[0] == "upsert" and ev[1] == "characters" and char_upsert_pos is None:
                char_upsert_pos = i
            if ev[0] == "insert" and ev[1] == "entry_characters" and ec_insert_pos is None:
                ec_insert_pos = i
        assert char_upsert_pos is not None, "characters upsert not found"
        assert ec_insert_pos is not None, "entry_characters insert not found"
        assert char_upsert_pos < ec_insert_pos

    def test_entries_inserted_before_entry_characters(self) -> None:
        """entries insert must precede entry_characters insert (FK order)."""
        _, log = self._upsert_zh()
        entries_pos: int | None = None
        ec_pos: int | None = None
        for i, ev in enumerate(log):
            if ev[0] == "insert" and ev[1] == "entries" and entries_pos is None:
                entries_pos = i
            if ev[0] == "insert" and ev[1] == "entry_characters" and ec_pos is None:
                ec_pos = i
        assert entries_pos is not None
        assert ec_pos is not None
        assert entries_pos < ec_pos

    def test_characters_row_count(self) -> None:
        entry = _zh_entry_with_chars()
        rows = entry_to_rows(entry)
        assert len(rows["characters"]) == 1
        assert rows["characters"][0]["char"] == "狗"
        assert rows["characters"][0]["source_id"] == "unihan"

    def test_entry_characters_row_count(self) -> None:
        entry = _zh_entry_with_chars()
        rows = entry_to_rows(entry)
        assert len(rows["entry_characters"]) == 1
        ec = rows["entry_characters"][0]
        assert ec["entry_id"] == "zh:狗"
        assert ec["char"] == "狗"
        assert ec["position"] == 0

    def test_no_character_tables_for_en_entry(self) -> None:
        """English entry with no characters attribute → empty char table lists."""
        entry = _rich_entry()
        rows = entry_to_rows(entry)
        assert rows["characters"] == []
        assert rows["entry_characters"] == []
