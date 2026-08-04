//! What an entry point asks [`deliver`](super::deliver) to run.
//!
//! A VALUE rather than a closure per entry point, and the reason is
//! measurable: a closure is a separate function in every copy of this crate,
//! so one written at six call sites is six functions, each dead in whichever
//! copy does not call it — which the coverage gate reads as unreached code
//! while every merged view shows green. One enum means one closure, at one
//! site, that every entry point drives.
//!
//! This module is also where the pointer-taking operations borrow their
//! arguments. Everything below hands plain slices to `ops`, so no code that
//! can get a document wrong ever sees a pointer.

use crate::input::{
    self, MAX_ALGORITHM_BYTES, MAX_ANCHOR_BYTES, MAX_KEY_BYTES, MAX_PASSPHRASE_BYTES,
    MAX_PDF_BYTES, MAX_REQUEST_BYTES,
};
use crate::ops;
use crate::request::Request;
use crate::result::ShojikuResult;
use crate::status::Failure;

/// A `(pointer, length)` argument as it arrives from C.
pub(super) type Arg = (*const u8, usize);

/// One unit of work, with its inputs still in raw form.
pub(super) enum Work {
    /// Engine info: no inputs at all.
    Info,
    /// One of the envelope-taking operations.
    Document {
        request: *const u8,
        len: usize,
        run: fn(&Request) -> Result<ShojikuResult, Failure>,
    },
    /// Signing, whose inputs are bytes rather than an envelope.
    Sign {
        pdf: Arg,
        key: Arg,
        cert: Arg,
        pass: Arg,
    },
    /// The first half of signing with a key held elsewhere.
    SignPrepare { pdf: Arg, cert: Arg, algorithm: Arg },
    /// The second half: a signature made elsewhere, coming back.
    SignComplete {
        pdf: Arg,
        cert: Arg,
        algorithm: Arg,
        signature: Arg,
    },
    /// Verification: a signed document and the anchors to judge it against.
    Verify { pdf: Arg, anchors: Arg },
}

impl Work {
    /// The envelope-taking shape, named so the three entry points that use it
    /// read as one line each.
    pub(super) fn document(
        request: *const u8,
        len: usize,
        run: fn(&Request) -> Result<ShojikuResult, Failure>,
    ) -> Work {
        Work::Document { request, len, run }
    }

    /// Runs it.
    ///
    /// # Safety
    ///
    /// Every pointer this carries must satisfy the contract in
    /// `include/shojiku.h`.
    pub(super) unsafe fn run(&self) -> Result<ShojikuResult, Failure> {
        match *self {
            Work::Info => ops::info::run(),
            Work::Document { request, len, run } => {
                // SAFETY: `request`/`len` describe a byte range the caller
                // guarantees valid for this call; the borrow does not outlive it.
                let raw = unsafe { input::bytes(request, len, MAX_REQUEST_BYTES, "request")? };
                run(&Request::parse(input::text(raw, "request")?)?)
            }
            Work::Sign {
                pdf,
                key,
                cert,
                pass,
            } => {
                // SAFETY: the caller's contract, as above.
                unsafe { signed(pdf, key, cert, pass) }
            }
            Work::SignPrepare {
                pdf,
                cert,
                algorithm,
            } => {
                // SAFETY: the caller's contract, as above.
                unsafe { sign_prepared(pdf, cert, algorithm) }
            }
            Work::SignComplete {
                pdf,
                cert,
                algorithm,
                signature,
            } => {
                // SAFETY: the caller's contract, as above.
                unsafe { sign_completed(pdf, cert, algorithm, signature) }
            }
            Work::Verify { pdf, anchors } => {
                // SAFETY: the caller's contract, as above.
                unsafe { verified(pdf, anchors) }
            }
        }
    }
}

/// Borrows the four byte arguments of `sign` and runs the operation.
///
/// Takes `(pointer, length)` pairs so every borrow fits one physical line: a
/// wrapped call whose `)?` lands on a line by itself leaves that line with no
/// region any run executes, and the coverage gate reads it as dead code.
///
/// # Safety
///
/// As [`shojiku_sign`](super::shojiku_sign).
unsafe fn signed(pdf: Arg, key: Arg, cert: Arg, pass: Arg) -> Result<ShojikuResult, Failure> {
    // SAFETY: each pair describes a byte range the caller guarantees valid for
    // this call; no borrow outlives it, and the key material is passed
    // through to the signer without being copied.
    unsafe {
        let pdf = input::bytes(pdf.0, pdf.1, MAX_PDF_BYTES, "pdf")?;
        let key = input::bytes(key.0, key.1, MAX_KEY_BYTES, "key")?;
        let cert = input::bytes(cert.0, cert.1, MAX_KEY_BYTES, "certificate")?;
        let pass = input::opt_bytes(pass.0, pass.1, MAX_PASSPHRASE_BYTES, "passphrase")?;
        ops::sign::run(pdf, key, cert, pass)
    }
}

/// Borrows the three byte arguments of `sign_prepare` and runs it.
///
/// # Safety
///
/// As [`shojiku_sign_prepare`](super::shojiku_sign_prepare).
unsafe fn sign_prepared(pdf: Arg, cert: Arg, algorithm: Arg) -> Result<ShojikuResult, Failure> {
    // SAFETY: each pair describes a byte range the caller guarantees valid
    // for this call, and no borrow outlives it.
    unsafe {
        let pdf = input::bytes(pdf.0, pdf.1, MAX_PDF_BYTES, "pdf")?;
        let cert = input::bytes(cert.0, cert.1, MAX_KEY_BYTES, "certificate")?;
        let raw = input::bytes(algorithm.0, algorithm.1, MAX_ALGORITHM_BYTES, "algorithm")?;
        ops::sign::external::prepare(pdf, cert, input::text(raw, "algorithm")?)
    }
}

/// Borrows the four byte arguments of `sign_complete` and runs it.
///
/// # Safety
///
/// As [`shojiku_sign_complete`](super::shojiku_sign_complete).
unsafe fn sign_completed(
    pdf: Arg,
    cert: Arg,
    algorithm: Arg,
    signature: Arg,
) -> Result<ShojikuResult, Failure> {
    // SAFETY: each pair describes a byte range the caller guarantees valid
    // for this call, and no borrow outlives it.
    unsafe {
        let pdf = input::bytes(pdf.0, pdf.1, MAX_PDF_BYTES, "pdf")?;
        let cert = input::bytes(cert.0, cert.1, MAX_KEY_BYTES, "certificate")?;
        let raw = input::bytes(algorithm.0, algorithm.1, MAX_ALGORITHM_BYTES, "algorithm")?;
        let max = ops::sign::external::MAX_SIGNATURE_BYTES;
        let signature = input::bytes(signature.0, signature.1, max, "signature")?;
        let algorithm = input::text(raw, "algorithm")?;
        ops::sign::external::complete(pdf, cert, algorithm, signature)
    }
}

/// Borrows the two byte arguments of `verify` and runs the operation.
///
/// # Safety
///
/// As [`shojiku_verify`](super::shojiku_verify).
unsafe fn verified(pdf: Arg, anchors: Arg) -> Result<ShojikuResult, Failure> {
    // SAFETY: each pair describes a byte range the caller guarantees valid
    // for this call, and no borrow outlives it.
    unsafe {
        let pdf = input::bytes(pdf.0, pdf.1, MAX_PDF_BYTES, "pdf")?;
        let anchors = input::bytes(anchors.0, anchors.1, MAX_ANCHOR_BYTES, "anchors")?;
        ops::verify::run(pdf, anchors)
    }
}
