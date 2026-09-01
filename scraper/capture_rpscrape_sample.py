#!/usr/bin/env python3
"""Capture one tiny raw rpscrape historical-results sample.

This intentionally preserves raw CSV output only. It does not normalize data or
write to PostgreSQL.
"""

from __future__ import annotations

import shutil
import sys
import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRAPER_ROOT = REPO_ROOT / "scraper"
VENDOR_ROOT = SCRAPER_ROOT / "vendor" / "rpscrape"
SAMPLE_SETTINGS = SCRAPER_ROOT / "config" / "rpscrape_results_user_settings.toml"
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "rpscrape"

SAMPLE_DATE_SLASHED = "2020/10/01"
SAMPLE_DATE_ISO = "2020-10-01"
SAMPLE_REGION = "gb"


def main() -> None:
    if not VENDOR_ROOT.exists():
        raise SystemExit(
            "Missing scraper/vendor/rpscrape. See scraper/README.md for clone instructions."
        )

    settings_target = VENDOR_ROOT / "settings" / "user_settings.toml"
    shutil.copyfile(SAMPLE_SETTINGS, settings_target)

    command = [
        sys.executable,
        "rpscrape.py",
        "--clean",
        "-d",
        SAMPLE_DATE_SLASHED,
        "-r",
        SAMPLE_REGION,
    ]
    subprocess.run(command, cwd=VENDOR_ROOT / "scripts", check=True)

    source_csv = (
        VENDOR_ROOT
        / "data"
        / "region"
        / SAMPLE_REGION
        / "all"
        / "2020_10_01.csv"
    )
    if not source_csv.exists():
        raise SystemExit(f"Expected rpscrape output was not created: {source_csv}")

    RAW_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target_csv = RAW_OUTPUT_DIR / "historical-results-gb-2020-10-01-rpscrape.csv"
    shutil.copyfile(source_csv, target_csv)
    print(f"RAW_RPSCRAPE_CSV={target_csv}")

    capture_current_results_page_sample()


def capture_current_results_page_sample() -> None:
    """Capture one embedded result object exposed by the current RP results page.

    rpscrape currently returns only a CSV header for the date-page path because
    Racing Post markup has changed. This diagnostic sample helps compare real
    source fields without pretending the rpscrape parser succeeded.
    """

    scripts_root = VENDOR_ROOT / "scripts"
    sys.path.insert(0, str(scripts_root))

    from lxml import html
    from utils.network import NetworkClient

    client = NetworkClient()
    source_url = f"https://www.racingpost.com/results/{SAMPLE_DATE_ISO}/"
    status, response = client.get(source_url)
    if status != 200:
        raise SystemExit(f"Could not fetch diagnostic Racing Post results page: {status}")

    document = html.fromstring(response.content)
    next_data = document.xpath('string(//script[@id="__NEXT_DATA__"])')
    data = json.loads(next_data)
    meeting = data["props"]["pageProps"]["initialState"]["results"]["data"][0]
    race = meeting["races"][0]

    target_json = (
        RAW_OUTPUT_DIR
        / "historical-results-page-next-data-chelmsford-2020-10-01-first-race.json"
    )
    payload = {
        "source_url": source_url,
        "note": (
            "Extracted from Racing Post __NEXT_DATA__ because current rpscrape "
            "historical selectors returned no rows."
        ),
        "meeting": meeting,
        "race": race,
    }
    target_json.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(f"RAW_DIAGNOSTIC_JSON={target_json}")


if __name__ == "__main__":
    main()
