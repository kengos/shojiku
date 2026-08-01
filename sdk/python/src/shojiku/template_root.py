"""Resolving a template NAME to the sources behind it.

A name is an identifier, never a path. A bundle format will take this lookup
over later, so nothing outside this class may assume a directory is how names
resolve — callers ask for ``"receipt_ja"`` and get sources back.

**The rejection rules are the union across platforms, not the host's.** Windows
is a first-class target (it is what the .NET SDK's market runs on), so a
backslash is a separator, ``C:name`` is drive-relative, ``\\\\host\\share`` is a
UNC path and ``CON``/``NUL`` are reserved devices — every one of them refused on
EVERY platform. A template name that is valid on one machine is valid on all of
them, which is the only way the same application deploys to both.
"""

from __future__ import annotations

import re
from pathlib import Path

from shojiku.errors import UsageError, bounded
from shojiku.sources import Sources

# Reserved DOS device names. Windows resolves these no matter what directory you
# are in and no matter what extension you append.
DEVICES = frozenset(
    ["CON", "PRN", "AUX", "NUL"]
    + [f"COM{n}" for n in range(1, 10)]
    + [f"LPT{n}" for n in range(1, 10)]
)

# A name is ONE segment. Refusing both separators outright subsumes traversal,
# absolute paths and nested lookups in a single rule — the simplest thing six
# other SDKs can mirror without drifting.
SEPARATORS = re.compile(r"[/\\]")
DRIVE_RELATIVE = re.compile(r"\A[A-Za-z]:")
CONTROL = re.compile(r"[\x00-\x1f\x7f]")
TRAILING_DOTS_AND_SPACES = re.compile(r"[.\s]+\Z")

TEMPLATE_FILE = "templates.yml"
DEFINITIONS_FILE = "definitions.yml"


class RejectedError(Exception):
    """A refused name or an unreadable template.

    Rejection is an exception INSIDE this class and a failed result outside it —
    a hostile template name is a fact about the request, not a bug in the
    calling program.
    """

    def __init__(self, kind: str, message: str, cause_message: str | None = None) -> None:
        self.kind = kind
        self.cause_message = cause_message
        super().__init__(message)


def _is_separator(name: str) -> bool:
    return SEPARATORS.search(name) is not None


def _is_control(name: str) -> bool:
    return CONTROL.search(name) is not None


def _is_drive_relative(name: str) -> bool:
    return DRIVE_RELATIVE.match(name) is not None


def _is_device(name: str) -> bool:
    """Trailing dots and spaces are STRIPPED by Windows before it resolves a name.

    So ``CON.`` and ``"CON "`` are the CON device just as ``CON`` is. Without
    that strip they slip past this rule and are refused later, by containment —
    still refused, but with a message about a missing template rather than about
    a reserved name.
    """
    stem = TRAILING_DOTS_AND_SPACES.sub("", name.split(".")[0])
    return stem.upper() in DEVICES


# Each rule, and what a caller is told when it fires.
RULES: tuple[tuple[str, str], ...] = (
    (
        "separator",
        "a name is one segment, so `/` and `\\` are never part of it "
        "(which is also what makes `..` traversal impossible)",
    ),
    ("control", "it contains a control character"),
    (
        "drive_relative",
        "it is drive-relative, which Windows resolves against that drive's current directory",
    ),
    ("device", "it is a reserved device name on Windows"),
)

_PREDICATES = {
    "separator": _is_separator,
    "control": _is_control,
    "drive_relative": _is_drive_relative,
    "device": _is_device,
}


class TemplateRoot:
    """One configured root, and the only thing that turns names into sources."""

    def __init__(self, path: str) -> None:
        self.path = path

    def resolve(self, name: str) -> Sources:
        """Resolve ``name``, or raise :class:`RejectedError` naming why it will not."""
        self._identifier(name)
        self._reject(name)
        real = self._contained(Path(self.path) / name)
        return Sources(
            template=self._read(real / TEMPLATE_FILE),
            definitions=self._optional(real / DEFINITIONS_FILE),
            assets_dir=str(real),
        )

    @staticmethod
    def _identifier(name: object) -> None:
        """A name is an IDENTIFIER, so anything that is not a string is a bug.

        A bug in the calling program rather than a hostile request — and it has
        to be caught here, because a non-string otherwise dies deep inside
        ``pathlib`` with a ``TypeError`` from a method the caller never called.

        A BLANK string is the other case and stays a refused request: it can
        arrive straight from a form field.
        """
        if isinstance(name, str):
            return

        raise UsageError(
            f"a template name must be a str; got {type(name).__name__}. "
            "Sources you already hold go to `generate_source`."
        )

    @staticmethod
    def _reject(name: str) -> None:
        if not name.strip():
            raise RejectedError("template_name", "a template name must not be empty")

        for rule, explanation in RULES:
            if _PREDICATES[rule](name):
                raise RejectedError(
                    "template_name", f"`{bounded(name)}` is not a template name: {explanation}"
                )

    def _contained(self, directory: Path) -> Path:
        """The check a name-shape rule cannot make.

        After following whatever the filesystem has there, is the answer still
        inside the root? A symlink is what this exists for — it passes every rule
        above and still points out.

        ``strict=True`` matters: unlike ruby's ``File.realpath``, a plain
        ``resolve()`` in Python does NOT raise for a path that is not there, so a
        missing template would canonicalize happily and fall through to a
        confusing read error.
        """
        try:
            root = Path(self.path).resolve(strict=True)
            real = directory.resolve(strict=True)
        except OSError as error:
            raise RejectedError(
                "template_not_found", "no template by that name", cause_message=str(error)
            ) from error

        if real == root or root in real.parents:
            return real

        raise RejectedError(
            "template_escapes_root", "the template resolves outside the template root"
        )

    @staticmethod
    def _read(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8")
        except OSError as error:
            raise RejectedError(
                "template_unreadable", "the template could not be read", cause_message=str(error)
            ) from error

    @staticmethod
    def _optional(path: Path) -> str | None:
        return TemplateRoot._read(path) if path.is_file() else None
