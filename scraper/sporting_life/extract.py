from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from lxml import html

from .client import SportingLifeClient


BASE_URL = "https://www.sportinglife.com"


@dataclass(frozen=True)
class FullResultPayload:
    page_url: str
    payload: dict

    @property
    def page_props(self) -> dict:
        return self.payload["props"]["pageProps"]

    @property
    def race(self) -> dict:
        return self.page_props["race"]


@dataclass(frozen=True)
class ResultsIndexPayload:
    page_url: str
    payload: dict

    @property
    def page_props(self) -> dict:
        return self.payload["props"]["pageProps"]

    @property
    def meetings(self) -> list[dict]:
        return self.page_props["meetings"]


@dataclass(frozen=True)
class ResultLink:
    meeting_id: str
    course_id: str
    course_name: str
    race_id: str
    race_time: str
    race_title: str
    url: str


def build_full_result_url(
    *,
    race_date: str,
    course_slug: str,
    race_id: str,
    race_slug: str,
) -> str:
    return f"{BASE_URL}/racing/results/{race_date}/{course_slug}/{race_id}/{race_slug}"


def fetch_results_index(
    race_date: date,
    client: SportingLifeClient | None = None,
) -> ResultsIndexPayload:
    client = client or SportingLifeClient()
    page_url = f"{BASE_URL}/racing/results/{race_date.isoformat()}"
    return ResultsIndexPayload(page_url=page_url, payload=fetch_page_next_data(page_url, client))


def fetch_full_result(page_url: str, client: SportingLifeClient | None = None) -> FullResultPayload:
    client = client or SportingLifeClient()
    return FullResultPayload(page_url=page_url, payload=fetch_page_next_data(page_url, client))


def discover_uk_ire_result_links(index: ResultsIndexPayload) -> list[ResultLink]:
    links: list[ResultLink] = []

    for meeting in index.meetings:
        meeting_summary = meeting["meeting_summary"]
        course = meeting_summary["course"]
        country = course.get("country", {})
        if not is_uk_or_ireland(country, meeting.get("races", [])):
            continue
        if meeting_summary.get("abandoned"):
            continue

        course_name = course["name"]
        course_slug = slugify(course_name)
        meeting_id = str(meeting_summary["meeting_reference"]["id"])
        course_id = str(course["course_reference"]["id"])

        for race in meeting.get("races", []):
            if race.get("hidden") or race.get("race_stage") == "ABANDONED":
                continue
            race_reference = race["race_summary_reference"]
            race_id = str(race_reference["id"])
            race_title = race["name"]
            links.append(
                ResultLink(
                    meeting_id=meeting_id,
                    course_id=course_id,
                    course_name=course_name,
                    race_id=race_id,
                    race_time=race["time"],
                    race_title=race_title,
                    url=build_full_result_url(
                        race_date=race["date"],
                        course_slug=course_slug,
                        race_id=race_id,
                        race_slug=slugify(race_title),
                    ),
                ),
            )

    return links


def fetch_page_next_data(page_url: str, client: SportingLifeClient) -> dict:
    document = html.fromstring(client.get_text(page_url))
    raw_next_data = document.xpath('string(//script[@id="__NEXT_DATA__"])')

    if not raw_next_data:
        raise RuntimeError(f"No __NEXT_DATA__ script found at {page_url}")

    return json.loads(raw_next_data)


def slugify(value: str) -> str:
    slug = "".join(character.lower() if character.isalnum() else "-" for character in value)
    return "-".join(part for part in slug.split("-") if part)


def is_uk_or_ireland(country: dict, races: list[dict]) -> bool:
    short_name = country.get("short_name")
    long_name = country.get("long_name")
    if short_name in {"ENG", "SCO", "WAL", "IRE"}:
        return True
    if long_name in {"England", "Scotland", "Wales", "Ireland"}:
        return True
    return any(race.get("country_short_name") in {"ENG", "SCO", "WAL", "IRE"} for race in races)
