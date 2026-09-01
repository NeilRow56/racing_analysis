#!/usr/bin/env python3
"""Capture tiny Racing Post full-result structured samples.

This script preserves raw page/data payloads only. It does not normalize data or
write to PostgreSQL.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
VENDOR_SCRIPTS = REPO_ROOT / "scraper" / "vendor" / "rpscrape" / "scripts"
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "racing-post"
BASE_URL = "https://www.racingpost.com"

CHELMSFORD_PAGE_URL = (
    "https://www.racingpost.com/results/1083/chelmsford-aw/2020-10-01/766341"
)

UNUSUAL_OUTCOME_PAGE_URLS = [
    "https://www.racingpost.com/results/11/cheltenham/2020-03-13/747842",
    "https://www.racingpost.com/results/11/cheltenham/2020-03-13/750554",
    "https://www.racingpost.com/results/11/cheltenham/2020-03-13/747843",
    "https://www.racingpost.com/results/11/cheltenham/2020-03-13/743616",
    "https://www.racingpost.com/results/11/cheltenham/2020-03-13/750555",
]


def main() -> None:
    if not VENDOR_SCRIPTS.exists():
        raise SystemExit(
            "Missing scraper/vendor/rpscrape. See scraper/README.md for setup."
        )

    sys.path.insert(0, str(VENDOR_SCRIPTS))

    from lxml import html
    from utils.network import NetworkClient

    client = NetworkClient()
    RAW_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    page_payload = fetch_page_payload(client, html, CHELMSFORD_PAGE_URL)
    build_id = page_payload["buildId"]
    race_result = extract_race_result(page_payload)

    write_json(
        "2020-10-01-chelmsford-aw-766341-full-result-next-page-data.json",
        {
            "source_url": CHELMSFORD_PAGE_URL,
            "payload": page_payload,
        },
    )
    write_json(
        "2020-10-01-chelmsford-aw-766341-full-result-next-race-result.json",
        {
            "source_url": CHELMSFORD_PAGE_URL,
            "payload": race_result,
        },
    )

    data_route_url = next_data_route_url(build_id, CHELMSFORD_PAGE_URL)
    data_route_payload = fetch_json(client, data_route_url)
    write_json(
        "2020-10-01-chelmsford-aw-766341-full-result-next-data-route.json",
        {
            "source_url": data_route_url,
            "page_url": CHELMSFORD_PAGE_URL,
            "payload": data_route_payload,
        },
    )

    for page_url in UNUSUAL_OUTCOME_PAGE_URLS:
        payload = fetch_json(client, next_data_route_url(build_id, page_url))
        race = extract_race_result(payload)
        race_id = race["raceId"]
        write_json(
            f"2020-03-13-cheltenham-{race_id}-full-result-next-data-route-unusual-outcomes.json",
            {
                "source_url": next_data_route_url(build_id, page_url),
                "page_url": page_url,
                "payload": payload,
            },
        )

    print(f"RAW_OUTPUT_DIR={RAW_OUTPUT_DIR}")


def fetch_page_payload(client: Any, html: Any, url: str) -> dict[str, Any]:
    status, response = client.get(url)
    if status != 200:
        raise SystemExit(f"Could not fetch {url}: HTTP {status}")

    document = html.fromstring(response.content)
    next_data = document.xpath('string(//script[@id="__NEXT_DATA__"])')
    if not next_data:
        raise SystemExit(f"No __NEXT_DATA__ payload found at {url}")

    return json.loads(next_data)


def fetch_json(client: Any, url: str) -> dict[str, Any]:
    status, response = client.get(url)
    if status != 200:
        raise SystemExit(f"Could not fetch {url}: HTTP {status}")
    return response.json()


def extract_race_result(payload: dict[str, Any]) -> dict[str, Any]:
    page_props = payload.get("pageProps") or payload["props"]["pageProps"]
    return page_props["initialState"]["raceResult"]["data"]


def next_data_route_url(build_id: str, page_url: str) -> str:
    path = page_url.removeprefix(BASE_URL).rstrip("/")
    return f"{BASE_URL}/_next/data/{build_id}{path}.json"


def write_json(filename: str, payload: dict[str, Any]) -> None:
    target = RAW_OUTPUT_DIR / filename
    target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(f"WROTE={target}")


if __name__ == "__main__":
    main()
