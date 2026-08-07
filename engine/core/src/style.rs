//! Painting core — the appearance property bag.
//!
//! The inherited half of the template model, CSS-style: a [`Style`] is a
//! bag of *optional* properties where **unset means inherit** (or fall back
//! to the engine default). The same `Style` serves both an item's inline
//! `style:` and a named entry in the template's `styles:` registry. Because
//! every field is `Option` and skipped when unset, serialization preserves
//! exactly what the author wrote — no injected defaults, round-trippable.
//!
//! Which properties inherit is decided at layout time
//! (`shojiku_layout::style`); this module only models the wire form. The
//! keyword enums live in `style/enums.rs` and the non-cascading shape
//! styles in `style/shapes.rs`, both re-exported here so
//! `shojiku_core::TextAlign`-style paths stay stable.

use crate::length::Length;
use serde::{Deserialize, Serialize};

mod border;
#[cfg(test)]
mod decoration_tests;
mod enums;
mod inert;
#[cfg(test)]
mod inert_tests;
#[cfg(test)]
mod length_tests;
#[cfg(test)]
mod line_break_tests;
#[cfg(test)]
mod micro_typography_tests;
mod shapes;
#[cfg(test)]
mod tests;
mod writing;
#[cfg(test)]
mod writing_combine_tests;
#[cfg(test)]
mod writing_tests;

pub use border::{BorderColor, BorderStyle, BorderStyleKind, BorderWidth};
pub use enums::{
    FontStyle, FontWeight, HangingPunctuation, LineBreak, Overflow, TextAlign, TextDecoration,
    TextOverflow, TextSpacingTrim, VerticalAlign,
};
pub use shapes::{LineStyle, DEFAULT_STROKE_PT};
pub use writing::{TextCombine, TextCombineUpright, TextOrientation, WritingMode};

/// A bag of optional appearance properties. Every field unset (`None`)
/// means "inherit from the enclosing container, else the engine default".
/// Used both as an item's inline `style:` and as a named entry in the
/// template's `styles:` registry.
///
/// Adding a field here is a FIVE-place change, and only this one is
/// compiler-checked: ② `ComputedStyle` in `shojiku-layout`'s `style.rs`
/// (+ its ③ `base` — the inherit-or-not decision — and ④ `overlaid`),
/// and ⑤ a capability key in `engine/authoring/src/capabilities/` (the GUI
/// gates syntax on it; nothing references it from here, so a missed key
/// only surfaces in e2e). If spans (or shapes) must NOT honor the
/// new key, also list it in `style/inert.rs`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Style {
    /// Font size: a bare number is pt; strings take the [`Length`] units —
    /// `pt`/`mm`/`cm`/`in` (absolute), `em`/`%` (of the *inherited* font
    /// size, so nested relative sizes multiply), `rem` (of the engine
    /// default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<Length>,
    /// Font face id from the lang pack; unset uses the pack's default face.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    /// Line height as a multiplier of font size.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    /// Text color as `#rrggbb`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Horizontal text alignment (CSS `text-align`). Inherited.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    /// Vertical alignment within the box (CSS-ish `vertical-align`). Not
    /// inherited — a container never passes it to children.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<VerticalAlign>,
    /// Line-break / kinsoku behavior (CSS `line-break`). Inherited through
    /// the container tree; unset falls back to the engine default
    /// ([`LineBreak::Normal`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_break: Option<LineBreak>,
    /// Fullwidth-punctuation spacing (CSS `text-spacing-trim`
    /// subset). Inherited. Unset falls back to the engine default
    /// ([`TextSpacingTrim::SpaceAll`] — no trimming, so existing templates
    /// are unaffected). Block-level: a rich-text span does not honor it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_spacing_trim: Option<TextSpacingTrim>,
    /// Hanging punctuation (CSS `hanging-punctuation` subset).
    /// Inherited. Unset falls back to the engine default
    /// ([`HangingPunctuation::None`]). Block-level: a rich-text span does
    /// not honor it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hanging_punctuation: Option<HangingPunctuation>,
    /// Fill color as `#rrggbb` (CSS `background-color`), drawn behind the
    /// item as a filled rectangle covering its border box — text, page
    /// number, table cells, containers, repeat cells, and images alike (no
    /// renderer support needed). Not inherited.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    /// Border stroke width in pt (CSS `border-width`): a bare number is
    /// all four sides, a `{ top/right/bottom/left }` map is per side
    /// (unset side = 0). Not inherited. A side is drawn over the
    /// item's border box iff its computed width is > 0 — `borderColor`
    /// alone draws nothing, so a named style can carry a palette color
    /// that items opt into with a width (`rect` follows this rule too;
    /// the form marks default their frame to 1pt when no layer authors a
    /// width). On a `table`, the scalar form strokes the whole grid (the
    /// scalar behavior) while the map form draws the OUTER frame only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<BorderWidth>,
    /// Border stroke color as `#rrggbb` (CSS `border-color`), scalar or
    /// per-side map; an unset side draws black. Not inherited.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<BorderColor>,
    /// Border line style (CSS `border-style` subset): `solid`
    /// (default) | `double`, scalar or per-side map. `double` splits the
    /// side's width into two lines of a third each. Not inherited.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_style: Option<BorderStyle>,
    /// Corner rounding of the border box (CSS `border-radius`, single
    /// value — no per-corner form). Not inherited. A bare number is pt;
    /// strings take the [`Length`] units, and `%` resolves CSS-style
    /// against BOTH axes independently (horizontal radius = % of the
    /// border-box width, vertical = % of its height), so `50%` on a
    /// square is a circle and on an oblong a pill. Honored on a box whose
    /// border is uniform (one width, one color, and a `solid`/`dashed`/
    /// `dotted` style) and on its `backgroundColor` fill; a per-side or
    /// `double` border, a `table`, or a form mark warns
    /// `border_radius_ignored` and draws square corners. `overflow:
    /// hidden` clips to the rounded box.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<Length>,
    /// What to do when text exceeds a definite `box.h` (CSS-adjacent
    /// `text-overflow`). Not inherited. Only acts when the box has a
    /// definite height — auto-height boxes grow to fit instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_overflow: Option<TextOverflow>,
    /// Font weight (CSS `font-weight`), keyword subset. Inherited. `bold`
    /// selects the family's real bold face when the pack ships one
    /// (declaration-order variant selection at layout); otherwise it
    /// degrades to synthetic emboldening (advances unchanged).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeight>,
    /// Font slant (CSS `font-style`), keyword subset. Inherited. `italic`
    /// selects a real italic face when the pack ships one; otherwise it
    /// degrades to a synthetic baseline-anchored skew.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_style: Option<FontStyle>,
    /// Extra advance added after every character (CSS `letter-spacing`):
    /// a bare number is pt; strings take `pt`/`mm`/`cm`/`in` or `em`/`rem`
    /// (`em` = the item's own computed font size). `%` is rejected at
    /// parse — CSS letter-spacing has no percentage form. Inherited;
    /// negative tightens.
    #[serde(
        default,
        deserialize_with = "spacing_length",
        skip_serializing_if = "Option::is_none"
    )]
    pub letter_spacing: Option<Length>,
    /// What a box does with content outside its border box (CSS
    /// `overflow`). Not inherited. Honored on container-like boxes
    /// (`container`, `repeat` cells, `repeat_flow` cards): `hidden`
    /// clips children to the border box and suppresses the overflow
    /// warning. Text items use `textOverflow: clip` instead.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overflow: Option<Overflow>,
    /// Decoration line on text (CSS `text-decoration-line` keyword
    /// subset): `underline` | `line_through` | `none`. Not inherited
    /// (matches CSS). Position and thickness come from the font's own
    /// metrics at layout time; the line is drawn in the text color and
    /// follows shrink/ellipsis/clip like the glyphs do.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<TextDecoration>,
    /// Paint alpha `0..=1`: applies to the item's own painting —
    /// text glyphs + decoration, `backgroundColor` fill, and the border
    /// stroke alike. Not inherited (unlike CSS `opacity` it is per-item
    /// paint alpha, not group compositing — nested items don't multiply).
    /// Out-of-range values are clamped with a warning at layout time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    /// Line direction (CSS `writing-mode` subset). Inherited. Unset falls
    /// back to [`WritingMode::HorizontalTb`]. `vertical_rl` turns a text
    /// item into a vertical block — honored on every text
    /// surface (plain text, rich `spans`, `list`, table text cells,
    /// `page_number`); a text `mark:` is the one warned fallback
    /// (`vertical_text_unsupported`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub writing_mode: Option<WritingMode>,
    /// Character orientation within a vertical line (CSS `text-orientation`
    /// subset). Inherited. Unset falls back to [`TextOrientation::Mixed`].
    /// Only consulted when the effective writing mode is vertical.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_orientation: Option<TextOrientation>,
    /// tate-chu-yoko (CSS `text-combine-upright` subset): `none` or
    /// `{ digits: N }` — runs of up to N consecutive ASCII digits share
    /// one upright cell of a vertical line (text blocks and `char_grid`
    /// cells alike). Inherited. Inert in horizontal text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_combine_upright: Option<TextCombineUpright>,
}

