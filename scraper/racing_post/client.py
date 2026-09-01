from __future__ import annotations

import os
import time
from collections.abc import Sequence
from random import choice

from curl_cffi import requests
from curl_cffi.requests.exceptions import HTTPError


BROWSERS: Sequence[str] = ("chrome", "edge", "firefox", "safari")


class RacingPostRequestError(RuntimeError):
    pass


class RacingPostClient:
    def __init__(self, timeout: int = 14, request_delay_seconds: float | None = None) -> None:
        self._session = requests.Session(impersonate=choice(BROWSERS))
        self._timeout = timeout
        self._request_delay_seconds = (
            request_delay_seconds
            if request_delay_seconds is not None
            else float(os.getenv("RP_REQUEST_DELAY_SECONDS", "0.75"))
        )
        self._last_request_at: float | None = None

    def get_text(self, url: str) -> str:
        self._wait_between_requests()
        response = self._session.get(url, timeout=self._timeout)
        self._last_request_at = time.monotonic()
        raise_for_status(response, url)
        return response.text

    def get_json(self, url: str) -> dict:
        self._wait_between_requests()
        response = self._session.get(url, timeout=self._timeout)
        self._last_request_at = time.monotonic()
        raise_for_status(response, url)
        return response.json()

    def _wait_between_requests(self) -> None:
        if self._last_request_at is None or self._request_delay_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_request_at
        remaining = self._request_delay_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)


def raise_for_status(response: requests.Response, url: str) -> None:
    try:
        response.raise_for_status()
    except HTTPError as error:
        content_type = response.headers.get("content-type", "unknown")
        body_prefix = " ".join(response.text[:180].split()) if response.text else ""
        raise RacingPostRequestError(
            f"Racing Post returned HTTP {response.status_code} for {url}; "
            f"content-type={content_type}; body_prefix={body_prefix!r}"
        ) from error
