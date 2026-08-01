//! Hyperlink resolution (LK1): interpolates `link.url` against the
//! current data scope, then gates the resolved value before it enters
//! the tree — layout is the trust boundary; renderers emit whatever the
//! tree carries without judgment.

use shojiku_core::{Bindings, Link};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::Ctx;

/// Longest URL a link may carry, in bytes. Params are untrusted; the
/// cap bounds what a hostile value can grow the PDF (and any downstream
/// echo) by, mirroring the QR content cap.
pub(super) const MAX_LINK_URL: usize = 2048;

/// Why a resolved URL was rejected. A pure enum so every hostile branch
/// is unit-testable without a layout pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LinkReject {
    /// Empty (or whitespace-only) after interpolation.
    Empty,
    /// Over [`MAX_LINK_URL`] bytes.
    TooLong,
    /// Contains control characters (smuggling / viewer-confusion risk).
    Control,
    /// Scheme outside the allowlist — a PDF `/URI` action reaches the
    /// reader's machine, so `file:`/`javascript:`/anything unknown is
    /// dropped rather than passed through.
    Scheme,
}

/// Gates one resolved URL: `Ok` carries the trimmed form to emit.
pub(super) fn check_link_url(url: &str) -> Result<&str, LinkReject> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(LinkReject::Empty);
    }
    if trimmed.len() > MAX_LINK_URL {
        return Err(LinkReject::TooLong);
    }
    if trimmed.chars().any(char::is_control) {
        return Err(LinkReject::Control);
    }
    let allowed = ["http:", "https:", "mailto:", "tel:"];
    if allowed
        .iter()
        .any(|scheme| starts_with_ignore_case(trimmed, scheme))
    {
        Ok(trimmed)
    } else {
        Err(LinkReject::Scheme)
    }
}

/// ASCII-case-insensitive prefix test (schemes are ASCII; `JaVaScRiPt:`
/// must not slip past a case-sensitive match).
fn starts_with_ignore_case(value: &str, prefix: &str) -> bool {
    value
        .as_bytes()
        .get(..prefix.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(prefix.as_bytes()))
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Resolves a `link:` to the URL the tree will carry: `{key}`
    /// interpolation against the current scope (per-element inside
    /// `repeat` cells, like text content) through the OWNING item's
    /// `bindings` declarations, then the [`check_link_url`] gate. A
    /// rejected URL warns and drops the link (fail closed); messages
    /// never echo the URL — params control it and its length.
    pub(super) fn resolve_link(
        &mut self,
        link: Option<&Link>,
        bindings: &Bindings,
    ) -> Option<String> {
        let link = link?;
        // `resolve_content` with static text is always `Some`.
        let url = self.resolve_content(Some(&link.url), None, bindings)?;
        match check_link_url(&url) {
            Ok(trimmed) => Some(trimmed.to_string()),
            Err(LinkReject::Empty) => {
                self.diags.push(Diagnostic::new(Code::EmptyLinkUrl));
                None
            }
            Err(LinkReject::TooLong) => {
                self.diags
                    .push(Diagnostic::new(Code::LinkUrlTooLong).arg("max", MAX_LINK_URL));
                None
            }
            Err(LinkReject::Control | LinkReject::Scheme) => {
                self.diags
                    .push(Diagnostic::new(Code::UnsupportedLinkScheme));
                None
            }
        }
    }
}

#[cfg(test)]
mod tests;
