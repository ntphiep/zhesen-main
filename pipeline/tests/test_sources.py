import pytest
from pipeline.sources import SOURCES, SourceRow, seed_rows


def test_sources_catalog_exists():
    """SOURCES dict must exist and have at least 7 entries."""
    assert isinstance(SOURCES, dict)
    assert len(SOURCES) >= 7


def test_cambridge_is_personal():
    """Cambridge must have tier='personal'."""
    assert "cambridge" in SOURCES
    assert SOURCES["cambridge"].tier == "personal"


def test_all_other_sources_are_open():
    """All sources except Cambridge must have tier='open'."""
    for source_id, source in SOURCES.items():
        if source_id != "cambridge":
            assert source.tier == "open", f"{source_id} should have tier='open', got {source.tier}"


def test_source_row_frozen():
    """SourceRow must be a frozen dataclass."""
    row = SourceRow(
        id="test-id",
        name="Test Name",
        url="https://example.com",
        license="MIT",
        tier="open",
        notes=""
    )
    assert row.id == "test-id"
    with pytest.raises(AttributeError):
        row.id = "new-id"


def test_seed_rows_format():
    """seed_rows() must return a list of dicts suitable for database insertion."""
    rows = seed_rows()
    assert isinstance(rows, list)
    assert len(rows) >= 7

    for row_dict in rows:
        assert isinstance(row_dict, dict)
        assert "id" in row_dict
        assert "name" in row_dict
        assert "url" in row_dict
        assert "license" in row_dict
        assert "tier" in row_dict
        assert "notes" in row_dict

        # Validate required fields are non-empty
        assert row_dict["id"], "id must be non-empty"
        assert row_dict["license"], "license must be non-empty"

        # Validate tier is one of the allowed values
        assert row_dict["tier"] in {"open", "personal"}, f"tier must be 'open' or 'personal', got {row_dict['tier']}"
