//! Inline rich-text spans (RT1): styled fragments inside one text item.

use crate::style::Style;
use serde::{Deserialize, Serialize};

use super::binding::Binding;
use super::link::Link;

/// One styled fragment of a rich text item. Content comes from `text`
/// (static, with `{key:format}` interpolation) or `data` (single bound
/// value) — exactly one should be set, like the text item itself. The
/// fragment's `style`/`styleNames` layer on top of the *block's* computed
/// style; only the text-run properties apply per span (`fontSize`,
/// `fontFamily`, `fontWeight`, `fontStyle`, `letterSpacing`, `color`,
/// `textDecoration`) — box- and block-level keys are flagged by
/// validation (`ignored_span_style`) and ignored. Spans concatenate in
/// listed order with no separator; wrapping runs over the joined text, so
/// a Latin word crossing a span boundary still wraps as one word.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Span {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// Named styles from the template registry, in listed order (later
    /// wins), layered below the inline `style` — both on top of the
    /// block's own computed style. Bounded by
    /// [`crate::style::MAX_STYLE_NAMES`].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
    /// Hyperlink (LK1) over this fragment's runs. Overrides the block's
    /// own `link` for these runs; a span link that layout rejects drops
    /// the link (no fallback), so the author's warning is not masked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<Link>,
}

/// Maximum `spans` one text item may list. Templates are untrusted; each
/// span costs a style resolution and a font-chain lookup per layout pass,
/// so the fan-out is bounded (mirroring [`crate::style::MAX_STYLES`]).
/// Exceeding it is a warning — layout applies the first `MAX_SPANS` and
/// rendering proceeds.
pub const MAX_SPANS: usize = 256;
