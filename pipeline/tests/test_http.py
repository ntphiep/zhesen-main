import pipeline.acquire.http as http
from pipeline.config import settings


def test_cache_hit_avoids_refetch(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(http, "MIN_INTERVAL", 0)
    calls = {"n": 0}

    def fake_fetch(url):
        calls["n"] += 1
        return f"<html>{url}</html>"

    monkeypatch.setattr(http, "_fetch", fake_fetch)

    url = "https://example.com/dog"
    a = http.get(url, host_key="example")
    assert calls["n"] == 1 and "dog" in a

    b = http.get(url, host_key="example")  # cache hit
    assert calls["n"] == 1 and b == a  # no new network call

    c = http.get(url, host_key="example", force=True)  # forced refetch
    assert calls["n"] == 2 and c == a
