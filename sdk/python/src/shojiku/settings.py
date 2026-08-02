"""One client's resolved configuration, plus the collaborators built from it.

:mod:`shojiku.config` answers "what was configured"; this answers "what does
THIS client use", which is the merge of the process-wide defaults with the
arguments the client was constructed with. Keeping it out of the client keeps
the precedence rules in one readable place instead of spread across a
constructor.

Everything is built lazily and memoized: a bytes-first application never
configures a template root, and demanding one at construction would refuse a
legitimate client.
"""

from __future__ import annotations

from functools import cached_property
from typing import Any

from shojiku import config as config_module
from shojiku.env import Env
from shojiku.library import Library
from shojiku.lockdown import Lockdown
from shojiku.log import Log
from shojiku.template_root import TemplateRoot


class Settings:
    """The resolved settings of one client, and what they build."""

    def __init__(self, **overrides: Any) -> None:
        self._config = config_module.config().merge(overrides)
        self.lang: str | None = self._config.lang

    @cached_property
    def env(self) -> Env:
        return Env(enabled=self._config.env)

    @cached_property
    def log(self) -> Log:
        return Log(self._config.logger)

    @cached_property
    def lockdown(self) -> Lockdown:
        return Lockdown(strict=self._config.strict, providers=self._config.providers)

    @cached_property
    def library(self) -> Library:
        return Library(path=self._config.library, env=self.env, log=self.log)

    @cached_property
    def font_dirs(self) -> list[str]:
        configured = self._config.font_dirs
        return configured if configured is not None else self.env.paths("SHOJIKU_FONT_DIR")

    @cached_property
    def locale_dirs(self) -> list[str]:
        configured = self._config.locale_dirs
        return configured if configured is not None else self.env.paths("SHOJIKU_LOCALE_DIR")

    @cached_property
    def template_root(self) -> TemplateRoot | None:
        """The template root, or None when nothing configured one."""
        root = self._config.templates or self.env.get("SHOJIKU_TEMPLATE_ROOT")
        return TemplateRoot(root) if root else None
