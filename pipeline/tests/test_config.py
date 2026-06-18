from pipeline.config import settings

def test_settings_paths_under_root():
    assert settings.RAW_DIR.is_relative_to(settings.ROOT)
    assert settings.INTERIM_DIR.name == "interim"

def test_ensure_dirs_creates(tmp_path, monkeypatch):
    settings.ensure_dirs()
    assert settings.CACHE_DIR.exists()
