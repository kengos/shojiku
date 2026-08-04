//! The one allocation that crosses the boundary, and the only destructor.
//!
//! Every operation writes exactly one of these; the caller frees it with
//! `shojiku_result_free` and nothing else this library hands out is owned by
//! the caller. Accessors lend pointers INTO this handle rather than copying,
//! so an SDK reads the PDF bytes once, and the freed handle takes every one
//! of those pointers with it.
//!
//! The handle is deliberately not a tagged union: an operation that produced
//! no pages simply has none, and the accessor for them reports zero. One
//! shape means one set of bindings per language instead of one per operation.

mod access;

pub use access::{
    shojiku_result_diagnostics_json, shojiku_result_error_json, shojiku_result_free,
    shojiku_result_json, shojiku_result_page_count, shojiku_result_page_png, shojiku_result_pdf,
    shojiku_result_success,
};

/// The outcome of one operation. Opaque to C.
pub struct ShojikuResult {
    /// 1 when the operation produced what was asked for, 0 otherwise.
    success: i32,
    /// Rendered or signed PDF bytes.
    pdf: Vec<u8>,
    /// Rasterized preview pages, in document order.
    pages: Vec<Vec<u8>>,
    /// The operation's own JSON payload (engine info).
    json: String,
    /// The engine's diagnostics, always present for a document operation —
    /// a successful render still carries its warnings.
    diagnostics: String,
    /// `{step, kind, message}` when something went wrong; empty otherwise.
    error: String,
}

impl ShojikuResult {
    /// A succeeded result with nothing but the fields the caller sets next.
    fn succeeded() -> Self {
        ShojikuResult {
            success: 1,
            pdf: Vec::new(),
            pages: Vec::new(),
            json: String::new(),
            diagnostics: String::new(),
            error: String::new(),
        }
    }

    /// A JSON payload with no document behind it (engine info).
    pub(crate) fn json(json: String) -> Self {
        ShojikuResult {
            json,
            ..Self::succeeded()
        }
    }

    /// A document that passed validation, carrying its surviving warnings.
    pub(crate) fn diagnostics(diagnostics: String) -> Self {
        ShojikuResult {
            diagnostics,
            ..Self::succeeded()
        }
    }

    /// Rendered or signed bytes plus the diagnostics the render emitted.
    pub(crate) fn pdf(pdf: Vec<u8>, diagnostics: String) -> Self {
        ShojikuResult {
            pdf,
            diagnostics,
            ..Self::succeeded()
        }
    }

    /// Rasterized pages plus the diagnostics the render emitted.
    pub(crate) fn pages(pages: Vec<Vec<u8>>, diagnostics: String) -> Self {
        ShojikuResult {
            pages,
            diagnostics,
            ..Self::succeeded()
        }
    }

    /// A JSON payload from a document operation, with the diagnostics that
    /// ride every one of them — a verification report, or the bytes-to-sign
    /// object `shojiku_sign_prepare` hands out. Named for its SHAPE rather
    /// than for either operation: the two want the identical thing, and a
    /// second constructor for the second caller is how a shape acquires two
    /// spellings.
    pub(crate) fn json_and_diagnostics(json: String, diagnostics: String) -> Self {
        ShojikuResult {
            json,
            diagnostics,
            ..Self::succeeded()
        }
    }

    /// Attaches a JSON payload to a result built some other way.
    ///
    /// Two operations need it: a render reports its page count beside the
    /// bytes, and a FAILED verification still owes the caller the report —
    /// the verdict says no, and the report says which check said so and what
    /// this release never looked at. Dropping it on a failure is how a
    /// missing capability becomes a promise nobody made.
    pub(crate) fn with_json(mut self, json: String) -> Self {
        self.json = json;
        self
    }

    /// A failed result: the cause always, the engine's diagnostics when the
    /// engine is what refused.
    pub(crate) fn failed(diagnostics: Option<String>, error: String) -> Self {
        ShojikuResult {
            success: 0,
            error,
            diagnostics: diagnostics.unwrap_or_default(),
            ..Self::succeeded()
        }
    }

    /// Hands ownership to the caller. The only place a handle is created.
    pub(crate) fn into_raw(self) -> *mut ShojikuResult {
        Box::into_raw(Box::new(self))
    }
}

/// Readers the crate's own tests use, so a test asserts on a field without
/// the field becoming part of anyone else's API.
#[cfg(test)]
impl ShojikuResult {
    pub(crate) fn success_for_test(&self) -> i32 {
        self.success
    }

    pub(crate) fn json_for_test(&self) -> &str {
        &self.json
    }

    pub(crate) fn diagnostics_for_test(&self) -> &str {
        &self.diagnostics
    }

    pub(crate) fn error_for_test(&self) -> &str {
        &self.error
    }

    pub(crate) fn pages_for_test(&self) -> &[Vec<u8>] {
        &self.pages
    }

    pub(crate) fn pdf_for_test(&self) -> &[u8] {
        &self.pdf
    }
}

#[cfg(test)]
mod tests;
