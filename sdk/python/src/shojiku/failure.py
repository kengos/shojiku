"""Why a lifecycle operation did not produce what was asked for.

A VALUE, not an exception. The shape takes effect-ts's ``Cause`` as its
conceptual reference: which step failed, what class of thing went wrong, and —
when one failure happened because of another — the chain underneath it, all
inspectable rather than unwound. No effect framework is involved; only the idea
that a failure is data.
"""

from __future__ import annotations

import json
from enum import StrEnum

from shojiku.diagnostic import Diagnostic


class Step(StrEnum):
    """The SDK's own lifecycle vocabulary.

    Always one of these three. The engine's error object carries a step of its
    own naming an INTERNAL stage (``render``, ``validate``), and passing that
    through would make the trace's step mean different things depending on which
    layer refused. What the engine said specifically is the ``kind``.
    """

    GENERATE = "generate"
    SIGN = "sign"
    VERIFY = "verify"


class Failure:
    """One failed lifecycle step, and the chain of causes under it."""

    def __init__(
        self,
        step: Step,
        kind: str,
        message: str,
        diagnostics: list[Diagnostic] | None = None,
        cause: Failure | None = None,
    ) -> None:
        self.step = step
        # A stable machine-readable class. Engine-side kinds come straight off
        # the wire; host-side ones are this package's own (`template_name`, `io`).
        self.kind = kind
        self.message = message
        self.diagnostics: list[Diagnostic] = diagnostics or []
        self.cause = cause

    @staticmethod
    def from_error_json(
        payload: str | None,
        step: Step,
        diagnostics: list[Diagnostic] | None = None,
        cause: Failure | None = None,
    ) -> Failure:
        parsed = json.loads(payload) if payload else {}
        return Failure(
            step=step,
            kind=parsed.get("kind", "unknown"),
            message=parsed.get("message", ""),
            diagnostics=diagnostics,
            cause=cause,
        )

    @property
    def causes(self) -> list[Failure]:
        """This failure and everything under it, outermost first.

        What you log when you want the whole story rather than only its headline.
        """
        return [self, *(self.cause.causes if self.cause else [])]

    def __str__(self) -> str:
        return f"{self.step}/{self.kind}: {self.message}"
