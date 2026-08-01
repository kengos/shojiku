//! Vertical plain-text block building. Columns fill top-to-bottom
//! and lay out right-to-left from the content box's right edge; each
//! [`TextLine`] is a column the renderers draw via `font::arrange_vertical`.
//! The block-level knobs all apply with the axes swapped: `textOverflow`
//! against the box WIDTH (the vertical overflow axis — clip / shrink /
//! ellipsis via [`super::voverflow`]), `verticalAlign` as the CSS-logical
//! column-stack shift, `hangingPunctuation` past the column bottom,
//! `textDecoration` as a side band (underline right — the JLREQ side-line
//! convention), and `textSpacingTrim` in the arrangement itself. Kinsoku
//! (`lineBreak`) shares the horizontal prohibition sets.

use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};
use shojiku_core::{FontWeight, TextAlign, TextOverflow};
use shojiku_diagnostics::{Diagnostic, DiagnosticCode as Code};

use super::super::{Atom, Ctx};
use super::height::content_avail;
use super::vcol::{along_offset, column_left, stack_shift, vertical_decoration_spec};
use super::voverflow::{ellipsize_column, fit_columns_size, measure_columns, VColumn, VWrap};

impl Ctx<'_, '_> {
    /// Builds a vertical text block from a resolved style. `x`/`w` are the
    /// border box; `box_h` is the authored height (the inline extent to
    /// wrap columns against) and `avail_h` the fallback when it is auto
    /// (the containing region height). Lines carry absolute x (column left)
    /// and block-relative y (column top); the caller translates and owns
    /// margins / the box index.
    #[allow(clippy::too_many_arguments)] // border box + auto-height basis + padding
    pub(in crate::engine) fn vertical_text_block(
        &mut self,
        content: &str,
        computed: &ComputedStyle,
        x: f64,
        w: f64,
        box_h: Option<f64>,
        avail_h: f64,
        padding: [f64; 4],
    ) -> Atom {
        let orient = computed.text_orientation;
        let resolved = self.resolved_chain(computed);
        let font_id = resolved.primary.face.id.clone();
        self.warn_missing_glyphs(content, &resolved.faces, &font_id);
        let mut size = self.sane_font_size(computed.font_size);
        let lh_mult = self.sane_line_height(computed.line_height);
        let mut col_width = size * lh_mult;
        let letter_spacing = self.sane_letter_spacing(computed.letter_spacing);
        let combine = computed.text_combine_upright.active();
        let v = VWrap {
            chain: &resolved.faces,
            orient,
            line_break: computed.line_break,
            letter_spacing,
            trim: computed.text_spacing_trim,
            hanging: computed.hanging_punctuation,
            combine,
        };

        // The inline extent columns wrap against: the padded content height
        // (definite box), else the region height minus vertical padding.
        // No usable basis (an auto-height container ancestor gives
        // `avail_h` 0): the column length is unconstrained — one column per
        // paragraph, the CSS auto behavior — never a degenerate
        // one-char-per-column cascade against a zero height.
        let mut max_down = match box_h {
            Some(h) => content_avail(h, padding),
            None => (avail_h - padding[0] - padding[2]).max(0.0),
        };
        if max_down <= 0.0 {
            max_down = f64::INFINITY;
        }
        let mut cols = measure_columns(&v, content, size, max_down);

        // The vertical overflow axis is the WIDTH: columns step left from
        // the content box's right edge, and the policy runs when more
        // columns are needed than fit — the axis-swapped mirror of the
        // horizontal definite-height policies.
        let content_x = x + padding[3];
        let content_w = (w - padding[1] - padding[3]).max(0.0);
        let mut clip = false;
        if cols.len() as f64 * col_width > content_w + 0.01 {
            match computed.text_overflow {
                // In a direct flow region the layouter paginates this
                // overflow at column boundaries instead, so the warning is
                // suppressed there — see `super::paginate`.
                TextOverflow::Visible => {
                    // Suppressed only when pagination can actually take
                    // over: a column width no page can hold even one of
                    // (a hostile-huge font) keeps the warning.
                    if !self.flow_text || col_width > content_w + 0.01 {
                        self.warn_columns_overflow(cols.len(), col_width, content_w);
                    }
                }
                // Keep every column; the block reserves exactly the
                // authored box and the renderers cut at its edge.
                TextOverflow::Clip => clip = true,
                TextOverflow::Shrink => {
                    size = fit_columns_size(&v, content, size, lh_mult, content_w, max_down);
                    col_width = size * lh_mult;
                    cols = measure_columns(&v, content, size, max_down);
                    if cols.len() as f64 * col_width > content_w + 0.01 {
                        self.warn_columns_overflow(cols.len(), col_width, content_w);
                    }
                }
                TextOverflow::Ellipsis => {
                    // `col_width > 0` (both factors sanity-guarded) and
                    // `content_w` is finite, so the cast is bounded.
                    let cap = (content_w / col_width).floor() as usize;
                    if cap == 0 {
                        self.warn_columns_overflow(cols.len(), col_width, content_w);
                    }
                    cols.truncate(cap);
                    if let Some(last) = cols.last_mut() {
                        let clamped = ellipsize_column(
                            &resolved.faces,
                            &last.line.text(),
                            size,
                            orient,
                            v.opts(),
                            max_down,
                        );
                        // The clamped column re-enters as a plain non-hung
                        // column (the `…` is the tail now).
                        *last = measure_plain(&v, clamped, size);
                    }
                }
            }
        }

        let content_h = cols.iter().map(|c| c.align_extent).fold(0.0, f64::max);
        let block_h = box_h.unwrap_or(content_h + padding[0] + padding[2]);
        // Alignment distributes real slack only: an unconstrained basis (∞)
        // has none, so columns sit at the top.
        let max_down_align = if max_down.is_finite() {
            max_down
        } else {
            content_h
        };
        let lines = place_columns(
            &cols,
            &Cols {
                content_x,
                content_w,
                col_width,
                max_down: max_down_align,
                pad_top: padding[0],
                align: computed.text_align,
                // The CSS-logical `verticalAlign` shift of the whole
                // column stack (top→right edge, middle→center,
                // bottom→left edge).
                shift: stack_shift(
                    computed.vertical_align,
                    content_w,
                    cols.len() as f64 * col_width,
                ),
            },
        );

        let block = LayoutItem::Text(TextBlock {
            font_id,
            fallback_ids: resolved.fallback_ids,
            font_size: size,
            line_height: col_width,
            letter_spacing,
            color: self.color_or_black(computed.color.as_deref()),
            synthetic_bold: computed.font_weight == FontWeight::Bold && !resolved.primary.real_bold,
            // Synthetic italic (a horizontal skew) is meaningless once a run
            // is rotated / stacked; not applied in vertical.
            synthetic_italic: false,
            // A side band per column: underline on the RIGHT of the column
            // (the JLREQ side-line convention), line-through on the column axis.
            decoration: vertical_decoration_spec(
                resolved.primary.face,
                computed.text_decoration,
                size,
                col_width,
            ),
            opacity: self.sane_opacity(computed.opacity),
            baseline: None,
            link: None,
            text_spacing_trim: computed.text_spacing_trim,
            vertical: Some(orient),
            text_combine: combine,
            lines,
        });
        // CONTRACT: decoration `Rect`s first, the `Text` block last, `Clip`
        // only under `clip` — `super::paginate::split_parts` destructures
        // this shape (a clipped block never splits).
        let mut items = Vec::with_capacity(2);
        self.push_decoration(&mut items, computed, x, w, block_h);
        if clip {
            items.push(super::super::container::clip_children(
                vec![block],
                x,
                0.0,
                w,
                block_h,
                crate::tree::Corners::default(),
            ));
        } else {
            items.push(block);
        }
        Atom {
            height: block_h,
            items,
            boxes: Vec::new(),
            rb: None,
        }
    }

