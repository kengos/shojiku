"""Signing, and the material it takes — explicitly, never sniffed."""

from __future__ import annotations

from pathlib import Path

import pytest

import shojiku
from conftest import read_bytes


def test_signs_a_rendered_document_appending_rather_than_rewriting(
    rendered: shojiku.DocumentArtifact, signer: shojiku.LocalPem
) -> None:
    result = rendered.sign(signer)

    assert result.success
    # The signed bytes begin with the input byte for byte: signing appends a
    # revision, it never rewrites what was there.
    assert result.unwrap().bytes.startswith(rendered.bytes)
    assert len(result.unwrap().bytes) > len(rendered.bytes)


def test_reports_no_page_count_for_a_signed_artifact_having_laid_nothing_out(
    signed: shojiku.DocumentArtifact,
) -> None:
    # Absent, not zero: a zero would read as "a document with no pages".
    assert signed.page_count is None


def test_signs_with_an_encrypted_key_when_the_passphrase_is_supplied(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    passphrase = Path(f"{keys}/passphrase.txt").read_text(encoding="utf-8")
    provider = shojiku.LocalPem(
        key=f"{keys}/rsa2048.enc.pem", cert=f"{keys}/rsa2048.cert.pem", passphrase=passphrase
    )

    assert rendered.sign(provider).success


def test_names_the_missing_passphrase_rather_than_failing_to_parse_the_key(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    provider = shojiku.LocalPem(key=f"{keys}/rsa2048.enc.pem", cert=f"{keys}/rsa2048.cert.pem")

    failure = rendered.sign(provider).failure

    assert failure is not None
    assert failure.kind == "passphrase_required"


def test_fails_structurally_on_a_wrong_passphrase(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    provider = shojiku.LocalPem(
        key=f"{keys}/rsa2048.enc.pem", cert=f"{keys}/rsa2048.cert.pem", passphrase="wrong"
    )

    result = rendered.sign(provider)

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "key"


def test_signs_from_key_material_already_in_memory(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    # So a key fetched from a secret manager never has to be written to disk.
    provider = shojiku.LocalPem(
        key_pem=read_bytes(f"{keys}/rsa2048.key.pem"),
        cert_pem=read_bytes(f"{keys}/rsa2048.cert.pem"),
    )

    assert rendered.sign(provider).success


def test_reports_an_unreadable_key_as_a_failed_result_not_an_exception(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    provider = shojiku.LocalPem(key="/nonexistent.pem", cert=f"{keys}/rsa2048.cert.pem")

    result = rendered.sign(provider)

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "key_unreadable"


def test_reports_an_unreadable_certificate_the_same_way(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    provider = shojiku.LocalPem(key=f"{keys}/rsa2048.key.pem", cert="/nonexistent.pem")

    result = rendered.sign(provider)

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "certificate_unreadable"


@pytest.mark.parametrize("what", ["key", "cert"])
def test_needs_a_key_and_a_certificate_in_one_form_or_the_other(what: str, keys: str) -> None:
    other = "cert" if what == "key" else "key"

    with pytest.raises(shojiku.UsageError, match=f"LocalPem needs either `{what}`"):
        shojiku.LocalPem(**{other: f"{keys}/rsa2048.{other}.pem"})  # type: ignore[arg-type]


@pytest.mark.parametrize("what", ["key", "cert"])
def test_refuses_both_forms_of_the_same_material_at_once(what: str, keys: str) -> None:
    # Explicit, never sniffed — in BOTH directions. Accepting both and silently
    # preferring one ignores the argument the caller meant.
    material = {what: "/some/path.pem", f"{what}_pem": b"-----BEGIN-----"}
    other = "cert" if what == "key" else "key"
    material[other] = f"{keys}/rsa2048.{other}.pem"

    with pytest.raises(shojiku.UsageError, match=f"LocalPem takes either `{what}`"):
        shojiku.LocalPem(**material)  # type: ignore[arg-type]


def test_refuses_both_anchor_forms_at_once_and_demands_one_of_them(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    with pytest.raises(shojiku.UsageError, match="not both"):
        signed.verify(anchors=f"{keys}/rsa2048.cert.pem", anchors_pem=b"x")

    with pytest.raises(shojiku.UsageError, match="verify needs"):
        signed.verify()


class TestItsPrintedForm:
    def test_shows_neither_key_material_nor_the_passphrase(self, keys: str) -> None:
        # The default repr prints every attribute — the private key and the
        # passphrase — into a console, a REPL, or an exception reporter's dump.
        provider = shojiku.LocalPem(
            key_pem=read_bytes(f"{keys}/rsa2048.key.pem"),
            cert_pem=read_bytes(f"{keys}/rsa2048.cert.pem"),
            passphrase="hunter2",
        )

        printed = repr(provider)

        assert "PRIVATE KEY" not in printed
        assert "hunter2" not in printed
        assert "[redacted]" in printed

    def test_still_says_enough_to_tell_which_provider_loaded_the_wrong_material(
        self, keys: str
    ) -> None:
        # A configured file path is not secret and is the one thing worth seeing.
        printed = repr(
            shojiku.LocalPem(key=f"{keys}/rsa2048.key.pem", cert=f"{keys}/rsa2048.cert.pem")
        )

        assert "rsa2048.key.pem" in printed
        assert "LocalPem" in printed
        assert "passphrase=none" in printed

    def test_names_the_form_rather_than_the_bytes_for_in_memory_material(self, keys: str) -> None:
        printed = repr(
            shojiku.LocalPem(
                key_pem=read_bytes(f"{keys}/rsa2048.key.pem"),
                cert_pem=read_bytes(f"{keys}/rsa2048.cert.pem"),
            )
        )

        assert "[pem bytes]" in printed

    def test_holds_when_the_provider_is_printed_inside_a_registry(self, keys: str) -> None:
        # A container's repr calls its members' repr, which is exactly how a
        # provider reaches a log line nobody meant to write it to.
        registry = {
            "invoice": shojiku.LocalPem(
                key_pem=read_bytes(f"{keys}/rsa2048.key.pem"),
                cert_pem=read_bytes(f"{keys}/rsa2048.cert.pem"),
                passphrase="hunter2",
            )
        }

        printed = repr(registry)

        assert "PRIVATE KEY" not in printed
        assert "hunter2" not in printed


def test_never_echoes_key_material_or_the_passphrase_in_a_failure(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    key_material = read_bytes(f"{keys}/rsa2048.enc.pem").decode("utf-8")
    provider = shojiku.LocalPem(
        key=f"{keys}/rsa2048.enc.pem", cert=f"{keys}/rsa2048.cert.pem", passphrase="hunter2"
    )

    failure = rendered.sign(provider).failure

    assert failure is not None
    whole_trace = " ".join(str(cause) for cause in failure.causes)
    assert "hunter2" not in whole_trace
    assert "PRIVATE KEY" not in whole_trace
    assert key_material.splitlines()[1] not in whole_trace


def test_echoes_no_key_material_when_a_signing_failure_is_unwrapped(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    # The raising accessor reaches a traceback, which is a different audience
    # from a rescue clause and a log aggregator.
    provider = shojiku.LocalPem(
        key=f"{keys}/rsa2048.enc.pem", cert=f"{keys}/rsa2048.cert.pem", passphrase="hunter2"
    )

    with pytest.raises(shojiku.UnwrapError) as caught:
        rendered.sign(provider).unwrap()

    assert "hunter2" not in str(caught.value)
    assert "PRIVATE KEY" not in str(caught.value)
