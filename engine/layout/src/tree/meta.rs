//! Resolved document metadata: what the PDF says the document IS.
//!
//! Rides the layout tree because that is the ONE contract renderers read,
//! and it reaches `inspect` with it, so a GUI or an AI consumer sees the
//! same resolved values the PDF will carry. Every string here has already
//! been interpolated AND gated by layout (control characters, length,
//! tag charset) — renderers write what they are given.

use serde::Serialize;

/// The title a document that says nothing about itself carries.
pub const DEFAULT_DOCUMENT_TITLE: &str = "Shojiku Document";

/// The metadata the PDF backend writes into `/Info` and XMP. The PNG
/// backend has no metadata channel and ignores this, like it ignores
/// links.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocumentMetadata {
    /// Always present: the authored `document.title`, else the template
    /// `name:`, else [`DEFAULT_DOCUMENT_TITLE`].
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub keywords: Vec<String>,
    /// A BCP 47 tag, already charset-checked — it reaches the XMP packet
    /// unescaped, so an ungated value could break the packet.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
}

impl Default for DocumentMetadata {
    fn default() -> Self {
        Self {
            title: DEFAULT_DOCUMENT_TITLE.to_string(),
            description: None,
            keywords: Vec::new(),
            language: None,
            authors: Vec::new(),
        }
    }
}
