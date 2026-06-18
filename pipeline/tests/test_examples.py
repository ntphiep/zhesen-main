from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from pipeline.enrich.examples import parse_tatoeba, fetch_tatoeba, _SEARCH_URL

_FIXTURE = Path(__file__).parent / "fixtures" / "tatoeba_dog.json"


def _fixture() -> dict:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


def test_parse_real_fixture_shape() -> None:
    rows = parse_tatoeba("dog", _fixture())
    assert 1 <= len(rows) <= 5
    assert all(r.text and r.source_id == "tatoeba" and r.tier == "open" for r in rows)


def test_translation_vi_extracted() -> None:
    # Synthetic minimal raw exercising vie-translation extraction.
    # Real shape: translations is a list of lists; each inner list contains
    # translation objects with keys: id, text, lang, isDirect, audios, etc.
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [[{"id": 1, "text": "Con cho sua.", "lang": "vie", "audios": []}]],
        "audios": [],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].translation_vi == "Con cho sua."


def test_audio_url_built() -> None:
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [],
        "audios": [{"id": 827950, "download_url": "/en/audio/download/827950"}],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].audio_url == "https://tatoeba.org/en/audio/download/827950"


def test_entry_id_matches_headword() -> None:
    raw = {"results": [{
        "text": "The dog barks.",
        "translations": [],
        "audios": [],
    }]}
    rows = parse_tatoeba("dog", raw)
    assert rows[0].entry_id == "en:dog"


def test_capped_at_five() -> None:
    result_template = {
        "text": "The dog barks.",
        "translations": [],
        "audios": [],
    }
    raw = {"results": [result_template] * 10}
    rows = parse_tatoeba("dog", raw)
    assert len(rows) == 5


# ---------------------------------------------------------------------------
# fetch_tatoeba — lang param tests (task 3c.4 C)
# ---------------------------------------------------------------------------


def test_fetch_tatoeba_default_lang_builds_eng_vie_url(tmp_path: Path) -> None:
    """Default from_lang=eng, to_lang=vie should build the correct URL."""
    fake_data = {"results": []}
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_data

    captured_urls: list[str] = []

    def fake_get(url: str, **kwargs: object) -> MagicMock:
        captured_urls.append(url)
        return mock_resp

    with (
        patch("pipeline.enrich.examples.settings") as mock_settings,
        patch("pipeline.enrich.examples.requests.get", side_effect=fake_get),
    ):
        # Point cache to tmp_path so no real file is written
        mock_settings.CACHE_DIR = tmp_path
        fetch_tatoeba("dog")

    assert len(captured_urls) == 1
    url = captured_urls[0]
    assert "from=eng" in url
    assert "to=vie" in url
    assert "dog" in url


def test_fetch_tatoeba_cmn_vie_url(tmp_path: Path) -> None:
    """from_lang=cmn, to_lang=vie builds URL with cmn and vie params."""
    fake_data = {"results": []}
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_data

    captured_urls: list[str] = []

    def fake_get(url: str, **kwargs: object) -> MagicMock:
        captured_urls.append(url)
        return mock_resp

    with (
        patch("pipeline.enrich.examples.settings") as mock_settings,
        patch("pipeline.enrich.examples.requests.get", side_effect=fake_get),
    ):
        mock_settings.CACHE_DIR = tmp_path
        fetch_tatoeba("你好", from_lang="cmn", to_lang="vie")

    assert len(captured_urls) == 1
    url = captured_urls[0]
    assert "from=cmn" in url
    assert "to=vie" in url


def test_fetch_tatoeba_cache_hit_skips_network(tmp_path: Path) -> None:
    """When a cache file exists, no HTTP request is made."""
    fake_data = {"results": [{"text": "cached"}]}
    # Write a cache file for eng-vie-dog
    cache_dir = tmp_path / "tatoeba"
    cache_dir.mkdir()
    (cache_dir / "eng-vie-dog.json").write_text(
        json.dumps(fake_data), encoding="utf-8"
    )

    with (
        patch("pipeline.enrich.examples.settings") as mock_settings,
        patch("pipeline.enrich.examples.requests.get") as mock_get,
    ):
        mock_settings.CACHE_DIR = tmp_path
        result = fetch_tatoeba("dog")

    mock_get.assert_not_called()
    assert result == fake_data


def test_fetch_tatoeba_lang_pairs_use_separate_caches(tmp_path: Path) -> None:
    """Different lang pairs for the same headword get separate cache files."""
    fake_eng = {"results": [{"text": "eng result"}]}
    fake_cmn = {"results": [{"text": "cmn result"}]}

    cache_dir = tmp_path / "tatoeba"
    cache_dir.mkdir()
    (cache_dir / "eng-vie-dog.json").write_text(json.dumps(fake_eng), encoding="utf-8")
    (cache_dir / "cmn-vie-dog.json").write_text(json.dumps(fake_cmn), encoding="utf-8")

    with (
        patch("pipeline.enrich.examples.settings") as mock_settings,
        patch("pipeline.enrich.examples.requests.get") as mock_get,
    ):
        mock_settings.CACHE_DIR = tmp_path
        result_eng = fetch_tatoeba("dog", from_lang="eng", to_lang="vie")
        result_cmn = fetch_tatoeba("dog", from_lang="cmn", to_lang="vie")

    mock_get.assert_not_called()
    assert result_eng == fake_eng
    assert result_cmn == fake_cmn
