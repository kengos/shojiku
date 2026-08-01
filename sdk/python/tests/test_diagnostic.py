"""Diagnostics are parsed and passed through, never interpreted."""

from __future__ import annotations

from shojiku.diagnostic import Diagnostic


def test_renders_a_diagnostic_with_its_path_for_a_log_line() -> None:
    diagnostic = Diagnostic(
        {"severity": "warning", "message": "the box is too small", "path": "sections.body.items[0]"}
    )

    assert str(diagnostic) == "sections.body.items[0]: the box is too small"


def test_renders_a_diagnostic_without_a_path_as_its_message_alone() -> None:
    assert str(Diagnostic({"message": "no path here"})) == "no path here"


def test_yields_nothing_for_an_absent_diagnostics_payload() -> None:
    assert Diagnostic.parse("") == []


def test_yields_nothing_for_a_payload_whose_items_are_null() -> None:
    assert Diagnostic.parse('{"items": null}') == []


def test_defaults_typed_args_to_an_empty_map_rather_than_none() -> None:
    # `args` is the translating consumer's input; a None there would make every
    # caller guard before reading it.
    assert Diagnostic({"code": "text_overflow"}).args == {}
