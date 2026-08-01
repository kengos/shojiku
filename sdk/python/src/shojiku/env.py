"""The one place this package reads the environment.

A client is constructed with ``env=True`` (the default) or ``env=False``, and
that single flag governs EVERY ``SHOJIKU_*`` lookup — the template root, the
font and locale directories, and the library path. One flag rather than one per
variable is the reference decision the other six SDKs mirror: an application
that wants a hermetic configuration wants all of it off, and a per-variable set
of knobs is a shape nobody can keep consistent across seven languages.

Disabled lookups behave exactly as unset variables do, so calling code has no
second branch to get wrong.
"""

from __future__ import annotations

import os
from collections.abc import Mapping


class Env:
    """Reads ``SHOJIKU_*`` variables, or does not, per one flag."""

    def __init__(self, enabled: bool, source: Mapping[str, str] | None = None) -> None:
        self._enabled = enabled
        self._source: Mapping[str, str] = os.environ if source is None else source

    def get(self, name: str) -> str | None:
        """The variable's value, or None when unset, blank, or lookups are off."""
        if not self._enabled:
            return None

        value = self._source.get(name)
        return value if value else None

    def paths(self, name: str) -> list[str]:
        """A ``os.pathsep``-separated variable as a list of directories.

        Which is how every other tool in this family spells "several paths in
        one variable".
        """
        value = self.get(name)
        if value is None:
            return []

        return [entry for entry in value.split(os.pathsep) if entry]
