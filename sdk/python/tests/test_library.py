"""Finding, opening and vetting the engine library."""

from __future__ import annotations

import ctypes
import shutil
from pathlib import Path

import pytest

import shojiku
from shojiku import library as library_module
from shojiku.env import Env
from shojiku.library import ABI_VERSION, NAMES, Library

DISABLED = Env(enabled=False)


def test_opens_the_engine_library_and_agrees_with_it_about_the_abi_revision(
    engine_library: str,
) -> None:
    library = Library(path=engine_library, env=DISABLED)

    assert library.path == engine_library
    assert library.source == "configuration"


def test_lets_shojiku_library_beat_an_explicit_path(engine_library: str) -> None:
    # The asymmetry with the template root, tested rather than only documented:
    # WHERE THE ENGINE LIVES is an operator's decision, so the environment wins
    # over application code — the same order `SHOJIKU_BIN` has for the
    # subprocess SDKs.
    env = Env(enabled=True, source={"SHOJIKU_LIBRARY": engine_library})

    library = Library(path="/nonexistent/libshojiku_capi.so", env=env)

    assert library.path == engine_library
    assert library.source == "environment"


def test_obeys_env_false_even_when_shojiku_library_is_set(engine_library: str) -> None:
    env = Env(enabled=False, source={"SHOJIKU_LIBRARY": "/nope.so"})

    assert Library(path=engine_library, env=env).path == engine_library


class TestWhenThereIsNoLibraryToLoad:
    def test_names_the_install_channels_rather_than_leaking_a_loader_error(self) -> None:
        # The whole point of the named error: the fix is always an installation
        # step, and a bare OSError from the loader names none of them.
        with pytest.raises(shojiku.LibraryNotFoundError) as caught:
            Library(path="/nonexistent/libshojiku_capi.so", env=DISABLED)

        message = str(caught.value)
        assert "SHOJIKU_LIBRARY" in message
        assert "wheel for your platform" in message

    def test_says_so_when_no_path_was_given_and_the_wheel_carries_no_binary(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(library_module, "packaged_dir", lambda: None)

        with pytest.raises(shojiku.LibraryNotFoundError, match="no engine library was found"):
            Library(env=DISABLED)

    def test_says_so_when_the_packaged_directory_holds_none_of_the_names(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        (tmp_path / "unrelated.txt").write_text("", encoding="utf-8")
        monkeypatch.setattr(library_module, "packaged_dir", lambda: str(tmp_path))

        with pytest.raises(shojiku.LibraryNotFoundError, match="no engine library was found"):
            Library(env=DISABLED)


# One case per NAME, because Windows is the trap: cargo emits
# `shojiku_capi.dll` with NO `lib` prefix while the Unix targets get one, so a
# lookup for only the prefixed form would make the package unloadable on the
# platform the .NET market runs on. The real library is copied to each name and
# actually opened — `dlopen` does not care what the file is called.
@pytest.mark.parametrize("name", NAMES)
def test_finds_the_packaged_binary_under_each_name_a_platform_wheel_may_use(
    name: str, engine_library: str, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    packaged = tmp_path / name
    shutil.copy(engine_library, packaged)
    monkeypatch.setattr(library_module, "packaged_dir", lambda: str(tmp_path))

    library = Library(env=DISABLED)

    assert library.path == str(packaged)
    assert library.source == "packaged"


def test_looks_for_six_names_covering_both_stems_and_all_three_suffixes() -> None:
    assert len(NAMES) == 6
    assert set(NAMES) == {
        f"{stem}shojiku_capi{suffix}"
        for suffix in (".so", ".dylib", ".dll")
        for stem in ("lib", "")
    }


def test_reports_no_packaged_directory_when_the_package_ships_no_native_folder() -> None:
    # The ordinary installed-from-source case: `importlib.resources` resolves,
    # the `native` directory simply is not there.
    assert library_module.packaged_dir() is None


def test_reports_no_packaged_directory_when_the_resource_lookup_itself_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A package loaded from somewhere `importlib.resources` cannot turn into a
    # directory — a zipimport, a namespace package. That is "no packaged
    # binary", not a crash on the way to the other lookup positions.
    def exploding_files(_name: str) -> object:
        raise NotADirectoryError("not a real directory")

    monkeypatch.setattr(library_module.resources, "files", exploding_files)

    assert library_module.packaged_dir() is None


def test_refuses_a_symbol_the_library_does_not_export(engine_library: str) -> None:
    library = Library(path=engine_library, env=DISABLED)

    with pytest.raises(shojiku.LibraryNotFoundError, match="exports no `shojiku_not_a_symbol`"):
        library.function("shojiku_not_a_symbol", [], ctypes.c_int32)


def test_refuses_a_library_whose_abi_revision_it_does_not_speak(
    engine_library: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Asked before anything else is called. It is the only way a binding learns
    # that a symbol it is about to call means something different now.
    monkeypatch.setattr(library_module, "abi_version", lambda _library: 99)

    with pytest.raises(shojiku.AbiMismatchError) as caught:
        Library(path=engine_library, env=DISABLED)

    assert "revision 99" in str(caught.value)
    assert f"speaks {ABI_VERSION}" in str(caught.value)
