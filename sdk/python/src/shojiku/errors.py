"""The base of everything this package raises, plus the two shared helpers.

Raising is deliberately rare here. A template that will not render, a key
that will not sign, a signature that does not verify are OUTCOMES — they come
back as :class:`~shojiku.result.Result` objects you query, never as exceptions
you catch. What is left for exceptions is what every Python library reserves
them for: programmer misuse, and an environment that cannot host the engine at
all.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from shojiku.failure import Failure


class Error(Exception):
    """The base of every exception this package raises."""


class UsageError(Error):
    """The caller passed something this API cannot accept.

    A template name that is not a string, both forms of the same material at
    once, an argument past a hard cap the C library documents, or an entrance
    this client's lockdown disables. Programmer misuse, so it raises.

    A BLANK template name is deliberately not in that list: an empty string can
    arrive straight from a form field, so it comes back as a refused request
    like every other bad name.
    """


class UnwrapError(Error):
    """Unwrapping a result that failed.

    :meth:`~shojiku.result.Result.unwrap` is the opt-in bridge to
    exception-style control flow. Calling it on a failed result is programmer
    misuse — the ruling is explicit and frozen for every Shojiku SDK, because
    an accessor that raises is the one place this API could drift back into
    exceptions by accident. The failure travels on the exception, so nothing is
    lost by taking the short road.
    """

    def __init__(self, failure: Failure) -> None:
        self.failure = failure
        super().__init__(str(failure))


class LibraryNotFoundError(Error):
    """The engine library could not be found or loaded.

    The message names the install channels, because the fix is always an
    installation step and a bare loader error names none of them. Nothing here
    downloads the library: an SDK that fetches an executable is a supply-chain
    surface this product does not take on.
    """


class AbiMismatchError(Error):
    """The library implements a different ABI revision than this package.

    Loading anyway would mean calling symbols whose meaning has changed.
    """


class MaterialUnreadableError(Error):
    """Key, certificate or trust-anchor bytes that could not be read.

    Raised internally and caught by the client, which turns it into a failed
    result: an unreadable key is an outcome of the operation, not a bug in the
    calling program. It carries the machine-readable ``kind`` the failure trace
    reports.
    """

    def __init__(self, kind: str, message: str) -> None:
        self.kind = kind
        super().__init__(message)


# Control characters, mapped to nothing. Built once: `str.translate` takes a
# table keyed by ordinal, and deleting is spelled as mapping to None.
_CONTROL_CHARACTERS: dict[int, None] = dict.fromkeys([*range(0x00, 0x20), 0x7F])

# How much caller-supplied text may reach a message or a log line.
ECHO_LIMIT = 80


def bounded(text: object) -> str:
    """Echo caller-supplied text back, stripped and capped.

    Template names and provider names reach exception reporters and log files,
    so they are stripped of control characters and bounded before they are
    quoted — the same discipline the engine applies to the values it echoes.
    One place for it, because every path that echoes owes the same thing.
    """
    return str(text).translate(_CONTROL_CHARACTERS)[:ECHO_LIMIT]


def read_material(path: str, kind: str) -> bytes:
    """Read the byte inputs signing and verification take.

    One place, because both paths owe the same thing: binary mode (PEM is
    bytes, and a transcode would corrupt a DER-bearing file), and an unreadable
    file surfacing as :class:`MaterialUnreadableError` rather than as a raw ``OSError``
    nobody upstream is catching.
    """
    try:
        return Path(path).read_bytes()
    except OSError as error:
        raise MaterialUnreadableError(kind, str(error)) from error
