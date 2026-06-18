from __future__ import annotations

import hashlib
import time
from pathlib import Path

import requests

from pipeline.config import settings

MIN_INTERVAL: float = 1.0
USER_AGENT: str = "chesen-langlearn/0.1 (personal study project)"

# Track last-request time per host
_last: dict[str, float] = {}


def _fetch(url: str) -> str:
    """
    Fetch a URL and return the response text.
    This is the only function that touches the network.
    Kept separate so tests can monkeypatch it.
    """
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    return resp.text


def get(url: str, *, host_key: str, force: bool = False) -> str:
    """
    Get response text for a URL, using cache when available.

    Args:
        url: The URL to fetch.
        host_key: Host identifier for rate limiting and cache organization.
        force: If True, bypass cache and refetch.

    Returns:
        Response text.
    """
    # Compute cache file path
    cache_dir = settings.CACHE_DIR / host_key
    url_hash = hashlib.sha1(url.encode()).hexdigest()
    cache_file = cache_dir / (url_hash + ".html")

    # Check cache hit (file exists and not forced)
    if not force and cache_file.exists():
        return cache_file.read_text(encoding="utf-8")

    # Cache miss or forced refetch: enforce rate limit
    now = time.time()
    last_request_time = _last.get(host_key)

    if last_request_time is not None:
        elapsed = now - last_request_time
        sleep_time = MIN_INTERVAL - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    # Fetch from network
    text = _fetch(url)

    # Update last-request time
    _last[host_key] = time.time()

    # Write to cache
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(text, encoding="utf-8")

    return text
