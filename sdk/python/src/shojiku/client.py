"""The entry point: a configured engine, and the sources to render with it.

```python
client = shojiku.Client(templates="app/templates")
result = client.generate("receipt_ja", {"customer": {"name": "…"}})
if result.success:
    result.artifact.write("receipt.pdf")
```

**Two entrances, deliberately.** :meth:`Client.generate` takes a template NAME
and resolves it against the configured root, which is where the containment
rules live. :meth:`Client.generate_source` takes the sources as BYTES the
application already has — fetched from object storage, read out of a database,
written inline — because fetching is the application's act and this package
downloads nothing. Root containment does not apply to bytes a caller supplied:
there is no root to be contained by, which is exactly why a strict client
refuses that entrance.

**Precedence, and its one deliberate asymmetry.** An explicit ``templates=``
beats :func:`shojiku.configure`, which beats ``SHOJIKU_TEMPLATE_ROOT``; the pack
directories resolve the same way. What an application renders is the
application's own decision. An explicit ``library=`` is the other way round —
``SHOJIKU_LIBRARY`` beats it — because where the ENGINE lives is an operator's
decision that has to be able to win over application code, the same order the
subprocess SDKs give ``SHOJIKU_BIN``. Passing ``env=False`` disables every one
of those lookups at once. ``strict`` is the one setting :func:`shojiku.configure`
wins outright.
"""

from __future__ import annotations

import json
from typing import Any

from shojiku import outcome
from shojiku.artifact import DocumentArtifact, Origin
from shojiku.engine import Engine
from shojiku.errors import MaterialUnreadableError, UsageError, bounded, read_material
from shojiku.failure import Failure, Step
from shojiku.request import Request
from shojiku.result import Result
from shojiku.settings import Settings
from shojiku.sources import Sources
from shojiku.template_root import RejectedError, TemplateRoot
from shojiku.verification_report import VerificationReport

ANCHOR_FORMS = "`anchors` (paths) or `anchors_pem` (bytes)"


