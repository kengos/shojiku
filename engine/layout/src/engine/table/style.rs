//! Table style resolution: the authored grid border (with the table's
//! 0.5pt default), the zebra row cascade, and the authored-or-default
//! folds for the non-inherited properties whose table defaults differ
//! from the engine initial values.

mod conditional;

use crate::style::ComputedStyle;
use serde_json::Value;
use shojiku_core::{
    BorderStyleKind, BorderWidth, RowSpec, Style, TableItem, VerticalAlign, MAX_STYLE_NAMES,
};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::decoration::SideBorders;
use super::super::Ctx;
use super::{GridBorder, TABLE_BORDER_WIDTH};

/// Folds one optional property over an item's style layers (named styles
/// in listed order, then inline) — `None` when no layer set it, so table
/// defaults apply only to genuinely unset properties. The engine cascade
/// cannot answer that ("resolved to the initial value" and "unset" look
/// alike), hence this parallel fold for the two table-defaulted knobs.
fn authored<T: Clone>(
    ctx: &Ctx,
    names: &[String],
    inline: &Style,
    pick: fn(&Style) -> Option<T>,
) -> Option<T> {
    let mut value = None;
    for name in names.iter().take(MAX_STYLE_NAMES) {
        if let Some(style) = ctx.input.template.styles.get(name) {
            if let Some(v) = pick(style) {
                value = Some(v);
            }
        }
    }
    pick(inline).or(value)
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// The grid stroke (row outlines + column separators) and, with the
    /// per-side map form, the table's outer frame. The scalar
    /// `borderWidth` keeps its scalar meaning — the whole grid, default
    /// 0.5pt, `0` removes it. The map form leaves the inner grid at the
    /// default and draws the outer frame per side instead;
    /// `borderColor`/`borderStyle` sides apply to that frame (the inner
    /// grid takes the uniform color and stays solid).
    pub(super) fn grid_border(&mut self, table: &TableItem) -> GridBorder {
        let authored_width = authored(self, &table.style_names, &table.style, |s| {
            s.border_width.clone()
        });
        let color = authored(self, &table.style_names, &table.style, |s| {
            s.border_color.clone()
        });
        let style = authored(self, &table.style_names, &table.style, |s| {
            s.border_style.clone()
        });
        // A table's frame is one edge of a ruled grid, so rounding it
        // would leave the inner ruling meeting a curve at the corners.
        if authored(self, &table.style_names, &table.style, |s| s.border_radius).is_some() {
            self.diags
                .push(Diagnostic::new(Code::BorderRadiusIgnored).arg("context", "a table"));
        }
        let color_sides = color.as_ref().map(shojiku_core::BorderColor::sides);
        let grid_color = color_sides
            .as_ref()
            .and_then(|s| s.iter().all(|c| *c == s[0]).then(|| s[0].clone()))
            .flatten();
        let (width, outer) = match authored_width {
            None => (TABLE_BORDER_WIDTH, None),
            Some(BorderWidth::All(w)) => (w, None),
            Some(per_side @ BorderWidth::PerSide(_)) => {
                let widths = per_side.sides().map(|w| self.sane_border_width(w));
                let color_sides = color_sides.clone().unwrap_or_default();
                let colors = [0, 1, 2, 3].map(|i| self.color_or_black(color_sides[i].as_deref()));
                let styles = style.as_ref().map_or(
                    [BorderStyleKind::Solid; 4],
                    shojiku_core::BorderStyle::sides,
                );
                (
                    TABLE_BORDER_WIDTH,
                    Some(SideBorders {
                        widths,
                        colors,
                        styles,
                    }),
                )
            }
        };
        GridBorder {
            width: self.sane_border_width(width),
            color: self.color_or_black(grid_color.as_deref()),
            outer,
        }
    }

    /// One table layer's AUTHORED `verticalAlign` — its named styles in
    /// listed order, then inline — or `None` when it set none, so the next
    /// layer out can supply it.
    pub(super) fn valign_of(&self, names: &[String], inline: &Style) -> Option<VerticalAlign> {
        authored(self, names, inline, |s| s.vertical_align)
    }

    /// A cell's vertical alignment: its own layers win, then the first
    /// outer layer that authored one (`outer`, innermost first — a body
    /// cell's row then table, a label's header row then table, a group's
    /// table), and only when none did, the table default of centering.
    /// `verticalAlign` is not inherited anywhere else in the engine; a
    /// table carries it down its own layers because a cell has no box of
    /// its own to author it on.
    pub(super) fn cell_valign(
        &self,
        (names, inline): (&[String], &Style),
        outer: &[Option<VerticalAlign>],
    ) -> VerticalAlign {
        self.valign_of(names, inline)
            .or_else(|| outer.iter().find_map(|v| *v))
            .unwrap_or(VerticalAlign::Middle)
    }

    /// The body-row style: `row.style`/`styleNames` over the inherited
    /// (table) context, with `alternateStyle`/`alternateStyleNames`
    /// overlaid on the even rows (zebra), and finally every
    /// `conditionalStyles` entry this row's own element matches (see
    /// [`conditional`]) — so a data-driven layer always wins over the
    /// positional zebra one. Its `backgroundColor`/border decorate the
    /// row band; its inherited properties cascade into the row's cells.
    ///
    /// Also returns the row's authored `verticalAlign` over the same layers
    /// (later wins, so a matching rule beats the zebra and the band): the
    /// computed value cannot say whether anyone authored it, and a body
    /// cell falls back to it before the table's.
    pub(super) fn resolve_row_style(
        &mut self,
        spec: &RowSpec,
        alternate: bool,
        row: &Value,
    ) -> (ComputedStyle, Option<VerticalAlign>) {
        let mut computed = self.resolve_style(&spec.style_names, &spec.style);
        let mut valign = self.valign_of(&spec.style_names, &spec.style);
        if alternate {
            for name in spec.alternate_style_names.iter().take(MAX_STYLE_NAMES) {
                if let Some(style) = self.input.template.styles.get(name) {
                    computed = computed.overlaid(style);
                }
            }
            computed = computed.overlaid(&spec.alternate_style);
            valign = self
                .valign_of(&spec.alternate_style_names, &spec.alternate_style)
                .or(valign);
        }
        self.apply_row_conditions(spec, row, (computed, valign))
    }
}
