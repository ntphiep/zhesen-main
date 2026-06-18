"""Supabase load stage: idempotent delete-then-insert of the full entry tree.

FK-safe insertion order:
    entries → senses → pronunciations, inflections, lex_relations, examples,
    images, cross_language_links → characters (upsert) → entry_characters

Deleting an `entries` row cascades to every child via ON DELETE CASCADE,
including entry_characters (FK entry_id ON DELETE CASCADE).
lex.characters is shared across words — it is never deleted by this module.

No I/O other than Supabase RPC calls — keep this module pure of file/network
side-effects so it can be unit-tested with a fake client.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from pipeline.config import settings
from pipeline.models.records import EntryRec
from pipeline.sources import seed_rows

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
        examples, images, cross_language_links, characters, entry_characters
    Each value is a list of dicts ready for Supabase upsert/insert.

    The ``characters`` key in attributes (a per-character list) is stripped
    from the entries row jsonb to avoid duplicating the large nested list.
    """
    # The entries row excludes all child list fields.
    entries_row = entry.model_dump(exclude=_CHILD_FIELDS)

    # Strip the per-character list from the entries jsonb — it lives in its
    # own tables (lex.characters + lex.entry_characters) instead.
    if "attributes" in entries_row and "characters" in entries_row["attributes"]:
        entries_row["attributes"] = {
            k: v
            for k, v in entries_row["attributes"].items()
            if k != "characters"
        }

    # Build character rows from attributes["characters"] (if present).
    raw_chars: list[dict] = entry.attributes.get("characters", [])
    entry_id = entry.id

    character_rows: list[dict] = []
    entry_character_rows: list[dict] = []
    for char_dict in raw_chars:
        char = char_dict["char"]
        position = char_dict["position"]

        character_rows.append({
            "char": char,
            "radical": char_dict.get("radical", ""),
            "stroke_count": char_dict.get("stroke_count", 0),
            "pinyin": char_dict.get("pinyin", []),
            "cantonese": char_dict.get("cantonese", []),
            "han_viet": char_dict.get("han_viet", []),
            "gloss": char_dict.get("gloss", ""),
            "simplified_variant": char_dict.get("simplified_variant"),
            "traditional_variant": char_dict.get("traditional_variant"),
            "source_id": "unihan",
        })

        entry_character_rows.append({
            "entry_id": entry_id,
            "char": char,
            "position": position,
        })

    result: dict[str, list[dict]] = {
        "entries": [entries_row],
        "senses": [s.model_dump() for s in entry.senses],
        "pronunciations": [p.model_dump() for p in entry.pronunciations],
        "inflections": [i.model_dump() for i in entry.inflections],
        "lex_relations": [r.model_dump() for r in entry.relations],
        "examples": [ex.model_dump() for ex in entry.examples],
        "images": [img.model_dump() for img in entry.images],
        "cross_language_links": [xl.model_dump() for xl in entry.cross_links],
        "characters": character_rows,
        "entry_characters": entry_character_rows,
    }
    return result


def seed_sources(client: "Client") -> None:
    """Upsert the source catalog so entry FKs resolve."""
    client.schema("lex").table("sources").upsert(seed_rows(), on_conflict="id").execute()


def upsert_entry(client: "Client", entry: EntryRec) -> None:
    """Idempotent delete-then-insert of the full entry tree into Supabase.

    Steps:
        1. DELETE the entries row by id (cascades to all children, including
           entry_characters via ON DELETE CASCADE; does NOT touch lex.characters).
        2. INSERT rows in FK-safe order, skipping empty lists.
        3. UPSERT lex.characters (shared, on_conflict="char").
        4. INSERT lex.entry_characters (requires both entries and characters).

    Args:
        client: A Supabase client (or compatible fake) with .schema().table() API.
        entry:  The entry to load.
    """
    # Step 1: cascade-delete existing entry (and all its children).
    client.schema("lex").table("entries").delete().eq("id", entry.id).execute()

    rows = entry_to_rows(entry)

    # Step 2: insert entries row first, then children in FK-safe order.
    def _insert(table: str, data: list[dict]) -> None:
        if data:
            client.schema("lex").table(table).insert(data).execute()

    _insert("entries", rows["entries"])
    for table in _CHILD_ORDER:
        _insert(table, rows[table])

    # Step 3: upsert shared character data (on_conflict="char" — never delete).
    if rows["characters"]:
        client.schema("lex").table("characters").upsert(
            rows["characters"], on_conflict="char"
        ).execute()

    # Step 4: insert entry_characters links (entries + characters both exist now).
    _insert("entry_characters", rows["entry_characters"])
