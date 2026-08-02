"""Process-wide configuration: it feeds the constructor, it never outranks it.

The one exception is `strict`, which is a restriction rather than a default —
see the lockdown tests for the clause that proves it.
"""

from __future__ import annotations

from typing import Any

import pytest

import shojiku
from conftest import FIXTURE_TEMPLATES
from shojiku.config import Config


class TestPrecedence:
    def test_feeds_the_constructor_so_a_configured_root_needs_no_argument(
        self, engine_library: str, font_dirs: list[str], locale_dirs: list[str]
    ) -> None:
        shojiku.configure(templates=FIXTURE_TEMPLATES)
        client = shojiku.Client(
            font_dirs=font_dirs, locale_dirs=locale_dirs, library=engine_library, env=False
        )

        assert client.template_root is not None
        assert client.template_root.path == FIXTURE_TEMPLATES

    def test_loses_to_an_explicit_constructor_argument(self, make_client: Any) -> None:
        shojiku.configure(templates="/configured/templates")

        assert make_client(templates="/explicit/templates").template_root.path == (
            "/explicit/templates"
        )

    def test_beats_the_environment_for_the_template_root(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", "/from/env")
        shojiku.configure(templates="/configured/templates")

        client = shojiku.Client(library=engine_library, env=True)

        assert client.template_root is not None
        assert client.template_root.path == "/configured/templates"

    def test_still_loses_to_shojiku_library_for_the_engine_library(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The deliberate asymmetry: WHERE THE ENGINE LIVES is an operator's
        # decision, so the environment wins over application code.
        monkeypatch.setenv("SHOJIKU_LIBRARY", engine_library)
        shojiku.configure(library="/nonexistent/libshojiku_capi.so")

        assert shojiku.Client(env=True) is not None

    def test_leaves_env_false_in_charge_of_the_environment(
        self, engine_library: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", "/from/env")
        shojiku.configure(env=False, library=engine_library)

        assert shojiku.Client().template_root is None


class TestTheSettingsThemselves:
    def test_reports_a_misspelled_setting_instead_of_ignoring_it(self) -> None:
        with pytest.raises(shojiku.UsageError, match="unknown client setting `templatez`"):
            shojiku.configure(templatez="/oops")

    def test_reports_a_misspelled_setting_on_the_constructor_too(self) -> None:
        with pytest.raises(shojiku.UsageError, match="unknown client setting `nonsense`"):
            Config().merge({"nonsense": 1})

    def test_treats_an_absent_argument_as_unset_rather_than_as_none(self) -> None:
        shojiku.configure(templates="/configured")

        assert shojiku.config().merge({"templates": None}).templates == "/configured"

    def test_starts_with_nothing_configured(self) -> None:
        fresh = Config()

        assert fresh.templates is None
        assert fresh.strict is False
        assert fresh.providers == {}
        assert fresh.env is True

    def test_replaces_the_provider_registry_rather_than_merging_it(
        self, signer: shojiku.LocalPem
    ) -> None:
        # A client declaring its own registry is stating the whole set it may
        # sign with; quietly adding globally-registered keys would defeat that.
        shojiku.configure(providers={"global": signer})

        merged = shojiku.config().merge({"providers": {"local": signer}})

        assert list(merged.providers) == ["local"]


class TestResetConfiguration:
    def test_drops_every_configured_default(self) -> None:
        shojiku.configure(templates="/configured", strict=True)

        shojiku.reset_configuration()

        assert shojiku.config().templates is None
        assert shojiku.config().strict is False
