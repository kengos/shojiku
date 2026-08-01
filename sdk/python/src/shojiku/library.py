"""Finding and opening the engine's shared library.

Resolution order, and the deliberate asymmetry with the template root:
``SHOJIKU_LIBRARY`` beats explicit configuration, which beats the copy shipped
inside the platform wheel. That is the reverse of how the template root
resolves, and on purpose — WHERE THE ENGINE LIVES is an operator/deployment
decision that has to be able to win over application code, exactly as
``SHOJIKU_BIN`` does for the subprocess SDKs. WHICH TEMPLATES an application
renders is the application's own decision, so there the explicit value wins.

Nothing here downloads anything. A library that is not present is a named error
listing the install channels.
"""

from __future__ import annotations

import ctypes
from importlib import resources
from pathlib import Path
from typing import TYPE_CHECKING, Any

from shojiku.engine import abi_version
from shojiku.env import Env
from shojiku.errors import AbiMismatchError, LibraryNotFoundError
from shojiku.log import Log

if TYPE_CHECKING:
    from collections.abc import Sequence

# The ABI revision this package is written against. It moves only when a
# symbol's meaning changes; new operations are appended without it, so a newer
# engine keeps working with this package.
ABI_VERSION = 1

# The names a platform wheel's binary can have, in the order they are tried.
# Windows is the reason there are six rather than three: cargo emits
# `shojiku_capi.dll` with no `lib` prefix, while the Unix targets get one.
# Looking only for the prefixed form would make the package unloadable on the
# platform the .NET market runs on.
NAMES = tuple(
    f"{stem}shojiku_capi{suffix}" for suffix in (".so", ".dylib", ".dll") for stem in ("lib", "")
)

# Where a platform wheel puts the binary it ships.
PACKAGED_DIRNAME = "native"


def packaged_dir() -> str | None:
    """The directory a platform wheel's binary lives in, if this is one.

    Located through ``importlib.resources`` rather than by path math from
    ``__file__``, which is what the packaging tooling actually guarantees.
    """
    try:
        native = resources.files("shojiku") / PACKAGED_DIRNAME
        return str(native) if native.is_dir() else None
    except (ModuleNotFoundError, FileNotFoundError, NotADirectoryError, TypeError):
        return None


class Library:
    """One opened engine library, and the ABI check that admitted it."""

    def __init__(
        self,
        path: str | None = None,
        env: Env | None = None,
        log: Log | None = None,
    ) -> None:
        self._log = log or Log()
        self.path, self.source = self._discover(path, env or Env(enabled=True))
        if self.path is None:
            raise LibraryNotFoundError(_install_hint("no engine library was found"))

        self._handle = self._open(self.path)
        self._log.event("library_loaded", path=self.path, source=self.source)
        self._check_abi()

    def function(self, name: str, argtypes: Sequence[Any], restype: Any) -> Any:
        """A declared foreign function.

        Types are always explicit: ctypes' default return type is a C ``int``
        and would truncate every pointer this surface hands back.
        """
        try:
            entry = getattr(self._handle, name)
        except AttributeError as error:
            raise LibraryNotFoundError(f"{self.path} exports no `{name}` ({error})") from error

        entry.argtypes = list(argtypes)
        entry.restype = restype
        return entry

    def _discover(self, path: str | None, env: Env) -> tuple[str | None, str]:
        """The resolution order, and which position won.

        The second half is worth reporting, because "which library did this
        process actually load, and why that one" is the question a deployment
        asks at 3am.
        """
        from_env = env.get("SHOJIKU_LIBRARY")
        if from_env:
            return from_env, "environment"
        if path:
            return path, "configuration"

        return self._packaged(), "packaged"

    @staticmethod
    def _packaged() -> str | None:
        directory = packaged_dir()
        if directory is None:
            return None

        for name in NAMES:
            candidate = Path(directory) / name
            if candidate.is_file():
                return str(candidate)
        return None

    @staticmethod
    def _open(path: str) -> ctypes.CDLL:
        """Open the library.

        ``CDLL``, never ``PyDLL``: ``CDLL`` releases the GIL around every call,
        so a long render does not block the rest of the process.
        """
        try:
            return ctypes.CDLL(path)
        except OSError as error:
            raise LibraryNotFoundError(
                _install_hint(f"{path} could not be loaded ({error})")
            ) from error

    def _check_abi(self) -> None:
        """Asked once, before anything else is called.

        The header's own advice, and the only way a binding learns that a symbol
        it is about to call means something different now.
        """
        found = abi_version(self)
        self._log.event("abi_checked", found=found, expected=ABI_VERSION)
        if found == ABI_VERSION:
            return

        raise AbiMismatchError(
            f"{self.path} implements ABI revision {found}; this package speaks {ABI_VERSION}"
        )


def _install_hint(reason: str) -> str:
    return (
        f"{reason}.\n\n"
        "This package never downloads the engine. Install it one of these ways:\n"
        "  * install the wheel for your platform, which ships the binary\n"
        "  * point SHOJIKU_LIBRARY at a libshojiku_capi library you built\n"
        '  * pass shojiku.Client(library="/path/to/libshojiku_capi.so")'
    )
