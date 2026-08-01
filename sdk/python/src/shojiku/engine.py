"""The declared C surface, and the one place a call crosses into it.

Every function is declared with explicit argument and return types. ctypes'
default return type is a C ``int``, which truncates every pointer this library
hands back — a segfault that looks like a memory bug and is really a missing
declaration.
"""

from __future__ import annotations

import ctypes
from ctypes import POINTER, byref, c_char_p, c_int32, c_size_t, c_uint32, c_void_p
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

    from shojiku.library import Library


@dataclass(frozen=True)
class Snapshot:
    """Everything copied out of one result handle, before that handle is freed.

    A snapshot rather than a wrapper, and that is the ownership rule of this
    binding in one word: no Python object ever holds a pointer into engine
    memory. The accessors LEND — their pointers die with the handle — so the
    bytes are copied while the handle is alive and the handle is freed on the
    way out, on every path.
    """

    status: int
    success: bool
    pdf: bytes
    json: str
    diagnostics: str
    error: str


class ShojikuResult(ctypes.Structure):
    """The opaque result handle. Never dereferenced on this side."""


ResultPtr = POINTER(ShojikuResult)

# The four buffer accessors, which all share one signature.
_BUFFERS = (
    "shojiku_result_pdf",
    "shojiku_result_json",
    "shojiku_result_diagnostics_json",
    "shojiku_result_error_json",
)


class Engine:
    """The bound lifecycle, and the copy-then-free discipline around it.

    Only the lifecycle the SDK contract defines is bound: engine info, render,
    sign, verify. ``validate`` and ``preview`` are the authoring surface's, not
    an artifact lifecycle's — the Designer reaches them through the WASM
    bindings, and binding them here would be surface with no contract behind it.
    """

    def __init__(self, library: Library) -> None:
        # Held for its LIFETIME, not for its behaviour: the bound function
        # objects below borrow from this library's open handle, so letting it
        # be collected would leave them pointing into an unloaded object.
        self._library = library
        self._info = library.function("shojiku_engine_info", [POINTER(ResultPtr)], c_int32)
        self._render = library.function(
            "shojiku_render", [c_char_p, c_size_t, POINTER(ResultPtr)], c_int32
        )
        self._sign = library.function(
            "shojiku_sign",
            [
                c_char_p,
                c_size_t,
                c_char_p,
                c_size_t,
                c_char_p,
                c_size_t,
                c_char_p,
                c_size_t,
                POINTER(ResultPtr),
            ],
            c_int32,
        )
        self._verify = library.function(
            "shojiku_verify", [c_char_p, c_size_t, c_char_p, c_size_t, POINTER(ResultPtr)], c_int32
        )
        self._accessors = {
            name: library.function(name, [ResultPtr, POINTER(c_void_p), POINTER(c_size_t)], c_int32)
            for name in _BUFFERS
        }
        self._success = library.function(
            "shojiku_result_success", [ResultPtr, POINTER(c_int32)], c_int32
        )
        self._free = library.function("shojiku_result_free", [ResultPtr], None)

    def engine_info(self) -> Snapshot:
        return self._invoke(lambda out: self._info(out))

    def render(self, request: bytes) -> Snapshot:
        return self._invoke(lambda out: self._render(request, len(request), out))

    def sign(
        self, pdf: bytes, key: bytes, certificate: bytes, passphrase: bytes | None = None
    ) -> Snapshot:
        return self._invoke(
            lambda out: self._sign(
                pdf,
                len(pdf),
                key,
                len(key),
                certificate,
                len(certificate),
                passphrase,
                len(passphrase) if passphrase else 0,
                out,
            )
        )

    def verify(self, pdf: bytes, anchors: bytes) -> Snapshot:
        return self._invoke(lambda out: self._verify(pdf, len(pdf), anchors, len(anchors), out))

    def _invoke(self, call: Callable[[Any], int]) -> Snapshot:
        """Run one operation and copy its result out.

        The ``finally`` is the ownership contract: exactly one handle crosses
        and exactly one free pairs with it, whatever happens in between. The
        header blanks the out slot before any work starts, so freeing it
        unconditionally is well defined.
        """
        out = ResultPtr()
        status = call(byref(out))
        try:
            return self._snapshot(status, out)
        finally:
            self._free(out)

    def _snapshot(self, status: int, handle: Any) -> Snapshot:
        return Snapshot(
            status=status,
            success=self._succeeded(handle),
            pdf=self._buffer(handle, "shojiku_result_pdf"),
            json=self._text(handle, "shojiku_result_json"),
            diagnostics=self._text(handle, "shojiku_result_diagnostics_json"),
            error=self._text(handle, "shojiku_result_error_json"),
        )

    def _succeeded(self, handle: Any) -> bool:
        slot = c_int32()
        self._success(handle, byref(slot))
        return slot.value == 1

    def _buffer(self, handle: Any, name: str) -> bytes:
        """Copy what an accessor lent.

        ``string_at`` copies, which is the whole point: the pointer it copies
        from stops being valid the moment the handle is freed, a few lines later.
        The length is read FIRST, so an empty buffer never dereferences the
        pointer beside it.
        """
        pointer = c_void_p()
        length = c_size_t()
        self._accessors[name](handle, byref(pointer), byref(length))
        if length.value == 0:
            return b""
        return ctypes.string_at(pointer, length.value)

    def _text(self, handle: Any, name: str) -> str:
        """The same, for a buffer the surface guarantees is UTF-8.

        Decoded explicitly rather than by whatever the platform would pick:
        Windows is a first-class target here and its default differs.
        """
        return self._buffer(handle, name).decode("utf-8")


def abi_version(library: Library) -> int:
    """Ask the library which revision it implements, before anything else runs."""
    return int(library.function("shojiku_abi_version", [], c_uint32)())
