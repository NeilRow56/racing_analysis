"""Audited authoritative corrections; never mutate imported payload dictionaries."""
from functools import lru_cache
import json
from pathlib import Path


@lru_cache(maxsize=1)
def corrections():
    path = Path(__file__).resolve().parents[2] / "data/corrections/sporting-life-winning-times.json"
    return json.loads(path.read_text(encoding="utf-8"))["corrections"]


def authoritative_winning_time(source_id: str, race_date: str, raw_time: str | None) -> str | None:
    correction = next((c for c in corrections() if c["sourceId"] == source_id and c["raceDate"] == race_date), None)
    if correction is None:
        return raw_time
    if raw_time not in (correction["original"], correction["corrected"]):
        raise ValueError(f"Winning time conflicts with audited correction: {source_id}")
    return correction["corrected"]
