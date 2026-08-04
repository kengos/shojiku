//! Document metadata wire (`document:`): what the PDF says the document
//! IS, rather than what it draws.

use serde::{Deserialize, Serialize};

/// Longest list a `keywords:` / `authors:` entry list may carry. Extra
/// entries warn (`too_many_document_entries`) and are dropped — the same
/// registry hygiene the `styles`/`formats` caps provide.
pub const MAX_DOCUMENT_ENTRIES: usize = 64;

/// Document metadata written into the PDF's `/Info` dictionary and its
/// XMP packet: the honest channel for saying what a document is, for a
/// reader's Properties panel, a search index, or an AI consumer.
///
/// Every value takes `{key:format}` interpolation like static text and
/// resolves against top-level params. Layout gates the *resolved* values
/// before they enter the tree (control characters, length, and — for
/// `language` — a strict tag charset), exactly as it gates `link.url`.
///
/// PDF-only: the PNG backend has no metadata channel and silently
/// ignores this block, like it ignores `link:`.
///
/// `creationDate` is deliberately absent: a rendered date would make the
/// output differ run to run, and "same inputs ⇒ same bytes" is the
/// property sign/verify rests on.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DocumentMeta {
    /// The document's title. Falls back to the template `name:` when
    /// unset, so an existing template's PDF title does not move.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// A short human-readable summary (the PDF `/Subject`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Keywords describing the document. Capped by
    /// [`MAX_DOCUMENT_ENTRIES`].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<String>,
    /// The document's main language as a BCP 47 tag (`ja-JP`). Falls
    /// back to `defaults.locale` so it is not authored twice.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// The document's authors. Capped by [`MAX_DOCUMENT_ENTRIES`].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
}

impl DocumentMeta {
    /// Whether nothing is authored — the skip predicate that keeps an
    /// untouched template free of an empty `document:` map.
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.keywords.is_empty()
            && self.language.is_none()
            && self.authors.is_empty()
    }
}

#[cfg(test)]
mod tests;
