"""Small database interfaces shared by ingestion code and its offline tests."""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, LiteralString, Protocol


class RowCursor(Protocol):
    def fetchone(self) -> Sequence[Any] | None: ...


class ImportCursor(RowCursor, Protocol):
    def execute(self, query: LiteralString, params: tuple[Any, ...], /) -> object: ...


def fetch_required_row(cursor: RowCursor) -> Sequence[Any]:
    """Read the row guaranteed by INSERT ... RETURNING or an ungrouped aggregate."""
    row = cursor.fetchone()
    assert row is not None, "Expected SQL to return a row"
    return row