/// Deserializes `letterSpacing`, rejecting the `%` form: CSS
/// letter-spacing has no percentage, and a parse error beats silently
/// misresolving what the author meant. Only invoked when the key is
/// present (serde `default` covers the unset case).
fn spacing_length<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Length>, D::Error> {
    let len = Length::deserialize(d)?;
    if matches!(len, Length::Percent(_)) {
        return Err(serde::de::Error::custom(
            "letterSpacing does not take `%`; use pt, mm/cm/in, or em/rem",
        ));
    }
    Ok(Some(len))
}

impl Style {
    /// Whether every property is unset — used to skip an empty `style:` on
    /// serialization so round-tripped templates stay as the author wrote
    /// them.
    pub fn is_empty(&self) -> bool {
        *self == Style::default()
    }
}

/// Maximum entries in a template's `styles:` registry, and maximum
/// `styleNames:` a single item may list. Templates are untrusted; named-
/// style resolution is O(styleNames × registry) per item, so both are
/// bounded (mirroring [`crate::template::MAX_CONTAINER_DEPTH`]). Styles are
/// flat — a style cannot reference another — so there are no cascade cycles
/// to guard, only fan-out. Exceeding either is a warning (extra entries are
/// ignored), not an error: rendering still proceeds.
pub const MAX_STYLES: usize = 256;

/// See [`MAX_STYLES`].
pub const MAX_STYLE_NAMES: usize = 16;

/// The engine's initial `lineHeight` (a multiplier of `fontSize`). One
/// definition, because layout uses it in two places that must agree: the
/// cascade's initial value, and the fallback its sanity guard degrades a
/// hostile multiplier to — the guard names that fallback in the warning it
/// emits, so a drift between the two would make the diagnostic lie.
pub const DEFAULT_LINE_HEIGHT: f64 = 1.4;
