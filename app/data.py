"""Dataset loader for the synthetic ambient FHIR encounters."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Optional

from .config import get_settings


@lru_cache
def _load_records() -> list[dict[str, Any]]:
    path = get_settings().dataset_path
    with open(path, "r", encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


@lru_cache
def _index() -> dict[str, dict[str, Any]]:
    """Map both the compound id and the bare patient_id to a record."""
    idx: dict[str, dict[str, Any]] = {}
    for r in _load_records():
        idx[r["id"]] = r
        idx[r["metadata"]["patient_id"]] = r
    return idx


def list_encounters() -> list[dict[str, Any]]:
    out = []
    for r in _load_records():
        m = r["metadata"]
        out.append(
            {
                "id": r["id"],
                "patient_id": m["patient_id"],
                "encounter_id": m["encounter_id"],
                "date": m.get("date"),
                "visit_title": m.get("visit_title"),
                "visit_type": m.get("visit_type"),
                "resource_counts": m.get("related_resource_counts", {}),
            }
        )
    return out


def get_record(patient_or_id: str) -> Optional[dict[str, Any]]:
    return _index().get(patient_or_id)
