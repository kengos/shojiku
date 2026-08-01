"""Verification, and the checks it did NOT perform.

Dropping `not_checked` on the way through a binding would turn a missing
capability into a false assurance, which is the one thing a verification API
must never do.
"""

from __future__ import annotations

import pytest

import shojiku
from conftest import read_bytes
from shojiku.verification_report import Check


def test_verifies_a_document_against_the_certificate_that_signed_it(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    result = signed.verify(anchors=f"{keys}/rsa2048.cert.pem")

    assert result.success
    report = result.unwrap()
    assert report.valid
    assert report.signature.passed
    assert report.coverage.passed


def test_carries_the_checks_this_release_does_not_perform_on_a_passing_verdict(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    report = signed.verify(anchors=f"{keys}/rsa2048.cert.pem").unwrap()

    assert report.not_checked == ("revocation", "timestamp")


def test_carries_them_on_a_failing_verdict_as_well(
    client: shojiku.Client,
    rendered: shojiku.DocumentArtifact,
    signed: shojiku.DocumentArtifact,
    keys: str,
) -> None:
    # The whole point of carrying `not_checked`: it must reach the caller
    # either way, so the report rides a FAILED result too.
    # Flip a byte inside the ORIGINAL document body. Corrupting the middle of
    # the SIGNED file lands in the appended revision instead, which leaves a
    # container the verifier cannot parse a signature out of at all — a
    # different outcome (no report) from the one this test is about.
    tampered = bytearray(signed.bytes)
    tampered[len(rendered.bytes) // 2] ^= 0xFF

    result = client.artifact(bytes(tampered)).verify(anchors=f"{keys}/rsa2048.cert.pem")

    assert result.failed
    assert result.report is not None
    assert result.report.not_checked == ("revocation", "timestamp")


def test_fails_the_result_when_the_signed_bytes_were_altered_and_says_which_check(
    client: shojiku.Client,
    rendered: shojiku.DocumentArtifact,
    signed: shojiku.DocumentArtifact,
    keys: str,
) -> None:
    # A signature that does not verify is a FAILED result — so a caller who
    # checks only `success` is not told a forgery is fine.
    # Flip a byte inside the ORIGINAL document body. Corrupting the middle of
    # the SIGNED file lands in the appended revision instead, which leaves a
    # container the verifier cannot parse a signature out of at all — a
    # different outcome (no report) from the one this test is about.
    tampered = bytearray(signed.bytes)
    tampered[len(rendered.bytes) // 2] ^= 0xFF

    result = client.artifact(bytes(tampered)).verify(anchors=f"{keys}/rsa2048.cert.pem")
    report = result.report

    assert result.failed
    assert report is not None
    assert not report.valid
    assert not report.signature.passed
    # The four checks stay separate: "valid but covers only part of the file" is
    # a different fact from "the signature is wrong".
    assert report.coverage.passed
    assert result.failure is not None
    assert result.failure.kind == "signature"


def test_renders_a_check_for_a_log_line_with_the_reason_when_there_is_one() -> None:
    assert str(Check({"status": "passed"})) == "passed"
    assert str(Check({"status": "failed", "reason": "digest mismatch"})) == (
        "failed: digest mismatch"
    )


def test_reports_the_four_checks_under_names_a_caller_can_branch_on(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    report = signed.verify(anchors=f"{keys}/rsa2048.cert.pem").unwrap()

    assert sorted(report.checks) == [
        "certificate_validity",
        "coverage",
        "signature",
        "trust_chain",
    ]


def test_fails_the_chain_when_the_anchor_signed_nothing_here(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    result = signed.verify(anchors=f"{keys}/other-ca.cert.pem")

    assert result.failed
    assert result.report is not None
    assert not result.report.trust_chain.passed


def test_accepts_a_chain_issued_leaf_against_its_authority(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    leaf = shojiku.LocalPem(key=f"{keys}/leaf.key.pem", cert=f"{keys}/leaf.cert.pem")
    document = rendered.sign(leaf).unwrap()

    result = document.verify(anchors=f"{keys}/ca.cert.pem")

    assert result.success
    assert result.unwrap().trust_chain.passed


def test_fails_validity_not_the_signature_for_an_expired_certificate(
    rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    expired = shojiku.LocalPem(key=f"{keys}/leaf.key.pem", cert=f"{keys}/leaf-expired.cert.pem")
    document = rendered.sign(expired).unwrap()

    report = document.verify(anchors=f"{keys}/ca.cert.pem").report

    assert report is not None
    assert not report.certificate_validity.passed
    assert report.signature.passed


def test_takes_several_anchor_files_at_once_as_the_cli_takes_several_flags(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    result = signed.verify(anchors=[f"{keys}/other-ca.cert.pem", f"{keys}/rsa2048.cert.pem"])

    assert result.success


def test_takes_anchors_as_bytes_for_a_certificate_that_never_touched_disk(
    signed: shojiku.DocumentArtifact, keys: str
) -> None:
    result = signed.verify(anchors_pem=read_bytes(f"{keys}/rsa2048.cert.pem"))

    assert result.success


def test_gives_no_report_at_all_for_a_document_with_no_signature_in_it(
    client: shojiku.Client, rendered: shojiku.DocumentArtifact, keys: str
) -> None:
    # A document that cannot be evaluated at all has NO report, which is a
    # different fact from an empty one.
    result = client.artifact(rendered.bytes).verify(anchors=f"{keys}/rsa2048.cert.pem")

    assert result.failed
    assert result.report is None


def test_reports_unusable_anchors_as_a_failed_result(
    signed: shojiku.DocumentArtifact,
) -> None:
    result = signed.verify(anchors_pem=b"not a pem at all")

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "anchors"


def test_reports_an_unreadable_anchor_file_as_a_failed_result_not_an_exception(
    signed: shojiku.DocumentArtifact,
) -> None:
    result = signed.verify(anchors="/nonexistent/anchor.pem")

    assert result.failed
    assert result.failure is not None
    assert result.failure.kind == "anchor_unreadable"
    assert result.failure.step == shojiku.Step.VERIFY


def test_requires_anchors_since_there_is_no_trust_store_to_fall_back_on(
    signed: shojiku.DocumentArtifact,
) -> None:
    # A default would answer a different question than the caller asked.
    with pytest.raises(shojiku.UsageError, match="verify needs"):
        signed.verify()
