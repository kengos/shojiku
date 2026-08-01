//! Turning the caller's raw pointers into Rust slices.
//!
//! This is the ONE module that dereferences anything the caller handed over,
//! which is why the caps live here too: an argument is measured before its
//! bytes are ever looked at, so a hostile length cannot drive an allocation
//! ahead of the check.
//!
//! What this module cannot check is the caller lying about a length — no FFI
//! can. `include/shojiku.h` states that contract; everything short of it is
//! checked here.

use crate::status::Failure;

/// Longest accepted request envelope. The sources travel inside it, so this
/// is the real bound on a template plus its params.
pub(crate) const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
/// Longest accepted PDF to sign. Comfortably past anything this engine
/// renders, and still a bound.
pub(crate) const MAX_PDF_BYTES: usize = 64 * 1024 * 1024;
/// Longest accepted PEM key or certificate. A PEM key is a few kilobytes.
pub(crate) const MAX_KEY_BYTES: usize = 64 * 1024;
/// Longest accepted trust-anchor bundle. The same order of magnitude as a
/// certificate, with room for a chain of them; named for its own argument so
/// a refusal says which one was too big.
pub(crate) const MAX_ANCHOR_BYTES: usize = 64 * 1024;
/// Longest accepted passphrase.
pub(crate) const MAX_PASSPHRASE_BYTES: usize = 1024;

/// Borrows a required `(pointer, length)` argument as bytes.
///
/// Null is rejected whatever the length says: an argument the surface calls
/// required is never satisfied by a null pointer, and `(NULL, 0)` meaning
/// "empty" would be a second way to say something the caller can already say
/// with a valid pointer. A zero length then never touches the pointer at all,
/// because `slice::from_raw_parts` demands a dereferenceable pointer even for
/// an empty slice.
///
/// The cap is checked before the bytes are looked at, so a hostile length
/// cannot drive work ahead of its own rejection.
///
/// # Safety
///
/// When `len` is non-zero, `ptr` must point at `len` initialised bytes that
/// stay valid and unwritten for the duration of the call.
pub(crate) unsafe fn bytes<'a>(
    ptr: *const u8,
    len: usize,
    max: usize,
    what: &'static str,
) -> Result<&'a [u8], Failure> {
    if ptr.is_null() {
        return Err(Failure::NullArg(what));
    }
    if len > max {
        return Err(Failure::TooLarge { what, len, max });
    }
    if len == 0 {
        return Ok(&[]);
    }
    // SAFETY: `ptr` is non-null and `len` is non-zero (both checked just
    // above); the caller's contract, restated in the header, covers validity
    // and immutability of that range for this call.
    Ok(unsafe { std::slice::from_raw_parts(ptr, len) })
}

/// Borrows an OPTIONAL `(pointer, length)` argument: a null pointer means the
/// argument was not supplied, which is different from an empty one.
///
/// # Safety
///
/// As [`bytes`].
pub(crate) unsafe fn opt_bytes<'a>(
    ptr: *const u8,
    len: usize,
    max: usize,
    what: &'static str,
) -> Result<Option<&'a [u8]>, Failure> {
    if ptr.is_null() {
        return Ok(None);
    }
    // SAFETY: the caller's contract, as in `bytes`.
    unsafe { bytes(ptr, len, max, what) }.map(Some)
}

/// Reads borrowed bytes as UTF-8.
pub(crate) fn text<'a>(bytes: &'a [u8], what: &'static str) -> Result<&'a str, Failure> {
    std::str::from_utf8(bytes).map_err(|_| Failure::InvalidUtf8(what))
}

#[cfg(test)]
mod tests;
