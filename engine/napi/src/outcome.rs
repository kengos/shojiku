//! One operation's result, owned.
//!
//! The C surface hands back a handle whose accessors LEND pointers into it;
//! this is what those pointers say, copied out, so the handle can be freed
//! before anything reaches JavaScript.
//!
//! The field set is the C surface's, unchanged — including `status` beside
//! `success`. Those are the two levels the whole SDK contract rests on: a
//! non-zero `status` is the caller's mistake (a malformed envelope, a caught
//! panic) and becomes an exception in the npm package, while `status` zero
//! with `success` false is an ordinary fact about a document, a pack or a key
//! and becomes a failed result. Collapsing them here would make the node SDK
//! the one that raises where the other six return.

/// What one operation produced.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Outcome {
    /// The C status code: zero unless the CALLER got something wrong.
    pub status: i32,
    /// Whether the operation produced what was asked for.
    pub success: bool,
    /// Rendered or signed PDF bytes; empty when the operation produced none.
    pub pdf: Vec<u8>,
    /// The operation's own JSON payload — engine info, a page count, a
    /// verification report.
    pub json: String,
    /// The engine's diagnostics as JSON. Present on success too: a render
    /// that worked can still carry warnings.
    pub diagnostics: String,
    /// The `{step, kind, message}` cause as JSON; empty on success.
    pub error: String,
}

impl Outcome {
    /// The outcome when the library returned a status but no handle.
    ///
    /// The C host writes a handle on every path it can reach, so this is not
    /// a case the surface produces today — it exists so that reading a
    /// handle is total rather than dereferencing whatever it was given, and
    /// its own test calls it directly.
    pub(crate) fn empty(status: i32) -> Self {
        Outcome {
            status,
            ..Outcome::default()
        }
    }
}

#[cfg(test)]
mod tests;
