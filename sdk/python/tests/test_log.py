"""The host-side log channel: what the BINDING did, and nothing the document said."""

from __future__ import annotations

from typing import Any

import shojiku
from shojiku.errors import bounded
from shojiku.failure import Failure, Step
from shojiku.log import Log
from shojiku.result import Result


class Recorder:
    """Any object with a `debug` method is accepted, so this package needs no
    logging dependency of its own."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def debug(self, message: str) -> None:
        self.lines.append(message)


def test_says_nothing_at_all_when_no_logger_was_supplied() -> None:
    # A silent log costs a None check, not string formatting.
    Log().event("library_loaded", path="/x")


def test_reports_what_the_binding_did_with_its_fields() -> None:
    recorder = Recorder()

    Log(recorder).event("library_loaded", path="/opt/lib.so", source="packaged")

    assert recorder.lines == ["shojiku library_loaded path=/opt/lib.so source=packaged"]


def test_times_an_operation_and_records_its_verdict() -> None:
    recorder = Recorder()

    result = Log(recorder).timed("generate", lambda: Result.succeeded("v", []))

    assert result.success
    assert "shojiku generate" in recorder.lines[0]
    assert "ok=True" in recorder.lines[0]
    assert "ms=" in recorder.lines[0]


def test_records_a_failed_operations_verdict_as_well() -> None:
    recorder = Recorder()
    failure = Failure(step=Step.SIGN, kind="key", message="nope")

    Log(recorder).timed("sign", lambda: Result.from_failure(failure))

    assert "ok=False" in recorder.lines[0]


class TestAnApplicationThatSuppliesALogger:
    def test_records_the_library_it_loaded_and_the_abi_revision_it_found(
        self, make_client: Any, engine_library: str
    ) -> None:
        recorder = Recorder()

        make_client(logger=recorder)

        assert any(f"library_loaded path={engine_library}" in line for line in recorder.lines)
        assert any("abi_checked found=1 expected=1" in line for line in recorder.lines)

    def test_records_one_event_per_lifecycle_operation(
        self, make_client: Any, signer: shojiku.LocalPem, keys: str
    ) -> None:
        recorder = Recorder()
        client = make_client(logger=recorder)

        artifact = client.generate("receipt", {"customer": {"name": "x"}}).unwrap()
        signed = client.sign(artifact, signer).unwrap()
        client.verify(signed, anchors=f"{keys}/rsa2048.cert.pem")

        steps = [line.split()[1] for line in recorder.lines]
        assert steps.count("generate") == 1
        assert steps.count("sign") == 1
        assert steps.count("verify") == 1

    def test_names_the_template_it_rendered(self, make_client: Any) -> None:
        recorder = Recorder()

        make_client(logger=recorder).generate("receipt", {"customer": {"name": "x"}})

        assert any(line.startswith("shojiku generate template=receipt ") for line in recorder.lines)

    def test_bounds_that_name_like_every_other_echo(self) -> None:
        # The value the log line carries is produced by the same `bounded`
        # helper a refusal message uses, so a hostile name cannot smuggle
        # control characters or an unbounded run into a log file. Asserted on
        # the helper because only a RESOLVABLE name ever reaches a log line, and
        # a resolvable one is short and clean by construction.
        assert bounded("pay\x00roll\x7f") == "payroll"
        assert bounded("a" * 200) == "a" * 80

    def test_never_logs_params_key_material_the_passphrase_or_diagnostics(
        self, make_client: Any, keys: str
    ) -> None:
        # A log line is the easiest way for a secret to leave a process, and a
        # diagnostic belongs to the result the caller already holds.
        recorder = Recorder()
        client = make_client(logger=recorder)
        provider = shojiku.LocalPem(
            key=f"{keys}/rsa2048.key.pem",
            cert=f"{keys}/rsa2048.cert.pem",
            passphrase="hunter2",
        )

        artifact = client.generate("warns", {"secret": "swordfish"}).unwrap()
        client.sign(artifact, provider)

        whole_log = "\n".join(recorder.lines)
        assert "swordfish" not in whole_log
        assert "hunter2" not in whole_log
        assert "PRIVATE KEY" not in whole_log
        # `warns` emits a text_overflow diagnostic, which must not appear either.
        assert "text_overflow" not in whole_log
