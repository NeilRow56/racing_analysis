from __future__ import annotations

from collections.abc import Sequence
from random import choice

from curl_cffi import requests


BROWSERS: Sequence[str] = ("chrome", "edge", "firefox", "safari")


class RacingPostClient:
    def __init__(self, timeout: int = 14) -> None:
        self._session = requests.Session(impersonate=choice(BROWSERS))
        self._timeout = timeout

    def get_text(self, url: str) -> str:
        response = self._session.get(url, timeout=self._timeout)
        response.raise_for_status()
        return response.text

    def get_json(self, url: str) -> dict:
        response = self._session.get(url, timeout=self._timeout)
        response.raise_for_status()
        return response.json()
