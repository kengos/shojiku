//! Leaf items: text (static/interpolated/bound), rect, line, image,
//! and page-number.

use crate::geometry::{OptBox, PointSpec};
use crate::length::Length;
use crate::style::{LineStyle, Style};
use serde::{Deserialize, Serialize};

use super::binding::{Binding, Bindings};
use super::link::Link;
use super::marks::TextMark;
use super::ruby::RubyPair;
use super::spans::Span;

/// A text item. Content comes from `text` (static, with `{key:format}`
/// interpolation), `data` (single bound value), or `spans` (inline rich
/// text, RT1) — exactly one of which should be set.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// Declarations for this item's `{name}` interpolations, its spans'
    /// included — see [`Bindings`]. Bounded by [`super::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    /// Inline rich text (RT1): styled fragments drawn as one wrapped
    /// block. Takes precedence over `text`/`data` when non-empty
    /// (validation warns on the conflict). Bounded by
    /// [`super::spans::MAX_SPANS`].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spans: Vec<Span>,
    /// Named styles from the template registry, in listed order (later
    /// wins), layered below the inline `style`. Bounded by
    /// [`crate::style::MAX_STYLE_NAMES`].
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
    /// Hyperlink (LK1) over the whole block (every line; spans may
    /// override per fragment with their own `link`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<Link>,
    /// A text-anchored circled-text overlay auto-centered on the glyph band (a
    /// paint-only decoration that never changes this item's reserved box).
    /// Boxed: the mark carries a full `Style`, which would otherwise bloat
    /// every `Item::Text` (clippy `large_enum_variant`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mark: Option<Box<TextMark>>,
    /// Ruby (furigana) readings over a vertical block's content — see
    /// [`super::ruby::RubyPair`]. Bounded by
    /// [`super::ruby::MAX_RUBY_ENTRIES`].
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ruby: Vec<RubyPair>,
    /// Ruby reading font size; unset defaults to half the item's font
    /// size (the JLREQ convention). Readings still shrink to fit their
    /// base run's extent below it.
    #[serde(rename = "rubySize", default, skip_serializing_if = "Option::is_none")]
    pub ruby_size: Option<Length>,
}

/// A rectangle: a pure decoration box painted with the unified [`Style`]
/// (`backgroundColor` fills, `borderWidth`/`borderColor`/`borderStyle`
/// stroke — scalar or per-side, `solid`/`double`). Like every other item,
/// nothing draws unless a style layer authors it: a bare `rect` is
/// invisible (the pre-convergence 1pt default stroke is gone).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RectItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box")]
    pub box_: OptBox,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LineItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub from: PointSpec,
    pub to: PointSpec,
    #[serde(default, skip_serializing_if = "LineStyle::is_default")]
    pub style: LineStyle,
}

/// An image item. Content comes from `src` (compile-time: a path under
/// the assets directory, a `data:` URI, or inline SVG markup) or `data`
/// (a params-bound value, subject to the host's asset policy) — exactly
/// one should be set. `box.w`/`box.h` are required to reserve space.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImageItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// Declarations for the `{name}` interpolations in this item's
    /// `link.url` — see [`Bindings`]. Bounded by [`super::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    fit: Option<ImageFit>,
    /// Named styles from the registry, like text items. Only the box
    /// decoration properties (`backgroundColor`, `borderWidth`,
    /// `borderColor`) affect an image; text properties are unused.
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
    /// Hyperlink (LK1) over the image's draw box.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<Link>,
}

/// How an image scales into its box (CSS `object-fit`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageFit {
    /// Preserve aspect ratio, fit inside the box, center the remainder.
    #[default]
    Contain,
    /// Fill the box exactly, distorting if aspect ratios differ.
    Stretch,
    /// Preserve aspect ratio, cover the box fully, center and crop the
    /// overflow (layout clips it to the content box).
    Cover,
    /// Draw at the asset's intrinsic size (raster px at 72dpi / SVG
    /// viewBox units), centered; larger-than-box is cropped (clipped).
    None,
}

/// A QR code item (N2). Content comes from `text` (static, with
/// `{key}` interpolation) or `data` (single bound value) — exactly like
/// a text item; the engine encodes whatever string it is given (URL /
/// number / opaque token — no semantics). Encoded at *layout* time into
/// vector module rects, so it needs no asset pipeline and works inside
/// `repeat` cells with element-scoped bindings. `box.w`/`box.h` are
/// required; the code is drawn square (the smaller side) with the
/// spec's 4-module quiet zone inside.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QrCodeItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Binding>,
    /// Declarations for this item's `{name}` interpolations — see
    /// [`Bindings`]. Bounded by [`super::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    /// QR error-correction level (default `medium`). Higher levels
    /// tolerate more damage but need more modules for the same content.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error_correction: Option<EcLevel>,
    /// Named styles, decoration only (`backgroundColor` under the code —
    /// the usual white backing — and `borderWidth`/`borderColor`).
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// QR error-correction level (ISO 18004): tolerated damage ~7/15/25/30%.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EcLevel {
    Low,
    #[default]
    Medium,
    Quartile,
    High,
}

/// A bounded per-element list (N2): renders an array field one entry per
/// line, clamping at the last fitting entry and ending with an overflow
/// line when entries were cut. No pagination — inside a `repeat` cell the
/// box is a fixed slot; in a flow an auto-height list simply grows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    /// The array to render: a params key, or inside a `repeat` cell a
    /// field of the bound element.
    pub data: Binding,
    /// Per-entry template with `{key}` interpolation against the entry
    /// object. Unset: scalar entries print directly (strings as-is,
    /// numbers in plain form — no locale formatting).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Declarations for the `{name}` interpolations in this item's
    /// per-entry `text` — see [`Bindings`]. A declaration resolves against
    /// the ENTRY like the entry template itself does, unless it authors
    /// `scope: document`. Bounded by [`super::binding::MAX_BINDINGS`].
    #[serde(default, skip_serializing_if = "Bindings::is_empty")]
    pub bindings: Bindings,
    /// Template for the trailing overflow line; `{count}` is replaced
    /// with the number of entries that did NOT fit (e.g. `他{count}件`).
    /// Default `+{count}`. Same token convention as `page_number`'s
    /// `format`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overflow_text: Option<String>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

/// An explicit page break (PB1): the next flow item starts on a fresh
/// page. Flow-only (bands/absolute bodies/containers/cells warn+skip);
/// a break at the top of an untouched page is a no-op, so consecutive
/// breaks collapse to one — blank pages are never generated.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PageBreakItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// A page number item; only valid in header/footer bands.
/// `format` supports `{page}` and `{pages}` tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PageNumberItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "box", default, skip_serializing_if = "Option::is_none")]
    pub box_: Option<OptBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

impl PageNumberItem {
    /// Effective format template (default `{page} / {pages}`).
    pub fn format(&self) -> &str {
        self.format.as_deref().unwrap_or("{page} / {pages}")
    }
}

impl ImageItem {
    /// Effective fit mode (default `contain`).
    pub fn fit(&self) -> ImageFit {
        self.fit.unwrap_or_default()
    }
}

impl QrCodeItem {
    /// Effective error-correction level (default `medium`).
    pub fn error_correction(&self) -> EcLevel {
        self.error_correction.unwrap_or_default()
    }
}
