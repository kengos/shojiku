"""Process-wide configuration, and the entry points that reach it.

The ecosystem idiom (a ``configure`` call in application start-up) OVER the
constructor, never a third precedence layer: what ``configure`` sets stands
exactly where an explicit constructor argument stands against the environment.
So the order is

    explicit argument > ``shojiku.configure`` > ``SHOJIKU_*``

for the template root and the pack directories, and the deliberate reverse for
the engine library — ``SHOJIKU_LIBRARY`` still wins over both, because where the
engine lives is a deployment decision.

**``strict`` is the one exception, and it is the only place ``configure`` beats
a call site.** Strictness is a restriction rather than a default: an operator who
declared a lockdown must not have it lifted by application code passing
``strict=False``. Every SDK mirrors that asymmetry.

The rule the other six mirror: an ecosystem-standard configuration idiom feeds
the same constructor and never adds a precedence level of its own.
"""

from __future__ import annotations

import copy
from typing import Any

from shojiku.errors import UsageError, bounded

# Every setting a client can take, which is also what `merge` accepts — so a
# misspelled key is a named error rather than a silently ignored one.
ATTRIBUTES = (
    "templates",
    "font_dirs",
    "locale_dirs",
    "lang",
    "library",
    "logger",
    "strict",
    "providers",
    "env",
)


class Config:
    """Process-wide defaults for every client built after it is set."""

    def __init__(self) -> None:
        self.templates: str | None = None
        self.font_dirs: list[str] | None = None
        self.locale_dirs: list[str] | None = None
        self.lang: str | None = None
        self.library: str | None = None
        self.logger: Any = None
        self.strict: bool = False
        self.providers: dict[str, Any] = {}
        self.env: bool = True

    def merge(self, overrides: dict[str, Any]) -> Config:
        """A copy with ``overrides`` applied — one client's resolution step.

        A None override means "not given", so an explicit constructor argument
        beats a configured default and an absent one inherits it. ``strict`` is
        the exception documented above: it is OR-ed rather than overridden.

        ``providers`` replaces rather than merges. A client that declares its own
        registry is stating the whole set it may sign with, and quietly adding
        globally-registered keys to that set would defeat the point.
        """
        merged = copy.copy(self)
        for key, value in overrides.items():
            if key not in ATTRIBUTES:
                raise UsageError(f"unknown client setting `{bounded(key)}`")
            if value is not None:
                setattr(merged, key, value)

        merged.strict = self.strict or merged.strict
        return merged


_config = Config()


def config() -> Config:
    """The process-wide defaults, read by every client at construction."""
    return _config


def configure(**settings: Any) -> Config:
    """Set process-wide defaults.

    ```python
    shojiku.configure(templates="app/templates", lang="ja-JP")
    ```
    """
    for key, value in settings.items():
        if key not in ATTRIBUTES:
            raise UsageError(f"unknown client setting `{bounded(key)}`")
        setattr(_config, key, value)
    return _config


def reset_configuration() -> None:
    """Drop every configured default.

    Public because a global that cannot be reset makes every test suite invent
    its own teardown — and get it wrong in a randomly-ordered run. Applications
    call it at most once, if at all.
    """
    global _config  # noqa: PLW0603 — the one process-wide slot this module owns
    _config = Config()
