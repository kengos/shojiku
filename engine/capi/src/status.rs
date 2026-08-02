//! Status codes, the panic shield, and the failure type every operation
//! funnels into.
//!
//! The surface has TWO levels of failure and they are deliberately not the
//! same thing. A **non-zero status** means the CALLER got it wrong — a null
//! pointer, bytes that are not UTF-8, a request the schema rejects — or that
//! a panic was caught. Everything a *document* can do wrong (a template that
//! will not lay out, a locale pack that is not installed, a key that will not
//! sign) is an ordinary outcome: status zero, `success` zero, and the
//! diagnostics to explain it. That split is what lets an SDK raise for the
//! first class and return a result object for the second, which is the
//! contract `docs/agents/sdk.md` requires of all seven of them.
//!
//! Either way the caller gets a handle carrying an `error_json` object with
//! the same three keys, so one mapping in the SDK covers both levels. The
//! shape of that object lives in [`wire`].

mod wire;

pub(crate) use wire::{clip, encode};

use crate::result::ShojikuResult;
use std::panic::{catch_unwind, AssertUnwindSafe};

/// The operation completed. Ask the result whether it *succeeded*.
pub const SHOJIKU_OK: i32 = 0;
/// A pointer argument that must not be null was null.
pub const SHOJIKU_ERR_NULL_ARG: i32 = 1;
/// A string argument was not valid UTF-8.
pub const SHOJIKU_ERR_INVALID_UTF8: i32 = 2;
/// The request JSON was malformed, carried an unknown key, or omitted a
/// required one.
pub const SHOJIKU_ERR_INVALID_REQUEST: i32 = 3;
/// An argument was larger than the cap this library accepts for it.
pub const SHOJIKU_ERR_TOO_LARGE: i32 = 4;
/// A page index was past the end of the document.
pub const SHOJIKU_ERR_OUT_OF_RANGE: i32 = 5;
/// A panic was caught at the boundary. The library is still usable; the
/// operation is not.
pub const SHOJIKU_ERR_PANIC: i32 = 6;

/// Why an operation did not produce what the caller asked for.
///
/// One enum for both levels: [`status`](Failure::status) decides which level
/// a variant belongs to, so no call site has to remember.
pub(crate) enum Failure {
    /// A required pointer was null.
    NullArg(&'static str),
    /// A string argument was not UTF-8.
    InvalidUtf8(&'static str),
    /// The request JSON could not be read as a request.
    InvalidRequest(String),
    /// An argument exceeded its cap.
    TooLarge {
        what: &'static str,
        len: usize,
        max: usize,
    },
    /// A page index was past the end of the document.
    OutOfRange { index: usize, total: usize },
    /// A panic crossed into the shield.
    Panic(String),
    /// A host-side cause of an ordinary operation failure — a pack that is
    /// not installed, a key that cannot be read. Status stays OK.
    Host {
        step: &'static str,
        kind: &'static str,
        message: String,
    },
    /// The engine refused the document itself; its diagnostics say why.
    /// Status stays OK.
    Document {
        step: &'static str,
        diagnostics: String,
    },
}

impl Failure {
    /// A host-side cause, taking the underlying error as `&dyn Display` so
    /// there is ONE conversion in the binary rather than one per call site.
    pub(crate) fn host(
        step: &'static str,
        kind: &'static str,
        cause: &dyn std::fmt::Display,
    ) -> Self {
        Failure::Host {
            step,
            kind,
            message: cause.to_string(),
        }
    }

    /// The engine's refusal of a document, carrying its diagnostics.
    pub(crate) fn document(
        step: &'static str,
        diagnostics: &shojiku_diagnostics::Diagnostics,
    ) -> Self {
        Failure::Document {
            step,
            diagnostics: encode(diagnostics),
        }
    }

    /// The status code this failure returns to C.
    pub(crate) fn status(&self) -> i32 {
        match self {
            Failure::NullArg(_) => SHOJIKU_ERR_NULL_ARG,
            Failure::InvalidUtf8(_) => SHOJIKU_ERR_INVALID_UTF8,
            Failure::InvalidRequest(_) => SHOJIKU_ERR_INVALID_REQUEST,
            Failure::TooLarge { .. } => SHOJIKU_ERR_TOO_LARGE,
            Failure::OutOfRange { .. } => SHOJIKU_ERR_OUT_OF_RANGE,
            Failure::Panic(_) => SHOJIKU_ERR_PANIC,
            // Both levels of "the operation ran and did not work" report OK:
            // the verdict is the result's `success` flag, not the status.
            Failure::Host { .. } | Failure::Document { .. } => SHOJIKU_OK,
        }
    }

    /// Turns the failure into the handle the caller receives.
    pub(crate) fn into_result(self) -> ShojikuResult {
        let error = self.error_json();
        let diagnostics = match self {
            Failure::Document { diagnostics, .. } => Some(diagnostics),
            _ => None,
        };
        ShojikuResult::failed(diagnostics, error)
    }
}

/// Runs an operation with the panic shield.
///
/// Deliberately NOT generic over the closure: a generic shield is
/// monomorphized per call site, and each copy carries its own unwind arm that
/// no test can reach. One copy means one arm, exercised once.
pub(crate) fn shield_result(
    body: &mut dyn FnMut() -> Result<ShojikuResult, Failure>,
) -> Result<ShojikuResult, Failure> {
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(outcome) => outcome,
        // `&*payload`, not `&payload`: the payload is a `Box<dyn Any>`, and
        // `&Box<dyn Any>` UNSIZES to `&dyn Any` before it would deref — which
        // hands the downcast the Box as the concrete type and loses every
        // message. Dereferencing first is what reaches the panic's own value.
        Err(payload) => Err(Failure::Panic(panic_message(&*payload))),
    }
}

/// The accessor-shaped shield: same reasoning, a status code instead of a
/// handle (an accessor has nowhere to put one).
pub(crate) fn shield_status(body: &mut dyn FnMut() -> i32) -> i32 {
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(status) => status,
        Err(_) => SHOJIKU_ERR_PANIC,
    }
}

/// Recovers what the panic said, when it said it as a string. A panic payload
/// of another type carries nothing printable, so it gets a fixed message
/// rather than a debug rendering of an unknown type.
fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return clip(message);
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return clip(message);
    }
    "a panic was caught at the library boundary".to_string()
}

#[cfg(test)]
mod tests;
