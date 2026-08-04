//! Document-metadata resolution: interpolates the `document:` block
//! against params, then gates every resolved value before it enters the
//! tree — layout is the trust boundary here exactly as it is for
//! `link.url` (see `engine/link.rs`); renderers write what the tree
//! carries without judgment.
//!
//! The gate is not cosmetic. Metadata strings land in the PDF's XMP
//! packet, which is XML: `xmp-writer` escapes ordinary values, but a
//! LANGUAGE tag is written RAW, so an ungated tag could close the
//! element and inject markup. Control characters are invalid XML
//! whatever the escaping, and params are untrusted.

use shojiku_core::{Bindings, DocumentMeta, MAX_DOCUMENT_ENTRIES};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::Ctx;
use crate::tree::{DocumentMetadata, DEFAULT_DOCUMENT_TITLE};

/// Longest metadata value, in bytes, after interpolation. Params are
/// untrusted; the cap bounds what a hostile value can grow the PDF by,
/// mirroring the link-URL cap.
pub(super) const MAX_META_TEXT: usize = 2048;

/// Longest language tag. RFC 5646 tags are far shorter; the bound is
/// generous and still keeps a hostile value out of the XMP packet.
pub(super) const MAX_META_LANGUAGE: usize = 64;

/// Why a resolved metadata value was rejected. A pure enum so every
/// hostile branch is unit-testable without a layout pass. Each variant
/// is its OWN diagnostic code rather than a `{reason}` arg on a shared
/// one: the engine never translates, so an English reason inside a
/// translated sentence would reach a Japanese reader half-rendered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum MetaReject {
    /// Over the byte cap (which differs per field, so it rides along).
    TooLong { max: usize },
    /// Contains control characters (invalid XML in the metadata packet,
    /// and a viewer-confusion risk in `/Info`).
    Control,
    /// A language tag outside `[A-Za-z0-9-]` — the one value XMP writes
    /// without escaping.
    Charset,
}

impl MetaReject {
    /// The diagnostic this rejection raises, already carrying the args
    /// its template needs beyond `{key}`.
    fn diagnostic(self) -> Diagnostic {
        match self {
            MetaReject::TooLong { max } => {
                Diagnostic::new(Code::DocumentMetadataTooLong).arg("max", max)
            }
            MetaReject::Control => Diagnostic::new(Code::DocumentMetadataControlChars),
            MetaReject::Charset => Diagnostic::new(Code::InvalidDocumentLanguage),
        }
    }
}

/// Gates one resolved metadata string: `Ok` carries the trimmed form,
/// `Ok("")` meaning "nothing authored here" (the caller drops it without
/// a diagnostic — a blank binding is already reported as missing data).
pub(super) fn check_meta_text(value: &str) -> Result<&str, MetaReject> {
    let trimmed = value.trim();
    if trimmed.len() > MAX_META_TEXT {
        return Err(MetaReject::TooLong { max: MAX_META_TEXT });
    }
    if trimmed.chars().any(char::is_control) {
        return Err(MetaReject::Control);
    }
    Ok(trimmed)
}

/// Gates a resolved language tag: the text gate plus a strict charset,
/// because this value reaches the XMP packet unescaped.
pub(super) fn check_meta_language(value: &str) -> Result<&str, MetaReject> {
    let trimmed = value.trim();
    if trimmed.len() > MAX_META_LANGUAGE {
        return Err(MetaReject::TooLong {
            max: MAX_META_LANGUAGE,
        });
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(MetaReject::Charset);
    }
    Ok(trimmed)
}

/// What one metadata field resolved to. The three cases are distinct
/// because a FALLBACK must only cover an absent value: substituting a
/// different value for one the gate refused would hide the refusal
/// behind plausible output (a rejected `ja"><…` language silently
/// becoming the document locale, say).
enum MetaField {
    Value(String),
    /// Unset, or blank after interpolation — the fallback's case.
    Absent,
    /// Gated out; already reported. Terminal.
    Rejected,
}

impl Ctx<'_, '_> {
    /// Interpolates one metadata string and gates it.
    fn meta_value(
        &mut self,
        key: &str,
        raw: Option<&str>,
        gate: fn(&str) -> Result<&str, MetaReject>,
    ) -> MetaField {
        let Some(raw) = raw else {
            return MetaField::Absent;
        };
        // The shared funnel answers `None` only when neither text nor data
        // is authored, which cannot happen here — and a blank string is
        // already `Absent` below, so this needs no branch of its own.
        let resolved = self
            .resolve_content(Some(raw), None, &Bindings::new())
            .unwrap_or_default();
        match gate(&resolved) {
            Ok("") => MetaField::Absent,
            Ok(text) => MetaField::Value(text.to_string()),
            Err(reject) => {
                self.diags.push(reject.diagnostic().arg("key", key));
                MetaField::Rejected
            }
        }
    }

    /// One optional metadata field: present when it survived the gate.
    fn meta_opt(
        &mut self,
        key: &str,
        raw: Option<&str>,
        gate: fn(&str) -> Result<&str, MetaReject>,
    ) -> Option<String> {
        match self.meta_value(key, raw, gate) {
            MetaField::Value(text) => Some(text),
            MetaField::Absent | MetaField::Rejected => None,
        }
    }

    /// The gated entries of a metadata list. A rejected entry drops and
    /// warns on its own address; its siblings survive.
    fn meta_list(&mut self, key: &str, raw: &[String]) -> Vec<String> {
        let mut out = Vec::new();
        for (i, entry) in raw.iter().take(MAX_DOCUMENT_ENTRIES).enumerate() {
            if let Some(text) = self.meta_opt(&format!("{key}[{i}]"), Some(entry), check_meta_text)
            {
                out.push(text);
            }
        }
        out
    }

    /// Resolves the whole `document:` block. The title falls back to the
    /// template `name:` and then to [`DEFAULT_DOCUMENT_TITLE`], and the
    /// language to `defaults.locale`, so neither is authored twice.
    pub(super) fn document_metadata(&mut self) -> DocumentMetadata {
        let meta: &DocumentMeta = &self.input.template.document;
        let (title, description, keywords, language, authors) = (
            meta.title.clone(),
            meta.description.clone(),
            meta.keywords.clone(),
            meta.language.clone(),
            meta.authors.clone(),
        );
        let name = self.input.template.name.clone();
        let locale = self.input.template.defaults.locale.clone();

        let title = match self.meta_value("title", title.as_deref(), check_meta_text) {
            MetaField::Value(text) => text,
            MetaField::Rejected => DEFAULT_DOCUMENT_TITLE.to_string(),
            // Only an ABSENT title reaches the template `name:` — the
            // pre-`document:` behavior, unchanged.
            MetaField::Absent => self
                .meta_opt("title", name.as_deref(), check_meta_text)
                .unwrap_or_else(|| DEFAULT_DOCUMENT_TITLE.to_string()),
        };
        let language = match self.meta_value("language", language.as_deref(), check_meta_language) {
            MetaField::Value(tag) => Some(tag),
            MetaField::Rejected => None,
            MetaField::Absent => self.meta_opt("language", locale.as_deref(), check_meta_language),
        };
        DocumentMetadata {
            title,
            description: self.meta_opt("description", description.as_deref(), check_meta_text),
            keywords: self.meta_list("keywords", &keywords),
            language,
            authors: self.meta_list("authors", &authors),
        }
    }
}

#[cfg(test)]
mod tests;
