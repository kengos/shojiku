"""One thing the engine noticed about a document.

Passed through, never interpreted. ``code`` and ``args`` are the engine's
frozen contract — a translating consumer renders its own message from them — so
this class parses the wire and stops. It does not translate, it does not
re-classify, and it never becomes an exception: a render that warns still
succeeded, and a render that failed says why in these.
"""

from __future__ import annotations

import json
from typing import Any


class Diagnostic:
    """One engine diagnostic, exactly as the engine stated it."""

    def __init__(self, item: dict[str, Any]) -> None:
        self.severity: str | None = item.get("severity")
        self.code: str | None = item.get("code")
        self.category: str | None = item.get("category")
        self.message: str | None = item.get("message")
        self.path: str | None = item.get("path")
        self.args: dict[str, Any] = item.get("args") or {}
        self.origin: str | None = item.get("origin")

    @staticmethod
    def parse(payload: str) -> list[Diagnostic]:
        """Every diagnostic in a payload, or nothing at all for an empty one."""
        if not payload:
            return []

        items = json.loads(payload).get("items")
        return [Diagnostic(item) for item in items or []]

    @property
    def is_error(self) -> bool:
        return self.severity == "error"

    @property
    def is_warning(self) -> bool:
        return self.severity == "warning"

    def __str__(self) -> str:
        return ": ".join(part for part in (self.path, self.message) if part is not None)
