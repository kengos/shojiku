"""What every lifecycle operation returns.

Nothing in the normal flow raises. A template that will not render, a key that
will not sign, a signature that does not verify are all data you query —
``success``, the value, the engine's diagnostics either way, and on failure the
:class:`~shojiku.failure.Failure` trace.

Diagnostics ride on a SUCCESS too. A render that worked can still have warned
about an overflowing box, and a caller that only looks at failures never sees
them.
"""

from __future__ import annotations

from typing import Generic, TypeVar, cast

from shojiku.diagnostic import Diagnostic
from shojiku.errors import UnwrapError
from shojiku.failure import Failure

T = TypeVar("T")


class Result(Generic[T]):
    """A lifecycle operation's outcome: a value, diagnostics, maybe a failure."""

    def __init__(
        self,
        value: T | None = None,
        diagnostics: list[Diagnostic] | None = None,
        failure: Failure | None = None,
    ) -> None:
        self.value = value
        self.diagnostics: list[Diagnostic] = diagnostics or []
        self.failure = failure

    @staticmethod
    def succeeded(value: T, diagnostics: list[Diagnostic]) -> Result[T]:
        return Result(value=value, diagnostics=diagnostics)

    # Named `from_failure` rather than mirroring ruby's `Result.failed`, because
    # in Python a static constructor and a predicate cannot share one name and
    # the PREDICATE is the one the frozen contract lists.
    @staticmethod
    def from_failure(failure: Failure) -> Result[T]:
        return Result(failure=failure, diagnostics=failure.diagnostics)

    @property
    def success(self) -> bool:
        return self.failure is None

    @property
    def failed(self) -> bool:
        return not self.success

    # `value` under the name of what the operation produced. Both are the same
    # object; the aliases exist so calling code reads as what it is doing.
    @property
    def artifact(self) -> T | None:
        return self.value

    @property
    def report(self) -> T | None:
        return self.value

    def unwrap(self) -> T:
        """The value, or a raised :class:`~shojiku.errors.UnwrapError`.

        The opt-in bridge for a script that wants a traceback rather than a
        branch, and the ONE place this API raises for something other than a
        misused argument. That is why the ruling is stated rather than implied,
        and frozen for every Shojiku SDK: **calling unwrap on a failed result is
        programmer misuse** — a caller who has not checked ``success`` is
        asserting the operation worked. Application code that handles failure
        keeps using ``success`` and ``failure``; nothing in this package calls it.

        (Python has no ``!`` suffix, so the reference's ``artifact!``/``report!``
        pair is spelled as this one method; ``artifact`` and ``report`` remain as
        the non-raising aliases named for what the operation produced. Go is the
        recorded exception to the raising form: with no exceptions in the
        language its SDK mirrors the shape as an error return.)
        """
        if self.failure is not None:
            raise UnwrapError(self.failure)

        # Cast rather than assert: a verify whose payload was empty succeeds with
        # no report, so a value-less success is reachable and must not blow up
        # here — and an `assert` would vanish under `python -O` anyway.
        return cast("T", self.value)

    @property
    def errors(self) -> list[Diagnostic]:
        """Only the diagnostics that are errors — the ones that explain a refusal."""
        return [item for item in self.diagnostics if item.is_error]

    @property
    def warnings(self) -> list[Diagnostic]:
        """Only the warnings, which a SUCCESSFUL result can carry."""
        return [item for item in self.diagnostics if item.is_warning]