class Client:
    """A configured engine and the sources to render with it."""

    # Nine settings, and every one of them is the cross-language contract's —
    # collapsing them into an options object would be this SDK inventing a shape
    # the other six do not have.
    def __init__(  # noqa: PLR0913
        self,
        templates: str | None = None,
        font_dirs: list[str] | None = None,
        locale_dirs: list[str] | None = None,
        lang: str | None = None,
        library: str | None = None,
        logger: Any = None,
        strict: bool | None = None,
        providers: dict[str, Any] | None = None,
        env: bool | None = None,
    ) -> None:
        self._settings = Settings(
            templates=templates,
            font_dirs=font_dirs,
            locale_dirs=locale_dirs,
            lang=lang,
            library=library,
            logger=logger,
            strict=strict,
            providers=providers,
            env=env,
        )
        self._engine = Engine(self._settings.library)

    @property
    def template_root(self) -> TemplateRoot | None:
        return self._settings.template_root

    def engine_info(self) -> dict[str, Any]:
        """What this build of the engine can do.

        Its version, capability keys and builtin locales. Gate a feature on this
        rather than on a package version.

        A plain dict, deliberately. The payload is an append-only wire this SDK
        does not model, exactly as a diagnostic's typed ``args`` pass through
        untranslated: a typed value object would have to grow a field in seven
        languages every time the engine adds one, and an application reading a
        key its engine is too old to send already has to handle a missing one.
        """
        snapshot = self._engine.engine_info()
        outcome.guard(snapshot)
        return dict(json.loads(snapshot.json))

    def generate(
        self, name: str, params: Any = None, lang: str | None = None
    ) -> Result[DocumentArtifact]:
        """Render ``name`` with ``params``.

        ``params`` may be a dict (serialized here) or a str you already have —
        JSON or YAML, since the engine parses either and a str is passed through
        verbatim.

        ``lang`` overrides this client's locale for this call alone, which is how
        a multi-locale application renders one template per buyer's locale
        without building a second client. (The ruby reference spells the same
        override as a derived client, because a keyword beside its trailing-hash
        params would break the ordinary call form; what every SDK mirrors is that
        a per-call locale beats the client-wide one, not the spelling.)

        A rejected template name is a FAILED RESULT, not an exception: a hostile
        name is a fact about the request, not a bug in the program. A name that
        is not a str at all IS a bug in the program, and raises.
        """
        try:
            sources = self._template_root().resolve(name)
        except RejectedError as error:
            return Result.from_failure(self._rejection(error, Step.GENERATE))

        return self._render(
            sources, params, origin=Origin.RENDERED, lang=lang, template=bounded(name)
        )

    def generate_source(
        self,
        template: str,
        definitions: str | None = None,
        assets_dir: str | None = None,
        params: Any = None,
        lang: str | None = None,
    ) -> Result[DocumentArtifact]:
        """Render sources the APPLICATION supplies.

        For templates that do not live in a directory this package can see:
        fetched from object storage, stored in a database, or written inline.
        Fetching them stays the application's act — nothing here opens a socket.

        ``template`` is source TEXT, never a path: a path-shaped value is a
        template that fails to parse. An SDK that helpfully opened it would make
        every containment rule bypassable by spelling the same thing differently.

        ``assets_dir`` is per call rather than per client, because bundled assets
        belong to a template rather than to a deployment. Without it, bundled
        image sources are disabled: inline sources have no directory of their own.
        """
        self._settings.lockdown.source_entrance()
        sources = Sources(template=template, definitions=definitions, assets_dir=assets_dir)
        return self._render(sources, params, origin=Origin.SOURCE, lang=lang)

    def artifact(self, data: bytes) -> DocumentArtifact:
        """Re-enter an archived document.

        So bytes signed some time ago can be verified — or re-signed — without
        hand-building an artifact.

        The result is marked as LOADED: its bytes are the caller's rather than
        this client's own render, which is a distinction a strict client acts on.
        ``page_count`` is None, honestly: nothing here laid anything out.
        """
        return DocumentArtifact(bytes_=data, diagnostics=[], client=self, origin=Origin.LOADED)

    def sign(self, artifact: DocumentArtifact, provider: object) -> Result[DocumentArtifact]:
        """Sign an artifact with ``provider``.

        The signed bytes begin with the input byte for byte — signing appends a
        revision.

        ``provider`` is a :class:`~shojiku.local_pem.LocalPem` (or another
        provider object), or the NAME of one registered in configuration. A
        strict client takes the name only.
        """
        signer = self._settings.lockdown.provider(provider)
        self._settings.lockdown.signable(artifact)
        return self._settings.log.timed("sign", lambda: self._signed(artifact, signer))

    def verify(
        self,
        artifact: DocumentArtifact,
        anchors: str | list[str] | None = None,
        anchors_pem: bytes | None = None,
    ) -> Result[VerificationReport]:
        """Verify an artifact against trust anchors.

        Anchors are required and are given as paths (``anchors``, one or several)
        or as PEM bytes (``anchors_pem``, which may carry several concatenated).
        Which form you passed is explicit rather than sniffed, and passing both
        raises rather than silently preferring one. There is no fallback to the
        machine's trust store, because the engine never consults one — a default
        would answer a different question than you asked.

        A signature that does not verify is a FAILED result that still carries
        the report, so ``not_checked`` reaches you either way.
        """
        try:
            pem = self._anchor_material(anchors, anchors_pem)
        except MaterialUnreadableError as error:
            return Result.from_failure(
                Failure(step=Step.VERIFY, kind=error.kind, message=str(error))
            )

        return self._settings.log.timed(
            "verify", lambda: outcome.verdict(self._engine.verify(pdf=artifact.bytes, anchors=pem))
        )

    def _render(
        self,
        sources: Sources,
        params: Any,
        origin: Origin,
        lang: str | None,
        **fields: Any,
    ) -> Result[DocumentArtifact]:
        request = Request(
            sources=sources,
            params={} if params is None else params,
            lang=lang if lang is not None else self._settings.lang,
            font_dirs=self._settings.font_dirs,
            locale_dirs=self._settings.locale_dirs,
        )
        encoded = request.encoded()
        return self._settings.log.timed(
            "generate",
            lambda: outcome.document(
                self._engine.render(encoded), step=Step.GENERATE, client=self, origin=origin
            ),
            **fields,
        )

    def _signed(self, artifact: DocumentArtifact, provider: Any) -> Result[DocumentArtifact]:
        """The signed document inherits the origin of what it signed.

        Appending a revision does not launder where the document came from.
        """
        passphrase = provider.passphrase
        if isinstance(passphrase, str):
            passphrase = passphrase.encode("utf-8")

        try:
            snapshot = self._engine.sign(
                pdf=artifact.bytes,
                key=provider.key,
                certificate=provider.certificate,
                passphrase=passphrase,
            )
        except MaterialUnreadableError as error:
            return Result.from_failure(Failure(step=Step.SIGN, kind=error.kind, message=str(error)))

        return outcome.document(snapshot, step=Step.SIGN, client=self, origin=artifact.origin)

    def _template_root(self) -> TemplateRoot:
        root = self.template_root
        if root is not None:
            return root

        raise UsageError(
            "no template root: pass shojiku.Client(templates=…), set it with "
            "shojiku.configure, or set SHOJIKU_TEMPLATE_ROOT (which `env=False` "
            "disables). Sources you already hold go to `generate_source`."
        )

    @staticmethod
    def _anchor_material(paths: str | list[str] | None, pem: bytes | None) -> bytes:
        if paths is not None and pem is not None:
            raise UsageError(f"verify takes either {ANCHOR_FORMS}, not both")
        if pem is not None:
            return pem
        if paths is None:
            raise UsageError(f"verify needs {ANCHOR_FORMS}")

        listed = [paths] if isinstance(paths, str) else paths
        return b"\n".join(read_material(path, "anchor_unreadable") for path in listed)

    @staticmethod
    def _rejection(error: RejectedError, step: Step) -> Failure:
        cause = (
            Failure(step=step, kind="io", message=error.cause_message)
            if error.cause_message
            else None
        )
        return Failure(step=step, kind=error.kind, message=str(error), cause=cause)
