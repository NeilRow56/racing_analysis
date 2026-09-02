from __future__ import annotations

import os
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class SportingLifeRequestError(RuntimeError):
    pass


class SportingLifeClient:
    def __init__(self, timeout: int = 14, request_delay_seconds: float | None = None) -> None:
        self._timeout = timeout
        self._request_delay_seconds = (
            request_delay_seconds
            if request_delay_seconds is not None
            else float(os.getenv("SL_REQUEST_DELAY_SECONDS", "1.0"))
        )
        self._last_request_at: float | None = None

    def get_text(self, url: str) -> str:
        self._wait_between_requests()
        request = Request(
            url,
            headers={"User-Agent": "racing-analysis-personal-research/0.1"},
        )
        try:
            with urlopen(request, timeout=self._timeout) as response:
                self._last_request_at = time.monotonic()
                return response.read().decode(response.headers.get_content_charset() or "utf-8")
        except HTTPError as error:
            self._last_request_at = time.monotonic()
            body = error.read(180).decode("utf-8", errors="replace")
            body_prefix = " ".join(body.split())
            raise SportingLifeRequestError(
                f"Sporting Life returned HTTP {error.code} for {url}; body_prefix={body_prefix!r}"
            ) from error

    def _wait_between_requests(self) -> None:
        if self._last_request_at is None or self._request_delay_seconds <= 0:
            return
        elapsed = time.monotonic() - self._last_request_at
        remaining = self._request_delay_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
