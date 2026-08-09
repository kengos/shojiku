//! `type: char_grid` — fixed character cells: genkoyoshi / kanji workbooks /
//! application-form box grids. One character per cell; the engine assigns cells
//! (kinsoku hang-back included), so params stay verbatim strings.

use serde::{Deserialize, Serialize};

use super::binding::{Binding, Bindings};
use super::visibility::VisibleBinding;
use crate::geometry::OptBox;
use crate::length::Length;
use crate::style::{Style, WritingMode};

/// Cap on cells per grid chunk (`charsPerLine × lines`): bounds per-page
/// layout work and tree fan-out from untrusted grid dimensions. (A B4
/// 400-cell sheet is 400 cells; this leaves generous headroom.)
pub const MAX_CHAR_GRID_CELLS: usize = 4096;

/// A character-grid item. Content comes from `text` (static, with
/// `{key}` interpolation) or `data` (single bound value) — like a text
/// item; each character occupies one cell. Ruby (furigana) is opt-in via
/// `markup: aozora` (`|base《ruby》`); without it every string renders
/// verbatim, markup characters included.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CharGridItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// Params-conditional presence; unset draws unconditionally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<VisibleBinding>,
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
    pub grid: CharGridSpec,
    /// Line direction (shared vocabulary with the future `writingMode`
    /// style property): `horizontal_tb` (default) or `vertical_rl`
    /// (columns right→left, the genkoyoshi default in print).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    writing_mode: Option<WritingMode>,
    /// Line-break prohibition rule set (default `school`): trailing
    /// punctuation hangs back into the previous line's last cell and
    /// opening brackets never end a line. `none` fills strictly in order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kinsoku: Option<KinsokuMode>,
    /// Opt-in content markup. Without it (the default) content renders
    /// verbatim — bound params are never interpreted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    markup: Option<Markup>,
    /// Ruby (furigana) font size; default 0.4 × the cell size, shrunk
    /// further when a reading is longer than its base run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ruby_size: Option<Length>,
    #[serde(rename = "styleNames", default, skip_serializing_if = "Vec::is_empty")]
    pub style_names: Vec<String>,
    #[serde(default, skip_serializing_if = "Style::is_empty")]
    pub style: Style,
}

impl CharGridItem {
    /// Effective writing mode (default horizontal).
    pub fn writing_mode(&self) -> WritingMode {
        self.writing_mode.unwrap_or_default()
    }

    /// Effective kinsoku rule set (default `school`).
    pub fn kinsoku(&self) -> KinsokuMode {
        self.kinsoku.unwrap_or_default()
    }

    /// Authored content markup; `None` = verbatim.
    pub fn markup(&self) -> Option<Markup> {
        self.markup
    }
}

/// The cell grid: `charsPerLine` cells along each line, `lines` lines
/// per sheet (a full sheet repeats onto following pages in a flow body).
/// Dimensions are writing-mode-relative — a vertical 200-cell genkoyoshi
/// is `charsPerLine: 20, lines: 10` regardless of direction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CharGridSpec {
    /// Cells per line. Clamped to at least 1 and at most
    /// [`MAX_CHAR_GRID_CELLS`] at layout.
    pub chars_per_line: usize,
    /// Lines per sheet. Clamped so `charsPerLine × lines` stays
    /// within [`MAX_CHAR_GRID_CELLS`] at layout.
    pub lines: usize,
    /// Cell side length (cells are square). Omitted: derived from the
    /// available width — horizontal divides it by `charsPerLine`,
    /// vertical by `lines`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell_size: Option<Length>,
    /// Gap between lines (the ruby margin on a genkoyoshi); default 0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_gap: Option<Length>,
    /// Gap between cells along a line; default 0.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_gap: Option<Length>,
}

/// Kinsoku (line-break prohibition) rule sets for cell assignment.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum KinsokuMode {
    /// The school-education rule: trailing punctuation (`。、` etc.) hangs back into
    /// the previous line's last cell; opening brackets never end a line.
    /// Small kana may start a line (the elementary-school convention).
    #[default]
    School,
    /// No prohibition: strictly sequential fill.
    None,
}

/// Content markup grammars (opt-in; `None` = verbatim).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum Markup {
    /// Aozora Bunko ruby notation: `《reading》` annotates the preceding kanji
    /// run; `|` marks an explicit base start (`|昨日《きのう》`).
    Aozora,
}
