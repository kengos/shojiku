//! The C entry points.
//!
//! Every one of them has the same skeleton and it is worth stating once: check
//! `out`, blank it, run the operation inside the panic shield, write whatever
//! came back — a result on success, the failure rendered as a result on
//! anything else — and return a status. That uniformity is what lets an SDK
//! write one call wrapper and reuse it for the whole surface.
//!
//! The blanking matters: `*out` is set to null BEFORE the work starts, so a
//! caller that ignores the status and frees `*out` unconditionally is doing
//! something well defined rather than freeing whatever was in that variable.
//!
//! Only `out`-checking happens at this layer; the raw arguments are borrowed
//! in [`work`], and every decision about a document is made in `ops`, over
//! ordinary Rust references.

mod work;

use crate::ops;
use crate::result::ShojikuResult;
use crate::status::{shield_result, SHOJIKU_ERR_NULL_ARG, SHOJIKU_OK};
use work::Work;

/// The revision of this ABI.
///
/// It goes up only if a symbol's meaning or signature CHANGES. Adding an
/// operation or an envelope key does not move it: the surface is append-only
/// by design, so an SDK built against revision 1 keeps working against a
/// later library, and this is how it checks that promise is being kept.
const ABI_VERSION: u32 = 1;

/// The ABI revision this library implements. Call it first; everything else
/// assumes the caller agreed with the answer.
#[no_mangle]
pub extern "C" fn shojiku_abi_version() -> u32 {
    ABI_VERSION
}

/// Writes this build's engine info (version, capability keys, builtin
/// locales) as JSON, readable with `shojiku_result_json`.
///
/// # Safety
///
/// `out` must be null or point at one writable result-handle slot.
#[no_mangle]
pub unsafe extern "C" fn shojiku_engine_info(out: *mut *mut ShojikuResult) -> i32 {
    // SAFETY: `deliver` checks `out` itself; this work borrows nothing raw.
    unsafe { deliver(out, Work::Info) }
}

/// Validates the sources in the request envelope.
///
/// # Safety
///
/// `request` must point at `request_len` readable bytes for the duration of
/// the call, and `out` must be null or point at one writable slot.
#[no_mangle]
pub unsafe extern "C" fn shojiku_validate(
    request: *const u8,
    request_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    // SAFETY: the caller's contract, as documented above and in the header.
    unsafe {
        deliver(
            out,
            Work::document(request, request_len, ops::validate::run),
        )
    }
}

/// Renders the document to PDF bytes, readable with `shojiku_result_pdf`.
///
/// # Safety
///
/// As [`shojiku_validate`].
#[no_mangle]
pub unsafe extern "C" fn shojiku_render(
    request: *const u8,
    request_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    // SAFETY: the caller's contract, as documented above and in the header.
    unsafe { deliver(out, Work::document(request, request_len, ops::render::run)) }
}

/// Rasterizes the document to PNG pages, readable with
/// `shojiku_result_page_count` and `shojiku_result_page_png`.
///
/// # Safety
///
/// As [`shojiku_validate`].
#[no_mangle]
pub unsafe extern "C" fn shojiku_preview(
    request: *const u8,
    request_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    // SAFETY: the caller's contract, as documented above and in the header.
    unsafe { deliver(out, Work::document(request, request_len, ops::preview::run)) }
}

/// Signs an already-rendered PDF, writing the signed bytes to the result.
///
/// There is no request envelope here because signing has no document inputs:
/// it takes bytes, a key and a certificate. `passphrase` may be null, which
/// means the key is expected to be unencrypted — an encrypted key with no
/// passphrase comes back as a named failure rather than a parse error.
///
/// # Safety
///
/// Each `(pointer, length)` pair must describe readable bytes for the
/// duration of the call; `passphrase` may be null; `out` must be null or
/// point at one writable slot.
#[no_mangle]
pub unsafe extern "C" fn shojiku_sign(
    pdf: *const u8,
    pdf_len: usize,
    key: *const u8,
    key_len: usize,
    certificate: *const u8,
    certificate_len: usize,
    passphrase: *const u8,
    passphrase_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    let work = Work::Sign {
        pdf: (pdf, pdf_len),
        key: (key, key_len),
        cert: (certificate, certificate_len),
        pass: (passphrase, passphrase_len),
    };
    // SAFETY: the pairs are handed on unchanged under the caller's contract;
    // `deliver` checks `out` itself.
    unsafe { deliver(out, work) }
}

