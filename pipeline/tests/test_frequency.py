import json
import pipeline.acquire.frequency as freq


def test_select_headwords_basic():
    words = freq.select_headwords(10)
    assert len(words) == 10
    assert len(set(words)) == 10            # distinct
    assert all(w.isalpha() and w == w.lower() for w in words)
    assert "the" in words                   # most common English word


def test_band_boundaries(monkeypatch):
    assert freq.band_for_zipf(5.0) == "very_common"
    assert freq.band_for_zipf(4.0) == "common"
    assert freq.band_for_zipf(3.0) == "uncommon"
    assert freq.band_for_zipf(2.9) == "rare"


def test_frequency_for_the():
    rank, band = freq.frequency_for("the")
    assert band == "very_common"
    assert rank == 1 or (rank is not None and rank <= 10)


def test_run_writes_jsonl(tmp_path):
    rows = freq.run(5)
    assert len(rows) == 5
    from pipeline.config import settings
    path = settings.INTERIM_DIR / "headwords.jsonl"
    assert path.exists()
    lines = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 5
    assert set(lines[0].keys()) == {"headword", "frequency_rank", "frequency_band"}
