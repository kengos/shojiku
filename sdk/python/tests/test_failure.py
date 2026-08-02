"""The failure trace: a value, with the chain underneath it."""

from __future__ import annotations

from shojiku.failure import Failure, Step

INNER = Failure(step=Step.GENERATE, kind="io", message="no such file")
OUTER = Failure(step=Step.GENERATE, kind="template_not_found", message="no template", cause=INNER)


def test_flattens_the_cause_chain_outermost_first() -> None:
    assert OUTER.causes == [OUTER, INNER]


def test_reads_as_step_kind_and_message() -> None:
    assert str(INNER) == "generate/io: no such file"


def test_falls_back_to_the_step_it_was_given_when_the_engine_sent_no_error_object() -> None:
    failure = Failure.from_error_json(None, step=Step.SIGN)

    assert failure.step == Step.SIGN
    assert failure.kind == "unknown"
    assert failure.message == ""


def test_takes_the_engine_kind_and_message_off_the_wire() -> None:
    failure = Failure.from_error_json(
        '{"kind": "document", "message": "refused"}', step=Step.VERIFY
    )

    assert (failure.kind, failure.message) == ("document", "refused")


def test_treats_an_empty_error_payload_as_no_error_object() -> None:
    assert Failure.from_error_json("", step=Step.GENERATE).kind == "unknown"