/// Reserves a signature window and reports the bytes a signature has to be
/// computed over, as JSON on the result.
///
/// The first half of signing with a key this process is never given. The
/// payload carries `toBeSigned` and `digest` as base64, plus the document's
/// `byteRange` and the window's `capacity`. Nothing secret crosses in either
/// direction — the certificate and the eventual signature are both public.
///
/// Call [`shojiku_sign_complete`] with the SAME `pdf`, `certificate` and
/// `algorithm`; the pair is stateless, and the second call re-derives the
/// prepared document rather than taking a handle for it.
///
/// # Safety
///
/// Each `(pointer, length)` pair must describe readable bytes for the
/// duration of the call; `out` must be null or point at one writable slot.
#[no_mangle]
pub unsafe extern "C" fn shojiku_sign_prepare(
    pdf: *const u8,
    pdf_len: usize,
    certificate: *const u8,
    certificate_len: usize,
    algorithm: *const u8,
    algorithm_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    let work = Work::SignPrepare {
        pdf: (pdf, pdf_len),
        cert: (certificate, certificate_len),
        algorithm: (algorithm, algorithm_len),
    };
    // SAFETY: the pairs are handed on unchanged under the caller's contract;
    // `deliver` checks `out` itself.
    unsafe { deliver(out, work) }
}

/// Writes a signature produced elsewhere into the document, returning the
/// signed bytes on the result.
///
/// `signature` is the raw output of signing `toBeSigned` from
/// [`shojiku_sign_prepare`]: PKCS#1 v1.5 bytes for `rsa-pkcs1-sha256`, an
/// ASN.1 DER `SEQUENCE` for `ecdsa-p256-sha256` — which is what both major
/// cloud key services return.
///
/// # Safety
///
/// As [`shojiku_sign_prepare`].
#[no_mangle]
pub unsafe extern "C" fn shojiku_sign_complete(
    pdf: *const u8,
    pdf_len: usize,
    certificate: *const u8,
    certificate_len: usize,
    algorithm: *const u8,
    algorithm_len: usize,
    signature: *const u8,
    signature_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    let work = Work::SignComplete {
        pdf: (pdf, pdf_len),
        cert: (certificate, certificate_len),
        algorithm: (algorithm, algorithm_len),
        signature: (signature, signature_len),
    };
    // SAFETY: the pairs are handed on unchanged under the caller's contract;
    // `deliver` checks `out` itself.
    unsafe { deliver(out, work) }
}

/// Verifies a signed PDF against caller-supplied trust anchors, writing the
/// report to the result's JSON payload.
///
/// `anchors` is required and holds concatenated PEM certificates. There is no
/// fallback to the machine's trust store: this library never consults one, so
/// a default would answer a different question than the caller asked.
///
/// `success` is the VERDICT. A document whose signature does not verify comes
/// back with `success` 0 — and with the report still attached, because the
/// report names the checks this release does not perform and a caller who
/// never sees it cannot tell a missing capability from a passed one.
///
/// # Safety
///
/// Each `(pointer, length)` pair must describe readable bytes for the
/// duration of the call; `out` must be null or point at one writable slot.
#[no_mangle]
pub unsafe extern "C" fn shojiku_verify(
    pdf: *const u8,
    pdf_len: usize,
    anchors: *const u8,
    anchors_len: usize,
    out: *mut *mut ShojikuResult,
) -> i32 {
    let work = Work::Verify {
        pdf: (pdf, pdf_len),
        anchors: (anchors, anchors_len),
    };
    // SAFETY: the pairs are handed on unchanged under the caller's contract;
    // `deliver` checks `out` itself.
    unsafe { deliver(out, work) }
}

/// Runs `work` under the shield and hands the caller exactly one handle.
///
/// The crate's ONE closure lives here, which is the point of [`Work`].
///
/// # Safety
///
/// `out` must be null or point at one writable result-handle slot, and
/// `work`'s own pointers must satisfy their entry point's contract.
unsafe fn deliver(out: *mut *mut ShojikuResult, work: Work) -> i32 {
    if out.is_null() {
        return SHOJIKU_ERR_NULL_ARG;
    }
    // SAFETY: `out` is non-null (checked above) and the caller guarantees it
    // points at one writable slot. Blanking first means a caller that frees
    // unconditionally frees null rather than a stale value.
    unsafe { *out = std::ptr::null_mut() };

    // SAFETY: `work` carries the caller's pointers unchanged; `Work::run`
    // states the same contract.
    let mut body = || unsafe { work.run() };
    let (status, result) = match shield_result(&mut body) {
        Ok(result) => (SHOJIKU_OK, result),
        Err(failure) => (failure.status(), failure.into_result()),
    };
    // SAFETY: as above. `into_raw` is the only place a handle is created, and
    // this is the only place one is handed over.
    unsafe { *out = result.into_raw() };
    status
}

#[cfg(test)]
mod tests;
