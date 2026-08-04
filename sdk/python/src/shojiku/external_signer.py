"""A signing provider for a key this process is never given.

The second provider, and the shape :class:`~shojiku.local_pem.LocalPem`'s own
docstring promised: a new class rather than new arguments on ``sign``, so the
call site is unchanged in all seven SDKs.

The engine hands out the bytes a signature has to cover; the callable signs them
wherever the key actually lives — AWS KMS, Google Cloud KMS, an HSM, a
smartcard, another service entirely — and hands the signature back::

    provider = shojiku.ExternalSigner(
        lambda to_be_signed: kms.sign(
            KeyId=os.environ["KEY_ID"],
            Message=to_be_signed,
            MessageType="RAW",
            SigningAlgorithm="ECDSA_SHA_256",
        )["Signature"],
        cert="signer.crt",
        algorithm=shojiku.Algorithm.ECDSA_P256_SHA256,
    )
    client.sign(artifact, provider)

Shojiku ships no cloud client of its own, deliberately: the callable is whatever
client your application already has, and the SDK stays a wrapper with nothing to
keep in step with a vendor's releases.

**What the callable receives is the signed ATTRIBUTES, not the document
digest.** A service that signs a digest must hash these bytes with SHA-256
itself. Signing the document digest instead produces a document that fails
verification, so the distinction is not cosmetic.

The signature is the raw output of that operation: PKCS#1 v1.5 bytes for
``rsa-pkcs1-sha256``, an ASN.1 DER sequence for ``ecdsa-p256-sha256`` — which is
what both major cloud key services return unchanged.
"""

from __future__ import annotations

import json
from base64 import b64decode
from enum import Enum
from typing import TYPE_CHECKING

from shojiku.errors import UsageError, read_material

if TYPE_CHECKING:
    from collections.abc import Callable

    from shojiku.engine import Engine, Snapshot


class Algorithm(str, Enum):
    """The algorithms the engine can write a signature for.

    A ``str`` enum so the wire spelling IS the value: a caller reading a name
    out of a configuration file passes the string, a caller writing code passes
    the member, and neither needs a translation table.
    """

    RSA_PKCS1_SHA256 = "rsa-pkcs1-sha256"
    ECDSA_P256_SHA256 = "ecdsa-p256-sha256"


_FORMS = "`cert` (a path) or `cert_pem` (bytes)"
_NAMED = " or ".join(f'"{member.value}"' for member in Algorithm)


class ExternalSigner:
    """A certificate, an algorithm, and a callable that signs bytes."""

    def __init__(
        self,
        sign: Callable[[bytes], bytes],
        cert: str | None = None,
        cert_pem: bytes | None = None,
        algorithm: Algorithm | str | None = None,
    ) -> None:
        self._sign = sign
        self._cert_path = cert
        self._cert_pem = cert_pem
        self.algorithm = self._wire_algorithm(algorithm)
        self._one_source(cert, cert_pem)
        if not callable(sign):
            raise UsageError("ExternalSigner needs a callable that signs the bytes it is given")

    def __repr__(self) -> str:
        """Redacted for the same reason :class:`LocalPem`'s is.

        Nothing here is key material — that is the point of this provider — but
        a callable closes over whatever built it, which in practice is a client
        holding credentials.
        """
        form = self._cert_path if self._cert_path else "[pem bytes]"
        return f"<{type(self).__name__} cert={form} algorithm={self.algorithm}>"

    @property
    def certificate(self) -> bytes:
        if self._cert_pem is None:
            self._cert_pem = read_material(str(self._cert_path), "certificate_unreadable")
        return self._cert_pem

    def sign_with(self, engine: Engine, pdf: bytes) -> Snapshot:
        """Sign ``pdf`` in two calls, with the callable in between.

        Both engine calls take the same document, certificate and algorithm:
        the pair is stateless, so the second re-derives what the first prepared.
        Keeping them inside ONE method is what makes that impossible to get
        wrong from Python — there is no way to pair a prepare of one document
        with a complete of another.

        A prepare that did not succeed is returned as it is: an unreadable
        certificate or a document the signer refuses is a fact about the
        inputs, and paying for a signature afterwards would tell the caller
        nothing new.
        """
        wire = self.algorithm.encode("utf-8")
        prepared = engine.sign_prepare(pdf=pdf, certificate=self.certificate, algorithm=wire)
        if prepared.status != 0 or not prepared.success:
            return prepared

        return engine.sign_complete(
            pdf=pdf,
            certificate=self.certificate,
            algorithm=wire,
            signature=self._signature_for(prepared),
        )

    def _signature_for(self, prepared: Snapshot) -> bytes:
        """Run the callable over the bytes the engine wants signed.

        The callable's own exceptions are deliberately not caught: it is the
        caller's code talking to the caller's key service, and turning its
        failures into a failed result would file a caller's outage under
        "something was wrong with this document".
        """
        to_be_signed = b64decode(json.loads(prepared.json)["toBeSigned"])
        signature = self._sign(to_be_signed)
        if not isinstance(signature, bytes) or not signature:
            raise UsageError(
                "the signer callable must return the signature as non-empty bytes"
            )
        return signature

    @staticmethod
    def _wire_algorithm(algorithm: Algorithm | str | None) -> str:
        if algorithm is None:
            raise UsageError(f"ExternalSigner needs `algorithm` ({_NAMED})")
        try:
            return Algorithm(algorithm).value
        except ValueError as error:
            # The caller's string is never echoed — the accepted names are the
            # useful half, and the value came from configuration this package
            # does not control.
            raise UsageError(f"`algorithm` must be one of {_NAMED}") from error

    @staticmethod
    def _one_source(path: str | None, pem: bytes | None) -> None:
        """Explicit, never sniffed, in BOTH directions — :class:`LocalPem`'s rule."""
        if path is not None and pem is not None:
            raise UsageError(f"ExternalSigner takes either {_FORMS}, not both")
        if path is None and pem is None:
            raise UsageError(f"ExternalSigner needs either {_FORMS}")
