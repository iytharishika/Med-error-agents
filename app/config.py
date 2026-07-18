"""Runtime configuration, loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    anthropic_api_key: str = ""
    kapsule_model: str = "claude-sonnet-5"
    openmedcalc_base_url: str = "https://api.openmedcalc.org"
    kapsule_dataset: str = "data/synthetic-ambient-fhir-25.jsonl"
    kapsule_max_concurrency: int = 6

    @property
    def dataset_path(self) -> Path:
        p = Path(self.kapsule_dataset)
        return p if p.is_absolute() else ROOT / p

    @property
    def has_llm(self) -> bool:
        return bool(self.anthropic_api_key and self.anthropic_api_key.startswith("sk-"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
