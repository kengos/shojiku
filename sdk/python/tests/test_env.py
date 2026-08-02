"""The one place the environment is read, and the one flag that governs it."""

from __future__ import annotations

import os

from shojiku.env import Env

SOURCE = {
    "SHOJIKU_TEMPLATE_ROOT": "/srv/templates",
    "SHOJIKU_BLANK": "",
    "SHOJIKU_FONT_DIR": os.pathsep.join(["/a", "/b"]),
    "SHOJIKU_GAPPY": os.pathsep.join(["/a", "", "/b"]),
}


class TestWhenLookupsAreEnabled:
    def test_reads_a_variable(self) -> None:
        assert Env(enabled=True, source=SOURCE).get("SHOJIKU_TEMPLATE_ROOT") == "/srv/templates"

    def test_treats_a_blank_variable_as_unset(self) -> None:
        # An empty deploy value is not a template root.
        assert Env(enabled=True, source=SOURCE).get("SHOJIKU_BLANK") is None

    def test_reports_an_unset_variable_as_none(self) -> None:
        assert Env(enabled=True, source=SOURCE).get("SHOJIKU_NOT_SET") is None

    def test_splits_a_path_list_on_the_platform_separator(self) -> None:
        assert Env(enabled=True, source=SOURCE).paths("SHOJIKU_FONT_DIR") == ["/a", "/b"]

    def test_yields_no_paths_for_an_unset_list(self) -> None:
        assert Env(enabled=True, source=SOURCE).paths("SHOJIKU_NOT_SET") == []

    def test_drops_empty_entries_rather_than_passing_an_empty_directory_on(self) -> None:
        assert Env(enabled=True, source=SOURCE).paths("SHOJIKU_GAPPY") == ["/a", "/b"]

    def test_reads_the_real_process_environment_by_default(self, monkeypatch) -> None:
        monkeypatch.setenv("SHOJIKU_TEMPLATE_ROOT", "/from/process")

        assert Env(enabled=True).get("SHOJIKU_TEMPLATE_ROOT") == "/from/process"


class TestWhenLookupsAreDisabled:
    def test_reads_no_variable_however_it_is_set(self) -> None:
        assert Env(enabled=False, source=SOURCE).get("SHOJIKU_TEMPLATE_ROOT") is None

    def test_reads_no_path_list_either(self) -> None:
        assert Env(enabled=False, source=SOURCE).paths("SHOJIKU_FONT_DIR") == []