    /// Warns `horizontal_overflow` for a vertical block needing more
    /// columns than its content width holds (the message every vertical
    /// surface shares).
    pub(super) fn warn_columns_overflow(&mut self, columns: usize, col_width: f64, content_w: f64) {
        self.diags
            .push(Diagnostic::new(Code::HorizontalOverflow).arg(
                "detail",
                format!(
                    "vertical text needs {columns} columns ({:.1}pt) but the box is {content_w:.1}pt wide",
                    columns as f64 * col_width,
                ),
            ));
    }
}

/// Re-measures one already-clamped column as a plain (non-hung) column.
fn measure_plain(v: &VWrap, text: String, size: f64) -> VColumn {
    let extent = super::vcol::column_extent(v.chain, &text, size, v.orient, v.opts());
    VColumn {
        line: crate::wrap::WrappedLine::plain(text),
        extent,
        align_extent: extent,
    }
}

/// Column-placement geometry shared by [`place_columns`].
struct Cols {
    content_x: f64,
    content_w: f64,
    col_width: f64,
    max_down: f64,
    pad_top: f64,
    align: TextAlign,
    shift: f64,
}

/// Places each measured column into a [`TextLine`]: absolute left x
/// (columns step left from the right edge, shifted left as a stack by the
/// logical `verticalAlign`), block-relative top y (the `textAlign` map
/// along the column against the hung-exclusion basis), and `width` = the
/// column's INKED down-extent (hung char included; the cross-axis column
/// width rides `TextBlock::line_height`), so link annotations, decoration
/// bands, and overlays get the real occupied rect without re-measuring.
fn place_columns(cols: &[VColumn], g: &Cols) -> Vec<TextLine> {
    cols.iter()
        .enumerate()
        .map(|(i, c)| TextLine {
            text: c.line.text(),
            x: column_left(g.content_x, g.content_w, g.col_width, i) - g.shift,
            y: g.pad_top + along_offset(g.align, g.max_down, c.align_extent),
            width: c.extent,
            runs: Vec::new(),
        })
        .collect()
}
