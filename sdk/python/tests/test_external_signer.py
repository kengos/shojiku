"""Signing with a key this process is never given.

The engine hands out bytes, something else signs them, and the finished
document has to verify. Nothing is stubbed: the callable here runs `openssl`
over the bytes it is handed, which is exactly the shape a cloud key service
takes from this package's point of view.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

import shojiku


def openssl_signer(key_path: str, tmp_path: Path) -> Any:
    """A stand-in for a key service: signs with a key this package never sees.

    `openssl dgst -sha256 -sign` produces exactly what the engine expects —
    PKCS#1 v1.5 bytes for an RSA key, an ASN.1 DER sequence for an EC one —
    which is also what AWS KMS and Google Cloud KMS return.
    """

    def sign(to_be_signed: bytes) -> bytes:
        message = tmp_path / "to-be-signed.bin"
        message.write_bytes(to_be_signed)
        signature = tmp_path / "signature.bin"
        subprocess.run(
            [
                "openssl",
                "dgst",
                "-sha256",
                "-sign",
                key_path,
                "-out",
                str(signature),
                str(message),
            ],
            check=True,
        )
        return signature.read_bytes()

    return sign


class TestTheRoundTrip:
    def test_signs_a_rendered_document_that_then_verifies(
        self, rendered: shojiku.DocumentArtifact, keys: str, tmp_path: Path
    ) -> None:
        provider = shojiku.ExternalSigner(
            openssl_signer(f"{keys}/rsa2048.key.pem", tmp_path),
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        result = rendered.sign(provider)

        assert result.success
        # Signing appends a revision; it never rewrites what was there.
        assert result.unwrap().bytes.startswith(rendered.bytes)
        assert result.unwrap().verify(anchors=f"{keys}/rsa2048.cert.pem").unwrap().valid

    def test_signs_with_an_elliptic_curve_key_as_well(
        self, rendered: shojiku.DocumentArtifact, keys: str, tmp_path: Path
    ) -> None:
        provider = shojiku.ExternalSigner(
            openssl_signer(f"{keys}/ec256.key.pem", tmp_path),
            cert=f"{keys}/ec256.cert.pem",
            algorithm="ecdsa-p256-sha256",
        )

        signed = rendered.sign(provider).unwrap()

        assert signed.verify(anchors=f"{keys}/ec256.cert.pem").unwrap().valid

    def test_hands_the_callable_the_signed_attributes_not_the_document_digest(
        self, rendered: shojiku.DocumentArtifact, keys: str, tmp_path: Path
    ) -> None:
        # The distinction the shorthand gets wrong: signing the digest instead
        # produces a document that fails verification, so this is pinned rather
        # than left to the docstring.
        seen: list[bytes] = []
        inner = openssl_signer(f"{keys}/rsa2048.key.pem", tmp_path)

        def watch(to_be_signed: bytes) -> bytes:
            seen.append(to_be_signed)
            return inner(to_be_signed)

        rendered.sign(
            shojiku.ExternalSigner(
                watch,
                cert=f"{keys}/rsa2048.cert.pem",
                algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
            )
        )

        assert len(seen) == 1
        # A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not
        # the 32-byte SHA-256 digest.
        assert seen[0][0] == 0x31
        assert len(seen[0]) != 32


class TestWhatCountsAsMisuse:
    def test_refuses_a_callable_that_returns_nothing_to_write(
        self, rendered: shojiku.DocumentArtifact, keys: str
    ) -> None:
        provider = shojiku.ExternalSigner(
            lambda _: b"",
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        with pytest.raises(shojiku.UsageError, match="non-empty bytes"):
            rendered.sign(provider)

    def test_refuses_a_callable_that_returns_something_other_than_bytes(
        self, rendered: shojiku.DocumentArtifact, keys: str
    ) -> None:
        provider = shojiku.ExternalSigner(
            lambda _: "a signature, allegedly",  # type: ignore[arg-type,return-value]
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        with pytest.raises(shojiku.UsageError, match="non-empty bytes"):
            rendered.sign(provider)

    def test_refuses_a_signer_that_is_not_callable(self, keys: str) -> None:
        with pytest.raises(shojiku.UsageError, match="callable"):
            shojiku.ExternalSigner(
                "not a function",  # type: ignore[arg-type]
                cert=f"{keys}/rsa2048.cert.pem",
                algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
            )

    def test_refuses_both_forms_of_the_certificate_at_once(self, keys: str) -> None:
        with pytest.raises(shojiku.UsageError, match="not both"):
            shojiku.ExternalSigner(
                lambda _: b"x",
                cert=f"{keys}/rsa2048.cert.pem",
                cert_pem=b"-----BEGIN CERTIFICATE-----",
                algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
            )

    def test_refuses_neither_form_of_the_certificate(self) -> None:
        with pytest.raises(shojiku.UsageError, match="needs either"):
            shojiku.ExternalSigner(lambda _: b"x", algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256)

    def test_needs_an_algorithm(self, keys: str) -> None:
        with pytest.raises(shojiku.UsageError, match="needs `algorithm`"):
            shojiku.ExternalSigner(lambda _: b"x", cert=f"{keys}/rsa2048.cert.pem")

    def test_names_the_accepted_algorithms_without_echoing_the_one_asked_for(
        self, keys: str
    ) -> None:
        with pytest.raises(shojiku.UsageError) as raised:
            shojiku.ExternalSigner(
                lambda _: b"x",
                cert=f"{keys}/rsa2048.cert.pem",
                algorithm="rsa-pkcs1-sha1",
            )

        assert "rsa-pkcs1-sha256" in str(raised.value)
        assert "ecdsa-p256-sha256" in str(raised.value)
        assert "sha1" not in str(raised.value)


class TestWhatIsNotThisPackagesProblem:
    def test_lets_the_callables_own_failure_out_rather_than_filing_it_as_a_document(
        self, rendered: shojiku.DocumentArtifact, keys: str
    ) -> None:
        # A key service outage is the caller's, not a fact about this document.
        class KeyServiceDownError(RuntimeError):
            pass

        def unavailable(_: bytes) -> bytes:
            raise KeyServiceDownError("the key service is unreachable")

        provider = shojiku.ExternalSigner(
            unavailable,
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        with pytest.raises(KeyServiceDownError):
            rendered.sign(provider)

    def test_returns_a_refused_document_without_ever_asking_for_a_signature(
        self, client: shojiku.Client, keys: str
    ) -> None:
        # The engine itself refuses: these bytes are not a document it rendered.
        asked: list[bytes] = []

        def record(to_be_signed: bytes) -> bytes:
            asked.append(to_be_signed)
            return b"never reached"

        provider = shojiku.ExternalSigner(
            record,
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        result = client.sign(client.artifact(b"not a PDF at all"), provider)

        assert result.failed
        assert asked == []

    def test_returns_a_failed_prepare_without_ever_asking_for_a_signature(
        self, rendered: shojiku.DocumentArtifact, tmp_path: Path
    ) -> None:
        # An unreadable certificate is a fact about the inputs; paying for a
        # signature afterwards would tell the caller nothing new.
        asked: list[bytes] = []

        def record(to_be_signed: bytes) -> bytes:
            asked.append(to_be_signed)
            return b"never reached"

        provider = shojiku.ExternalSigner(
            record,
            cert=str(tmp_path / "no-such-certificate.pem"),
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        result = rendered.sign(provider)

        assert result.failed
        assert asked == []


class TestWhatItPrints:
    def test_shows_the_certificate_form_and_the_algorithm_and_nothing_else(self, keys: str) -> None:
        provider = shojiku.ExternalSigner(
            lambda _: b"x",
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.ECDSA_P256_SHA256,
        )

        shown = repr(provider)

        assert "rsa2048.cert.pem" in shown
        assert "ecdsa-p256-sha256" in shown
        assert "lambda" not in shown

    def test_says_so_when_the_certificate_came_from_memory(self) -> None:
        provider = shojiku.ExternalSigner(
            lambda _: b"x",
            cert_pem=b"-----BEGIN CERTIFICATE-----",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )

        assert "[pem bytes]" in repr(provider)


class TestUnderALockedDownClient:
    def test_signs_when_registered_by_name(
        self,
        make_client: Any,
        rendered: shojiku.DocumentArtifact,
        keys: str,
        tmp_path: Path,
    ) -> None:
        # The provider a strict deployment is allowed to use is a NAMED one, and
        # an external signer is as nameable as a local key.
        provider = shojiku.ExternalSigner(
            openssl_signer(f"{keys}/rsa2048.key.pem", tmp_path),
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )
        client = make_client(providers={"kms": provider})

        assert client.sign(rendered, "kms").success

    def test_refuses_a_bare_provider_object_when_strict(
        self, make_client: Any, rendered: shojiku.DocumentArtifact, keys: str
    ) -> None:
        provider = shojiku.ExternalSigner(
            lambda _: b"x",
            cert=f"{keys}/rsa2048.cert.pem",
            algorithm=shojiku.Algorithm.RSA_PKCS1_SHA256,
        )
        client = make_client(strict=True, providers={"kms": provider})

        with pytest.raises(shojiku.UsageError, match="registered in configuration"):
            client.sign(rendered, provider)
