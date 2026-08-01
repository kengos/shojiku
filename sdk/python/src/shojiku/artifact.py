"""A rendered (and possibly signed) document.

The application sees bytes and metadata — never a layout-engine internal, and
never a handle it has to free. Freeing is the binding's job and it is already
done by the time this object exists.
"""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING

from shojiku.diagnostic import Diagnostic

if TYPE_CHECKING:
    from shojiku.client import Client
    from shojiku.result import Result
    from shojiku.verification_report import VerificationReport


class Origin(StrEnum):
    """Where a document came from, which is what a strict client signs on.

    * ``RENDERED`` — laid out from a template the configured root resolved,
    * ``SOURCE`` — laid out from template bytes the application supplied,
    * ``LOADED`` — bytes the application supplied whole.

    Only the first is signable under a lockdown: in the other two the provenance
    of what gets signed is the application's rather than the deployment's, which
    is the distinction strict exists to draw. Signing inherits the origin of what
    it signed — appending a revision does not launder where the document came
    from. Verification is never restricted.
    """

    RENDERED = "rendered"
    SOURCE = "source"
    LOADED = "loaded"


class DocumentArtifact:
    """PDF bytes plus what the engine knows about them."""

    def __init__(
        self,
        bytes_: bytes,
        diagnostics: list[Diagnostic],
        client: Client,
        page_count: int | None = None,
        # The LEAST privileged value, not the most: every internal path states
        # it explicitly, so the default only ever applies to an artifact somebody
        # built by hand — which is bytes handed over whole, and must not become
        # signable under a lockdown by omission.
        origin: Origin = Origin.LOADED,
    ) -> None:
        # The PDF, as binary. PDF bytes are not text and decoding them to `str`
        # is how a document gets corrupted on the way to disk.
        self.bytes = bytes_
        # How many pages the engine laid out. None for an artifact that was
        # signed rather than rendered — signing appends a revision to bytes it
        # never measured, and a zero there would read as "a document with no
        # pages".
        self.page_count = page_count
        self.diagnostics = diagnostics
        self.origin = origin
        self._client = client

    @property
    def loaded(self) -> bool:
        """Whether these bytes were handed over whole rather than laid out here."""
        return self.origin == Origin.LOADED

    @property
    def size(self) -> int:
        return len(self.bytes)

    def write(self, path: str) -> str:
        """Write the document.

        Binary mode explicitly — a PDF contains NUL and every other byte value,
        and text mode would translate line endings on Windows.
        """
        Path(path).write_bytes(self.bytes)
        return path

    def sign(self, provider: object) -> Result[DocumentArtifact]:
        """Sign this document, returning a result carrying the signed artifact.

        The signed bytes begin with these bytes byte for byte: signing appends a
        revision, it never rewrites what was there.
        """
        return self._client.sign(self, provider)

    def verify(
        self,
        anchors: str | list[str] | None = None,
        anchors_pem: bytes | None = None,
    ) -> Result[VerificationReport]:
        """Verify this document against caller-supplied trust anchors."""
        return self._client.verify(self, anchors=anchors, anchors_pem=anchors_pem)
