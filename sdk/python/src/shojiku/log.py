"""The optional host-side log channel.

Silent unless an application supplies a logger, and deliberately narrow: it
reports what the BINDING did — which library it loaded, which ABI revision it
found, which lifecycle step ran and for how long — and never what the document
contained. Params, rendered bytes, diagnostics and key material are all outside
this channel BY RULE, because a log line is the easiest way for a secret to
leave a process, and because a diagnostic belongs to the result the caller
already has.

What does cross is bounded first, so a hostile template name cannot smuggle
control characters into a log file.

Any object with a ``debug`` method is accepted — ``logging.Logger``, a
framework's own, or an application's — so this package's dependency list stays
at exactly zero entries. The cross-language rule the other six mirror: each SDK
accepts its ecosystem's standard logger interface, optionally.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Protocol, TypeVar

if TYPE_CHECKING:
    from collections.abc import Callable

    from shojiku.result import Result

T = TypeVar("T")


class Logger(Protocol):
    """Anything that can be told something at debug level."""

    def debug(self, message: str) -> object: ...


class Log:
    """Host events, or silence."""

    def __init__(self, logger: Logger | None = None) -> None:
        self._logger = logger

    def event(self, name: str, **fields: Any) -> None:
        """Record one host event.

        The message is built only when someone is listening: a silent log costs
        a None check, not string formatting.
        """
        if self._logger is None:
            return

        self._logger.debug(f"shojiku {name}{self._render(fields)}")

    def timed(self, name: str, operation: Callable[[], Result[T]], **fields: Any) -> Result[T]:
        """Time one lifecycle operation and return what it returned.

        The operation is expected to produce a result, whose verdict is recorded
        as ``ok`` — the one thing worth knowing about an operation that is not
        its content.
        """
        started = time.monotonic()
        result = operation()
        elapsed_ms = round((time.monotonic() - started) * 1000, 1)
        self.event(name, **fields, ms=elapsed_ms, ok=result.success)
        return result

    @staticmethod
    def _render(fields: dict[str, Any]) -> str:
        return "".join(f" {key}={value}" for key, value in fields.items())
