"""Turning a snapshot into a result: the two levels, and the verify payload.

The only place in this suite that builds `Snapshot` VALUES rather than going
through the library — for the one case the library cannot produce today: verify
emits no diagnostics, and the binding must still carry them if it ever does.
"""

from __future__ import annotations

import pytest

import shojiku
from shojiku import outcome
from shojiku.engine import Snapshot

DIAGNOSTICS = '{"items": [{"severity": "warning", "code": "sample", "message": "noticed"}]}'
REPORT = (
    '{"valid": true, "signature": {"status": "passed"}, "coverage": {"status": "passed"}, '
    '"certificateValidity": {"status": "passed"}, "trustChain": {"status": "passed"}, '
    '"notChecked": ["revocation"]}'
)


def snapshot(**overrides: object) -> Snapshot:
    fields: dict[str, object] = {
        "status": 0,
        "success": True,
        "pdf": b"",
        "json": "",
        "diagnostics": "",
        "error": "",
    }
    fields.update(overrides)
    return Snapshot(**fields)  # type: ignore[arg-type]


class TestVerdict:
    def test_carries_diagnostics_through_a_passing_verdict(self) -> None:
        result = outcome.verdict(snapshot(success=True, json=REPORT, diagnostics=DIAGNOSTICS))

        assert result.success
        assert [d.code for d in result.diagnostics] == ["sample"]
        assert result.unwrap().not_checked == ("revocation",)

    def test_carries_them_through_a_failing_one_too_onto_the_failure_as_well(self) -> None:
        result = outcome.verdict(
            snapshot(
                success=False,
                json=REPORT,
                diagnostics=DIAGNOSTICS,
                error='{"kind": "signature", "message": "digest mismatch"}',
            )
        )

        assert result.failed
        assert [d.code for d in result.diagnostics] == ["sample"]
        assert result.failure is not None
        assert [d.code for d in result.failure.diagnostics] == ["sample"]
        # The report rides the FAILED result — that is the whole point.
        assert result.report is not None

    def test_gives_no_report_when_the_engine_sent_no_payload(self) -> None:
        result = outcome.verdict(snapshot(success=True, json=""))

        assert result.success
        assert result.report is None


class TestGuard:
    def test_passes_a_status_of_zero_through(self) -> None:
        assert outcome.guard(snapshot(status=0)) is None

    def test_raises_for_the_caller_error_level_quoting_what_the_surface_said(self) -> None:
        with pytest.raises(shojiku.UsageError) as caught:
            outcome.guard(snapshot(status=3, error='{"kind": "invalid_request"}'))

        assert "status 3" in str(caught.value)
        assert "invalid_request" in str(caught.value)


class TestDocument:
    def test_reports_a_page_count_of_none_when_the_payload_omits_one(
        self, client: shojiku.Client
    ) -> None:
        result = outcome.document(
            snapshot(success=True, pdf=b"%PDF-", json="{}"),
            step=shojiku.Step.SIGN,
            client=client,
            origin=shojiku.Origin.RENDERED,
        )

        assert result.unwrap().page_count is None
