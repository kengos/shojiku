//! Vertical list building: each array entry is one COLUMN, laid
//! right-to-left (the first entry rightmost). `box.w` bounds how many
//! columns fit — excess entries collapse into a leftmost `+{count}`
//! overflow column, mirroring how the horizontal list reserves a line;
//! a definite `box.h` bounds each column's down-extent, clamping an
//! over-long entry with a trailing `…` (the shared down-clamp in
//! `engine::text::vcol`). `textAlign` distributes a short column along
//! its length (left→top, center, right→bottom); `textDecoration` draws a
//! side band per column like the horizontal list's per-line rect. The
//! knob surface mirrors the horizontal list exactly — entries never trim
//! (`RunOptions::spacing_only`), and the list's own overflow model
//! replaces `textOverflow`.

use crate::font::RunOptions;
use crate::style::ComputedStyle;
use crate::tree::{LayoutItem, TextBlock, TextLine};
use serde_json::Value;
use shojiku_core::{FontWeight, ListItem, TextSpacingTrim};
use shojiku_layout_box::ResolvedBox;

use super::super::text::{
    along_offset, clamp_column_down, column_extent, column_left, vertical_decoration_spec,
};
use super::super::{placed_box, with_vertical_margin, Atom, Ctx};
use super::MAX_LIST_ENTRIES;

impl Ctx<'_, '_> {
    /// Builds a vertical list atom from the resolved box and entries (the
    /// shared array/scope resolution stays in `list_atom`). Entries become
    /// right-to-left columns; the box-width column cap and the definite-`h`
    /// per-column down-clamp mirror the horizontal list's line cap and
    /// per-entry width clamp with the axes swapped.
    pub(super) fn vertical_list_atom(
        &mut self,
        list: &ListItem,
        rb: ResolvedBox,
        w: f64,
        entries: Vec<Value>,
        computed: &ComputedStyle,
    ) -> Atom {
        let orient = computed.text_orientation;
        let resolved = self.resolved_chain(computed);
        let font_id = resolved.primary.face.id.clone();
        let size = self.sane_font_size(computed.font_size);
        let col_width = size * self.sane_line_height(computed.line_height);
        let letter_spacing = self.sane_letter_spacing(computed.letter_spacing);
        let content_x = rb.content_x();
        let content_w = rb.content_w(w);

        // How many columns fit the box width — reserving one for the
        // overflow column when entries are cut, like the horizontal line cap.
        // `col_width` is `size × lineHeight`, both sanity-clamped positive,
        // so the division is always well-defined; a hostile-huge size makes
        // `n_fit` 0 (every entry overflows), never a panic.
        let total = entries.len();
        let n_fit = (content_w / col_width).floor() as usize;
        let kept = if total <= n_fit {
            total
        } else {
            n_fit.saturating_sub(1)
        }
        .min(MAX_LIST_ENTRIES);
        let cut = total - kept;

        let key = &list.data.key;
        let mut texts: Vec<String> = Vec::with_capacity(kept + 1);
        for (index, entry) in entries.iter().take(kept).enumerate() {
            texts.push(self.entry_text(list, entry, (key, index)));
        }
        if cut > 0 {
            let template = list.overflow_text.as_deref().unwrap_or("+{count}");
            texts.push(template.replace("{count}", &cut.to_string()));
        }

        // A definite h clamps each column's down-extent (per-entry `…`);
        // auto height grows to the longest column.
        // List entries never trim, matching the horizontal list's shaping
        // options; tate-chu-yoko (`textCombineUpright`) applies per entry column.
        let combine = computed.text_combine_upright.active();
        let opts = RunOptions {
            combine,
            ..RunOptions::spacing_only(letter_spacing)
        };
        let avail_down = rb.h.map(|h| rb.content_h(h).max(0.0));
        let texts: Vec<String> = texts
            .into_iter()
            .map(|t| match avail_down {
                Some(max_down) => {
                    clamp_column_down(&resolved.faces, &t, size, orient, opts, max_down)
                }
                None => t,
            })
            .collect();

        let extents: Vec<f64> = texts
            .iter()
            .map(|t| column_extent(&resolved.faces, t, size, orient, opts))
            .collect();
        let content_h = extents.iter().copied().fold(0.0, f64::max);
        let max_down_align = avail_down.unwrap_or(content_h);
        let height = rb.h.unwrap_or(content_h + rb.v_padding());

        let lines: Vec<TextLine> = texts
            .iter()
            .zip(&extents)
            .enumerate()
            .map(|(i, (text, &extent))| TextLine {
                text: text.clone(),
                x: column_left(content_x, content_w, col_width, i),
                y: rb.padding[0] + along_offset(computed.text_align, max_down_align, extent),
                width: extent,
                runs: Vec::new(),
            })
            .collect();

        let synthetic_bold =
            computed.font_weight == FontWeight::Bold && !resolved.primary.real_bold;
        let mut items = Vec::with_capacity(2);
        self.push_decoration(&mut items, computed, rb.x, w, height);
        items.push(LayoutItem::Text(TextBlock {
            font_id,
            fallback_ids: resolved.fallback_ids,
            font_size: size,
            line_height: col_width,
            letter_spacing,
            color: self.color_or_black(computed.color.as_deref()),
            synthetic_bold,
            synthetic_italic: false,
            // F2 decoration as a per-column side band, resolved like the
            // horizontal list resolves its per-line rect.
            decoration: vertical_decoration_spec(
                resolved.primary.face,
                computed.text_decoration,
                size,
                col_width,
            ),
            opacity: self.sane_opacity(computed.opacity),
            baseline: None,
            link: None,
            text_spacing_trim: TextSpacingTrim::SpaceAll,
            vertical: Some(orient),
            text_combine: combine,
            lines,
        }));
        let boxes = vec![placed_box(
            &self.current_path(),
            list.id.as_deref(),
            &rb,
            w,
            height,
        )];
        with_vertical_margin(
            Atom {
                height,
                items,
                boxes,
                rb: Some(rb),
            },
            rb.margin[0],
            rb.margin[2],
        )
    }
}
