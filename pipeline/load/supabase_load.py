"""Supabase load stage: idempotent delete-then-insert of the full entry tree.

FK-safe insertion order:
    entries → senses → pronunciations, inflections, lex_relations, examples,
    images, cross_language_links

Deleting an `entries` row cascades to every child via ON DELETE CASCADE.

No I/O other than Supabase RPC calls — keep this module pure of file/network
side-effects so it can be unit-tested with a fake client.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from pipeline.config import settings
from pipeline.models.records import EntryRec

if TYPE_CHECKING:
    from supabase import Client


def get_service_client() -> "Client":
    """Build and return a Supabase client using the service-role key from env.

    Raises:
        RuntimeError: if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.
    """
    from supabase import create_client

    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY

    if not url:
        raise RuntimeError(
            "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set in the environment."
        )
    if not key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is not set in the environment."
        )

    return create_client(url, key)


# Child list field names on EntryRec → their Postgres table names.
# Fields not in this mapping use the field name as the table name directly.
_FIELD_TO_TABLE: dict[str, str] = {
    "relations": "lex_relations",
    "cross_links": "cross_language_links",
}

# Fields on EntryRec that hold child lists (must be excluded from entries row).
_CHILD_FIELDS: frozenset[str] = frozenset(
    {"senses", "pronunciations", "inflections", "relations", "examples", "images", "cross_links"}
)

# FK-safe insertion order for child tables (after `entries` itself).
_CHILD_ORDER: tuple[str, ...] = (
    "senses",
    "pronunciations",
    "inflections",
    "lex_relations",
    "examples",
    "images",
    "cross_language_links",
)


def entry_to_rows(entry: EntryRec) -> dict[str, list[dict]]:
    """Convert *entry* into per-table row lists ready for insertion.

    Returns a dict keyed by table name:
        entries, senses, pronunciations, inflections, lex_relations,
        examples, images, cross_language_links
    Each value is a list of dicts (model_dump output).
    """
    # The entries row excludes all child list fields.
    entries_row = entry.model_dump(exclude=_CHILD_FIELDS)

    result: dict[str, list[dict]] = {
        "entries": [entries_row],
        "senses": [s.model_dump() for s in entry.senses],
        "pronunciations": [p.model_dump() for p in entry.pronunciations],
        "inflections": [i.model_dump() for i in entry.inflections],
        "lex_relations": [r.model_dump() for r in entry.relations],
        "examples": [ex.model_dump() for ex in entry.examples],
        "images": [img.model_dump() for img in entry.images],
        "cross_language_links": [xl.model_dump() for xl in entry.cross_links],
    }
    return result


def upsert_entry(client: object, entry: EntryRec) -> None:
    """Idempotent delete-then-insert of the full entry tree into Supabase.

    Steps:
        1. DELETE the entries row by id (cascades to all children).
        2. INSERT rows in FK-safe order, skipping empty lists.

    Args:
        client: A Supabase client (or compatible fake) with .schema().table() API.
        entry:  The entry to load.
    """
    # Step 1: cascade-delete existing entry (and all its children).
    client.schema("lex").table("entries").delete().eq("id", entry.id).execute()  # type: ignore[union-attr]

    rows = entry_to_rows(entry)

    # Step 2: insert entries row first, then children in FK-safe order.
    def _insert(table: str, data: list[dict]) -> None:
        if data:
            client.schema("lex").table(table).insert(data).execute()  # type: ignore[union-attr]

    _insert("entries", rows["entries"])
    for table in _CHILD_ORDER:
        _insert(table, rows[table])
