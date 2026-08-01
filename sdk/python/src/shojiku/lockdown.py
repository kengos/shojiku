"""The input ceiling an operator can declare, and its named signing providers.

Once signing is in the loop, template input is a security boundary: whoever
controls the bytes controls what gets signed. A strict client therefore narrows
where signable input may come from.

* The bytes-first entrance is refused, so every document this client signs came
  from the configured template root, with its containment rules.
* An artifact this client did not render may not be signed — those bytes are the
  caller's, exactly like a bytes-first template.
* Signing material must be a provider REGISTERED in configuration and named at
  the call site, so a key path never appears in request-handling code and the
  material is loaded by one object rather than rebuilt per request.

**Verification is never restricted.** Verifying bytes of unknown provenance is
the entire point of verify, and a locked-down deployment is precisely the one
that needs to check an archived document it did not produce.

Refusals raise :class:`~shojiku.errors.UsageError` rather than returning a
failed result: strict disables an ENTRANCE, so calling it is the program
contradicting its own deployment's configuration — not a fact about a document —
and a failed result is something ``if result.success:`` can swallow.

The six other SDKs mirror this with identical semantics. It is contract, not
ecosystem idiom.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from shojiku.artifact import Origin
from shojiku.errors import UsageError, bounded

if TYPE_CHECKING:
    from shojiku.artifact import DocumentArtifact


class Lockdown:
    """One client's ceiling: which entrances are open, and which providers exist."""

    def __init__(self, strict: bool, providers: dict[str, object] | None = None) -> None:
        self.strict = strict
        self._providers = dict(providers or {})

    def source_entrance(self) -> None:
        """The bytes-first entrance."""
        if not self.strict:
            return

        raise UsageError(
            "this client is strict: templates must come from the template root, so "
            "`generate_source` is disabled. Use `generate(name, params)`."
        )

    def signable(self, artifact: DocumentArtifact) -> None:
        """An artifact about to be signed.

        Only a document laid out from a template the ROOT resolved qualifies —
        bytes handed over whole, and bytes laid out from a caller's own template,
        are the same trust class here. That closes the gap a boolean "was it
        loaded" would leave open: an artifact from another client's bytes-first
        render is not this deployment's document either.
        """
        if not self.strict or artifact.origin == Origin.RENDERED:
            return

        raise UsageError(
            "this client is strict: only a document rendered from its own template "
            f"root may be signed (this one is {artifact.origin}). It can still be "
            "verified."
        )

    def provider(self, provider: object) -> object:
        """The provider to sign with.

        A string is a registered name, in strict mode and out of it — naming
        providers is good practice everywhere, and only the REFUSAL of the
        alternative is strict's. A provider object is accepted only when this
        client is not strict.
        """
        if isinstance(provider, str):
            return self._registered(provider)
        if not self.strict:
            return provider

        raise UsageError(
            "this client is strict: sign with the name of a provider registered in "
            "configuration, not with a provider object."
        )

    def _registered(self, name: str) -> object:
        try:
            return self._providers[name]
        except KeyError as error:
            raise UsageError(
                f"no signing provider named `{bounded(name)}` is registered"
            ) from error
