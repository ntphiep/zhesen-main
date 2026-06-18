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


# ---------------------------------------------------------------------------
# Fake Supabase client
# ---------------------------------------------------------------------------

class FakeResp:
    """Minimal stand-in for a Supabase APIResponse."""
    pass


class FakeTable:
    def __init__(self, log: list, name: str) -> None:
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

    def execute(self) -> FakeResp:
        return FakeResp()


class FakeSchema:
    def __init__(self, log: list) -> None:
        self.log = log

    def table(self, name: str) -> FakeTable:
        return FakeTable(self.log, name)


class FakeClient:
    def __init__(self) -> None:
        self.log: list = []

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
