//! The ONE place this crate crosses into the C ABI host.
//!
//! Everything above it is safe Rust over owned values, and everything below
//! it is `shojiku-capi`'s own contract. The rules that contract states, and
//! that this module keeps:
//!
//! * one handle per call, freed on every path — here that is a single
//!   [`read`] that consumes the handle and frees it before returning;
//! * accessors LEND, so every buffer is copied out before the free;
//! * nothing is NUL-terminated — buffers cross as (pointer, length), because
//!   PDF bytes contain NUL.
//!
//! The request envelope crosses as bytes without being looked at. This host
//! has no schema of its own: the envelope is `shojiku-capi`'s, and appending
//! a key there needs no change here.

use crate::outcome::Outcome;
use shojiku_capi::{
    shojiku_abi_version, shojiku_engine_info, shojiku_render, shojiku_result_diagnostics_json,
    shojiku_result_error_json, shojiku_result_free, shojiku_result_json, shojiku_result_pdf,
    shojiku_result_success, shojiku_sign, shojiku_verify, ShojikuResult,
};

/// A buffer accessor's shape, shared by the four this host reads.
type Reader = unsafe extern "C" fn(*const ShojikuResult, *mut *const u8, *mut usize) -> i32;

/// The ABI revision the linked library implements.
///
/// The npm package checks it at load, exactly as the four cdylib SDKs do —
/// this host is statically linked, so the answer cannot drift between the
/// addon and the engine inside it, and the check stays as the proof of that
/// rather than as a guess.
#[must_use]
pub fn abi_version() -> u32 {
    shojiku_abi_version()
}

/// This build's engine info: version, capability keys, builtin locales.
#[must_use]
pub fn engine_info() -> Outcome {
    let mut handle = std::ptr::null_mut();
    // SAFETY: `handle` is one writable slot, which is the entry point's
    // whole contract for its out-parameter.
    let status = unsafe { shojiku_engine_info(&mut handle) };
    // SAFETY: the handle is whatever the call above wrote, which is either
    // null or a handle this crate now owns.
    unsafe { read(status, handle) }
}

/// Renders the document described by the request envelope to PDF bytes.
#[must_use]
pub fn render(request: &[u8]) -> Outcome {
    let mut handle = std::ptr::null_mut();
    // SAFETY: `request` is a live slice for the duration of the call and
    // `handle` is one writable slot.
    let status = unsafe { shojiku_render(request.as_ptr(), request.len(), &mut handle) };
    // SAFETY: as above.
    unsafe { read(status, handle) }
}

/// Signs already-rendered PDF bytes.
///
/// The passphrase is optional because an unencrypted key does not have one;
/// an encrypted key with none supplied comes back as a named failure rather
/// than a parse error.
#[must_use]
pub fn sign(pdf: &[u8], key: &[u8], certificate: &[u8], passphrase: Option<&[u8]>) -> Outcome {
    let (pass_ptr, pass_len) = match passphrase {
        Some(bytes) => (bytes.as_ptr(), bytes.len()),
        None => (std::ptr::null(), 0),
    };
    let mut handle = std::ptr::null_mut();
    // SAFETY: every pair describes a live slice for the duration of the call
    // (or is the null the entry point documents as "no passphrase"), and
    // `handle` is one writable slot.
    let status = unsafe {
        shojiku_sign(
            pdf.as_ptr(),
            pdf.len(),
            key.as_ptr(),
            key.len(),
            certificate.as_ptr(),
            certificate.len(),
            pass_ptr,
            pass_len,
            &mut handle,
        )
    };
    // SAFETY: as above.
    unsafe { read(status, handle) }
}

/// Verifies a signed PDF against caller-supplied trust anchors.
#[must_use]
pub fn verify(pdf: &[u8], anchors: &[u8]) -> Outcome {
    let mut handle = std::ptr::null_mut();
    // SAFETY: both pairs describe live slices for the duration of the call
    // and `handle` is one writable slot.
    let status = unsafe {
        shojiku_verify(
            pdf.as_ptr(),
            pdf.len(),
            anchors.as_ptr(),
            anchors.len(),
            &mut handle,
        )
    };
    // SAFETY: as above.
    unsafe { read(status, handle) }
}

/// Copies a handle out and frees it.
///
/// Takes the handle by pointer rather than by reference so a null one is an
/// ordinary answer here instead of undefined behaviour at the call sites —
/// which is also what lets a test exercise that arm without forging a handle.
///
/// # Safety
///
/// `handle` must be null or a handle `shojiku-capi` returned and that has not
/// been freed. It is freed here, so no caller may use it afterwards.
unsafe fn read(status: i32, handle: *mut ShojikuResult) -> Outcome {
    if handle.is_null() {
        return Outcome::empty(status);
    }
    let mut success = 0;
    // SAFETY: `handle` is non-null (checked above) and live, and `success` is
    // one writable `int32_t`.
    unsafe { shojiku_result_success(handle, &mut success) };
    let outcome = Outcome {
        status,
        success: success == 1,
        // SAFETY: as above; each reader is one of the crate's own accessors.
        pdf: unsafe { bytes(handle, shojiku_result_pdf) },
        json: unsafe { text(handle, shojiku_result_json) },
        diagnostics: unsafe { text(handle, shojiku_result_diagnostics_json) },
        error: unsafe { text(handle, shojiku_result_error_json) },
    };
    // SAFETY: the handle is live and has not been freed; every pointer lent
    // above has already been copied out of.
    unsafe { shojiku_result_free(handle) };
    outcome
}

/// Copies one lent buffer out of the handle.
///
/// # Safety
///
/// `handle` must be a live, unfreed handle and `read` one of this library's
/// buffer accessors.
unsafe fn bytes(handle: *const ShojikuResult, read: Reader) -> Vec<u8> {
    let mut ptr = std::ptr::null();
    let mut len = 0;
    // SAFETY: the caller's contract; both out-parameters are writable slots.
    // The status can only report a null argument, and neither is null.
    unsafe { read(handle, &mut ptr, &mut len) };
    if len == 0 {
        return Vec::new();
    }
    // SAFETY: the accessor wrote a pointer borrowing `len` readable bytes of
    // the handle, which is still alive; the copy ends before the free.
    unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec()
}

/// The same, for a buffer the library documents as UTF-8.
///
/// A replacement-character decode rather than a failure: these payloads are
/// `serde_json` output from this process, so invalid UTF-8 would be a bug in
/// the engine rather than a caller's input, and losing the whole outcome to
/// it would hide the very diagnostics that explain what went wrong.
///
/// # Safety
///
/// As [`bytes`].
unsafe fn text(handle: *const ShojikuResult, read: Reader) -> String {
    // SAFETY: the caller's contract, handed straight on.
    String::from_utf8_lossy(&unsafe { bytes(handle, read) }).into_owned()
}

#[cfg(test)]
mod tests;
