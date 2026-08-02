"""The result wrapper: query it, do not catch it."""

from __future__ import annotations

import pytest

import shojiku
from shojiku.diagnostic import Diagnostic
from shojiku.failure import Failure, Step
from shojiku.result import Result

WARNING = Diagnostic({"severity": "warning", "message": "cramped"})
ERROR = Diagnostic({"severity": "error", "message": "refused"})
FAILURE = Failure(step=Step.GENERATE, kind="document", message="refused", diagnostics=[ERROR])


def test_names_the_same_object_after_what_the_operation_produced() -> None:
    result = Result.succeeded("the value", [])

    assert result.value == "the value"
    assert result.artifact is result.value
    assert result.report is result.value


def test_splits_diagnostics_by_severity() -> None:
    result = Result.succeeded("v", [WARNING, ERROR])

    assert result.warnings == [WARNING]
    assert result.errors == [ERROR]


def test_carries_diagnostics_on_a_success_too() -> None:
    # A render that worked can still have warned, and a caller that only looks
    # at failures never sees them.
    result = Result.succeeded("v", [WARNING])

    assert result.success
    assert result.diagnostics == [WARNING]


def test_reports_a_failure_as_a_failure_and_not_a_success() -> None:
    result: Result[str] = Result.from_failure(FAILURE)

    assert result.failed
    assert not result.success
    assert result.failure is FAILURE
    assert result.diagnostics == [ERROR]


def test_defaults_to_no_diagnostics_rather_than_none() -> None:
    assert Result[str]().diagnostics == []


class TestUnwrapping:
    def test_hands_back_the_value_under_either_name_when_the_operation_worked(self) -> None:
        result = Result.succeeded("the value", [])

        assert result.unwrap() == "the value"
        assert result.artifact == "the value"

    def test_raises_the_failure_rather_than_returning_none_when_it_did_not(self) -> None:
        result: Result[str] = Result.from_failure(FAILURE)

        with pytest.raises(shojiku.UnwrapError, match="generate/document: refused"):
            result.unwrap()

    def test_carries_the_whole_failure_on_the_exception_so_nothing_is_lost(self) -> None:
        result: Result[str] = Result.from_failure(FAILURE)

        with pytest.raises(shojiku.UnwrapError) as caught:
            result.unwrap()

        assert caught.value.failure is FAILURE
        assert caught.value.failure.diagnostics == [ERROR]

    def test_hands_back_a_value_less_success_without_raising(self) -> None:
        # A verify whose payload was empty succeeds with no report. That absence
        # is data, not a failure, so unwrap must not treat it as one.
        assert Result[str]().unwrap() is None
