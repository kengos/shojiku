"""The one JSON envelope every document operation crosses with.

Both entrances build it: sources resolved from a template NAME and sources the
application handed over as BYTES produce the same request, because the C surface
has one request schema — and that schema rejects unknown keys, so a key the
engine may legitimately not receive is dropped rather than sent as null.
"""

from __future__ import annotations

import json
from typing import Any

from shojiku.errors import UsageError
from shojiku.sources import Sources


class Request:
    """One render's envelope, ready for the C surface."""

    def __init__(
        self,
        sources: Sources,
        params: Any,
        lang: str | None = None,
        font_dirs: list[str] | None = None,
        locale_dirs: list[str] | None = None,
    ) -> None:
        self._sources = sources
        self._params = params
        self._lang = lang
        self._font_dirs = font_dirs or []
        self._locale_dirs = locale_dirs or []

    def encoded(self) -> bytes:
        """The serialized envelope as UTF-8 bytes.

        Params that are not serializable as UTF-8 JSON are programmer misuse —
        the engine's surface is UTF-8 by contract, so there is nothing to render
        — but a bare ``TypeError`` or ``UnicodeEncodeError`` escaping from
        ``generate`` would make callers catch a foreign class they never invited
        into their code.
        """
        try:
            return json.dumps(self._envelope(), ensure_ascii=False).encode("utf-8")
        except (TypeError, ValueError, UnicodeEncodeError) as error:
            raise UsageError(f"params could not be serialized as UTF-8 JSON: {error}") from error

    def _envelope(self) -> dict[str, Any]:
        candidates = {
            "template": self._sources.template,
            "definitions": self._sources.definitions,
            "params": self._params_source(),
            "lang": self._lang,
            "fontDirs": self._font_dirs,
            "localeDirs": self._locale_dirs,
            "assetsDir": self._sources.assets_dir,
        }
        return {key: value for key, value in candidates.items() if value is not None}

    def _params_source(self) -> str:
        """A string params is the caller's own source text, passed through VERBATIM.

        The engine parses JSON or YAML (YAML is a superset), so re-encoding it
        here would only be a chance to change it. Anything else is serialized as
        JSON.

        There is deliberately no per-format method family — format dispatch is
        the engine's, and an SDK that offered ``generate_yaml`` would be claiming
        a distinction the engine does not make.
        """
        if isinstance(self._params, str):
            return self._params
        return json.dumps(self._params, ensure_ascii=False)
