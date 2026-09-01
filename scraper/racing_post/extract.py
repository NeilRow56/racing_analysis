from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from lxml import html

from .client import RacingPostClient


BASE_URL = "https://www.racingpost.com"


@dataclass(frozen=True)
class FullResultPayload:
    page_url: str
    data_url: str
    payload: dict

    @property
    def race_result(self) -> dict:
        return self.payload["pageProps"]["initialState"]["raceResult"]["data"]


@dataclass(frozen=True)
class ResultLink:
    course_id: str
    course_name: str
    race_id: str
    race_time: str
    race_title: str
    url: str


@dataclass(frozen=True)
class ResultsIndexPayload:
    page_url: str
    data_url: str
    payload: dict

    @property
    def results(self) -> list[dict]:
        return self.payload["pageProps"]["initialState"]["results"]["data"]


def fetch_full_result(page_url: str, client: RacingPostClient | None = None) -> FullResultPayload:
    client = client or RacingPostClient()
    page_payload = fetch_page_next_data(page_url, client)
    build_id = page_payload["buildId"]
    data_url = build_next_data_url(page_url, build_id)
    payload = client.get_json(data_url)

    return FullResultPayload(page_url=page_url, data_url=data_url, payload=payload)


def fetch_results_index(
    race_date: date,
    client: RacingPostClient | None = None,
) -> ResultsIndexPayload:
    client = client or RacingPostClient()
    page_url = f"{BASE_URL}/results/{race_date.isoformat()}"
    page_payload = fetch_page_next_data(page_url, client)
    data_url = build_next_data_url(page_url, page_payload["buildId"])
    payload = client.get_json(data_url)

    return ResultsIndexPayload(page_url=page_url, data_url=data_url, payload=payload)


def discover_uk_result_links(index: ResultsIndexPayload) -> list[ResultLink]:
    links: list[ResultLink] = []

    for meeting in index.results:
        course_name = meeting["courseName"]
        if not is_uk_meeting(course_name):
            continue

        for race in meeting["races"]:
            if not race.get("fullResultAvailable") or not race.get("fullResultLink"):
                continue

            links.append(
                ResultLink(
                    course_id=str(meeting["courseId"]),
                    course_name=course_name,
                    race_id=str(race["raceUid"]),
                    race_time=race["raceTime"],
                    race_title=race["raceTitle"],
                    url=f"{BASE_URL}{race['fullResultLink']}",
                ),
            )

    return links


def fetch_page_next_data(page_url: str, client: RacingPostClient) -> dict:
    document = html.fromstring(client.get_text(page_url))
    raw_next_data = document.xpath('string(//script[@id="__NEXT_DATA__"])')

    if not raw_next_data:
        raise RuntimeError(f"No __NEXT_DATA__ script found at {page_url}")

    return json.loads(raw_next_data)


def build_next_data_url(page_url: str, build_id: str) -> str:
    path = page_url.removeprefix(BASE_URL).rstrip("/")
    return f"{BASE_URL}/_next/data/{build_id}{path}.json"


def is_uk_meeting(course_name: str) -> bool:
    overseas_suffixes = (" (IRE)", " (FR)", " (USA)", " (HK)")
    return (
        not course_name.endswith(overseas_suffixes)
        and course_name != "Worldwide Stakes"
    )
