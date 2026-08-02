"""Turning one engine snapshot into the result an application sees.

The C surface's two levels of failure meet here, and keeping them apart is the
whole job: a non-zero status is the CALLER's mistake and raises, while
everything a DOCUMENT can do wrong comes back as a failed result with the
engine's diagnostics attached.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from shojiku.artifact import DocumentArtifact, Origin
from shojiku.diagnostic import Diagnostic
from shojiku.engine import Snapshot
from shojiku.errors import UsageError
from shojiku.failure import Failure, Step
from shojiku.result import Result
from shojiku.verification_report import VerificationReport

if TYPE_CHECKING:
    from shojiku.client import Client


def guard(snapshot: Snapshot) -> None:
    """Raise for the caller-error level.

    A non-zero status is the C surface saying the CALLER got it wrong — a null
    pointer, a request the schema rejects, an argument past a hard cap. That is
    programmer misuse in Python terms, so it raises.
    """
    if snapshot.status == 0:
        return

    raise UsageError(f"the engine refused the call (status {snapshot.status}): {snapshot.error}")


def document(
    snapshot: Snapshot, step: Step, client: Client, origin: Origin
) -> Result[DocumentArtifact]:
    """A rendered or signed document.

    Diagnostics are attached either way: a render that WORKED can still have
    warned.
    """
    guard(snapshot)
    diagnostics = Diagnostic.parse(snapshot.diagnostics)
    if not snapshot.success:
        return Result.from_failure(
            Failure.from_error_json(snapshot.error, step=step, diagnostics=diagnostics)
        )

    artifact = DocumentArtifact(
        bytes_=snapshot.pdf,
        diagnostics=diagnostics,
        client=client,
        page_count=_page_count(snapshot.json),
        origin=origin,
    )
    return Result.succeeded(artifact, diagnostics)


def verdict(snapshot: Snapshot) -> Result[VerificationReport]:
    """A verification verdict.

    The report is parsed BEFORE the verdict is read, because it rides a FAILED
    verify too — that is the whole point of carrying ``not_checked``.
    Diagnostics are parsed on both paths for the same reason they are on a
    render: whatever the engine noticed belongs to the caller, and an operation
    that drops them makes its result mean something different from every other
    operation's.
    """
    guard(snapshot)
    diagnostics = Diagnostic.parse(snapshot.diagnostics)
    report = VerificationReport.parse(snapshot.json) if snapshot.json else None
    if snapshot.success:
        # Constructed directly rather than through `succeeded`: a verdict whose
        # payload was empty carries no report, and that absence is data — it is
        # a different fact from an empty report.
        return Result(value=report, diagnostics=diagnostics)

    failure = Failure.from_error_json(snapshot.error, step=Step.VERIFY, diagnostics=diagnostics)
    return Result(value=report, diagnostics=diagnostics, failure=failure)


def _page_count(payload: str) -> int | None:
    """Absent (not zero) on a signed artifact.

    Signing appends a revision to bytes it never laid out, and the surface
    returns no JSON payload for it at all.
    """
    if not payload:
        return None
    count = json.loads(payload).get("pageCount")
    return int(count) if count is not None else None
