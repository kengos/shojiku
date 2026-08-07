//! The keyword enums of the style system: line breaking, font variants,
//! overflow policies, alignment, text decoration, and the JP
//! micro-typography knobs (spacing trim, hanging punctuation). Split from
//! the module root so [`super::Style`] has room to grow; re-exported
//! there, so `shojiku_core::TextAlign`-style paths stay stable.

use serde::{Deserialize, Serialize};

/// How lines may break, mirroring a subset of the CSS `line-break`
/// property. Inherited through the container tree; the engine default is
/// [`LineBreak::Normal`], which matches CSS. `normal`/`strict`/`loose`
/// differ only in which characters are prohibited at a line start —
/// prohibited line-end characters (opening brackets) and the CJK
/// break-anywhere behavior are the same across all three; `anywhere`
/// alone drops kinsoku entirely. The prohibition sets live in one place
/// (`shojiku-layout` `wrap::kinsoku`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum LineBreak {
    /// Kinsoku with the common Japanese line-start prohibitions (closing
    /// brackets, commas/full stops, centered punctuation `・：；！？`,
    /// inseparables `‥…`, iteration marks), but small kana (`っ`,
    /// `ゃ` …), the prolonged-sound mark (`ー`), and `〜` **may** start a
    /// line. Matches CSS `line-break: normal`.
    #[default]
    Normal,
    /// The most restrictive kinsoku: everything `normal` prohibits, plus
    /// small kana, `ー`, and the CJK hyphens `〜゠` held off a line
    /// start. Matches CSS `line-break: strict`. Authors who relied on
    /// the pre-`strict` behavior (when `normal` also held small kana
    /// back) set this.
    Strict,
    /// The most permissive kinsoku: only closing brackets and
    /// commas/full stops (`、。，．`) are held off a line start;
    /// centered punctuation (`・：；！？`), inseparables (`‥…`),
    /// iteration marks, small kana, and `ー` may all start a line.
    /// Matches CSS `line-break: loose`.
    Loose,
    /// Break between any two characters, ignoring kinsoku. Matches CSS
    /// `line-break: anywhere`.
    Anywhere,
}

/// Fullwidth-punctuation spacing (half-width punctuation), mirroring a subset of the CSS
/// `text-spacing-trim` property. Inherited through the container tree.
/// Unlike CSS — whose initial value is `normal` — the engine default is
/// [`TextSpacingTrim::SpaceAll`] (every fullwidth punctuation keeps its
/// full em advance), so templates authored before this property existed
/// render byte-for-byte unchanged; authors opt into trimming explicitly.
/// The trim is applied as a deterministic post-shaping advance adjustment
/// (no bundled face carries the OpenType `chws` feature), not by riding a
/// font feature.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum TextSpacingTrim {
    /// Every fullwidth punctuation glyph keeps its full advance — no
    /// trimming. The engine default (matches every template authored
    /// before this property existed). CSS `space-all`.
    #[default]
    SpaceAll,
    /// NOT the engine default (`space_all` is) — despite the name, this
    /// variant ENABLES trimming; the CSS initial-value name is kept for
    /// wire familiarity only. Trims the gap between two adjacent
    /// fullwidth punctuation glyphs (e.g. `」「`, `、」`) to half-width,
    /// per JLREQ. Interior only — a punctuation at a line start or end
    /// keeps its full advance. CSS `normal`.
    Normal,
    /// Everything `normal` trims, and additionally a fullwidth opening
    /// bracket at the very start of a line is trimmed to half-width (the
    /// line-head punctuation case), pulling the following text toward the margin.
    /// CSS `trim-start`.
    TrimStart,
}

/// Whether line-terminating commas and full stops may hang into the end
/// margin (hanging punctuation), mirroring a subset of the CSS `hanging-punctuation`
/// property. Inherited. The engine default is [`HangingPunctuation::None`]
/// (no hanging), matching the CSS initial value. Only the comma / full-stop
/// class (`、。，．｡､`) hangs; a hung glyph's advance is counted in the
/// line's inked width (so an overlay measures it) but excluded from
/// alignment, so the glyph sits past the alignment edge.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum HangingPunctuation {
    /// No hanging — a line-terminating comma or full stop wraps or is
    /// pushed down by kinsoku like any other character. The engine
    /// default. CSS `none`.
    #[default]
    None,
    /// A comma or full stop that would otherwise wrap to the next line (or
    /// be pushed down by kinsoku push-out) instead hangs past the line's
    /// end edge, keeping the line count down. CSS `allow-end`.
    AllowEnd,
    /// Like `allow_end`, and additionally a comma or full stop that
    /// already fits at a line end is still excluded from the alignment
    /// width, so it hangs into the margin under center / right alignment.
    /// CSS `force-end`.
    ForceEnd,
}

/// Font weight (CSS `font-weight`), keyword subset. `normal` | `bold`;
/// numeric weights (100–900) are a possible future extension.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum FontWeight {
    #[default]
    Normal,
    Bold,
}

/// Font slant (CSS `font-style`), keyword subset. `normal` | `italic`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum FontStyle {
    #[default]
    Normal,
    Italic,
}

/// Text decoration line (CSS `text-decoration-line`, keyword subset).
/// Not inherited (matches CSS — note CSS *propagates* decoration to
/// descendants instead, which this engine does not model yet). `none`
/// exists so an inline style can switch a named style's decoration off.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum TextDecoration {
    /// No decoration line — the engine default, and the explicit "turn a
    /// named style's decoration off" value.
    #[default]
    None,
    /// A line under the text (below the baseline, per font metrics).
    Underline,
    /// A line through the middle of the text (strikeout, per font
    /// metrics).
    LineThrough,
}

/// What a box does with content outside its border box (CSS `overflow`
/// keyword subset). Not inherited.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum Overflow {
    /// Content draws past the box, with an overflow warning. The engine
    /// default (matches every template authored before `overflow` existed).
    #[default]
    Visible,
    /// Children are clipped to the border box (the layout tree gains a
    /// clip node both renderers honor); the overflow warning is
    /// suppressed — the author opted in.
    Hidden,
}

/// Overflow policy for text in a definite-height box.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum TextOverflow {
    /// Draw everything and warn (`text_overflow`); the reserved block
    /// grows past the authored height. The engine default.
    #[default]
    Visible,
    /// Shrink the font size (lineHeight scales with it) until the
    /// wrapped text fits the content box, bounded by a 4pt floor.
    /// Thinreports `fit`.
    Shrink,
    /// Clamp to the lines that fit and end the last one with `…`,
    /// measured with the same face/size/letterSpacing as the text.
    /// Thinreports `truncate`.
    Ellipsis,
    /// Cut the drawn text at the box edge (CSS `text-overflow: clip`
    /// under `overflow: hidden`): the block reserves exactly the
    /// authored height, all lines are kept, and the renderers clip them
    /// to the border box — a partially visible line is cut, not
    /// clamped. Suppresses the `text_overflow` warning.
    Clip,
}

/// Horizontal text alignment (CSS `text-align`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum TextAlign {
    #[default]
    Left,
    Center,
    Right,
}

/// Vertical alignment within an item's box.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum VerticalAlign {
    #[default]
    Top,
    Middle,
    Bottom,
}
