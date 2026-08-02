//! The assembly tail every text-block builder shares — decoration under
//! the block, the `textOverflow: clip` wrapper around it — and the split
//! channel it fills.
//!
//! ONE home for what was four hand-copied copies (plain/rich × horizontal/
//! vertical), each carrying its own comment describing the item shape the
//! paginator then re-derived by walking those items. The paginator now
//! reads [`SplitChrome`] instead: the decoration as replayable paint plus
//! the slack `verticalAlign` distributed, both known exactly here and
//! guessable nowhere else.

use crate::style::ComputedStyle;
use crate::tree::{Corners, LayoutItem};

use super::super::decoration::DecorationPaint;
use super::super::Ctx;

/// What a paginating fragment needs to rebuild its slice of a text block's
/// box. `Default` (no decoration, no slack) is the resting state of the
/// channel and the answer for every block that never splits — so the
/// paginator has no "channel missing" case to handle.
#[derive(Default)]
pub(in crate::engine) struct SplitChrome {
    /// The block's decoration, replayable at a fragment's own height.
    pub(in crate::engine) paint: Option<DecorationPaint>,
    /// Reserved height sitting ABOVE the content (a `minHeight` taller
    /// than the text, distributed by `verticalAlign`), which the FIRST
    /// fragment carries as extra lead.
    pub(in crate::engine) slack_top: f64,
    /// Reserved height sitting BELOW the content, which the LAST fragment
    /// carries as extra tail.
    pub(in crate::engine) slack_bottom: f64,
}

/// A block's border box and whether it clips, bundled so the assembly
/// call stays flat.
pub(in crate::engine) struct BlockGeom {
    pub x: f64,
    pub w: f64,
    pub h: f64,
    pub clip: bool,
}

impl<'a, 'b> Ctx<'a, 'b> {
    /// Wraps a finished text block in its box: decoration underneath
    /// (CSS paints backgrounds under the border, both under the text),
    /// the `Clip` node around the text alone under `textOverflow: clip`
    /// (the decoration IS the box and stays outside it).
    ///
    /// `slack` is `(above, below)` the content — zero for every vertical
    /// block, whose overflow axis is the width, so its column fragments
    /// keep the whole box height and have no slack to place.
    pub(in crate::engine) fn assemble_block(
        &mut self,
        block: LayoutItem,
        computed: &ComputedStyle,
        geom: BlockGeom,
        slack: (f64, f64),
    ) -> Vec<LayoutItem> {
        let (paint, _) = self.decoration_paint(computed, geom.x, geom.w, geom.h);
        let mut items = Vec::with_capacity(2);
        if let Some(paint) = &paint {
            paint.emit(&mut items, 0.0, geom.h);
        }
        self.split_chrome = SplitChrome {
            paint,
            slack_top: slack.0,
            slack_bottom: slack.1,
        };
        if geom.clip {
            items.push(super::super::container::clip_children(
                vec![block],
                geom.x,
                0.0,
                geom.w,
                geom.h,
                Corners::default(),
            ));
        } else {
            items.push(block);
        }
        items
    }
}
