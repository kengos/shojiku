//! Template + params -> positioned pages.
//!
//! The flow section implements the behaviors Thinreports struggles with:
//! items stack upward ("auto move up" is inherent — a short table pulls
//! later items up), tables paginate row by row, and table headers repeat
//! on continuation pages.
//!
//! This file is the module root: shared engine state (`Ctx`), the
//! positioning bases (`Basis`), the atom primitive, and the page
//! assembly in [`layout`]. Each concern lives in a child module.

mod assemble;
mod atoms;
mod band;
mod cell;
mod char_grid;
mod container;
mod decoration;
mod flex;
mod flow;
mod fragments;
mod grid;
mod link;
mod list;
mod marks;
mod meta;
mod path;
mod predicate;
mod qr;
mod repeat;
mod repeat_flow;
mod resolve;
mod table;
mod text;
mod translate;

pub use assemble::layout;

use crate::boxes::{translate_boxes, BoxIndex, PlacedBox};
use crate::font::FontStore;
use crate::style::ComputedStyle;
use crate::tree::{LayoutDocument, LayoutItem};
use serde_json::Value;
use shojiku_core::{Catalog, Template};
use shojiku_diagnostics::Diagnostics;
use shojiku_formatter::LangPack;
use shojiku_image::AssetStore;
use shojiku_layout_box::ResolvedBox;
use std::rc::Rc;

const BLACK: (f32, f32, f32) = (0.0, 0.0, 0.0);

/// Slack for horizontal-overflow detection: differences below this are
/// float noise from `%`/physical-unit resolution, not authoring errors.
pub(super) const H_OVERFLOW_EPS: f64 = 0.05;

/// Everything the layout pass needs.
pub struct LayoutInput<'a> {
    pub template: &'a Template,
    pub params: &'a Value,
    pub catalog: Option<&'a Catalog>,
    pub pack: &'a LangPack,
    pub fonts: &'a FontStore,
    /// Image assets already loaded by `shojiku_image::prepare_assets`;
    /// `None` behaves like an empty store.
    pub assets: Option<&'a AssetStore>,
}

/// The layout pass's full output: the renderer tree, the id-addressable
/// box sidecar (`BoxIndex`, for GUI overlays — see `crate::boxes`), the
/// resolved page margins, and the collected diagnostics.
pub struct LayoutOutput {
    pub document: LayoutDocument,
    pub boxes: BoxIndex,
    /// Resolved page margins `[top, right, bottom, left]` in pt,
    /// post-clamp: the content origin. Surfaced through `inspect` so the
    /// GUI draws margin guides without re-implementing resolution; not
    /// part of the renderer contract.
    pub margin: [f64; 4],
    pub diagnostics: Diagnostics,
}

/// One page under construction: renderer items plus the box sidecar.
/// Collapses into the contract `LayoutPage` + a `BoxIndex` page at
/// assembly; renderers never see the boxes.
#[derive(Default)]
struct PageBuild {
    items: Vec<LayoutItem>,
    boxes: Vec<PlacedBox>,
}

struct Ctx<'a, 'b> {
    input: &'b LayoutInput<'a>,
    diags: Diagnostics,
    /// The computed style inherited by the item currently being laid out.
    /// Carried as engine state (like `diags`) rather than threaded through
    /// every walk signature: containers cascade their own `style` onto it
    /// on the way in and restore it on the way out. This is the *inherited*
    /// axis; positioning is resolved via `Basis`, a separate axis that is
    /// never inherited. Only the inherited properties actually flow —
    /// `cascade` resets `verticalAlign` at each use.
    inherited: ComputedStyle,
    /// Data scope for the item currently being laid out. Inside a `repeat`
    /// cell it holds the bound array element and its group key, so `data:` /
    /// `{{key}}` bindings resolve against the element (the table row-scoping
    /// mechanism, generalized). `None` at the document level. Pushed on
    /// entering a cell and restored on leaving, like `inherited`. The element
    /// is `Rc`-shared so reading the scope during binding resolution is a
    /// cheap pointer clone, not a deep `Value` copy.
    scope: Option<Scope>,
    /// `fontFamily` names already warned as unknown, so a family used by
    /// hundreds of items warns once, not per item.
    warned_families: std::collections::HashSet<String>,
    /// Formatter degradation messages already emitted, so a
    /// repeated binding warns once, not per row.
    warned_formats: std::collections::HashSet<String>,
    /// Row `conditionalStyles` entries already warned about, keyed by
    /// code + entry path. Every body row evaluates every entry, so a long
    /// bound array would otherwise build one duplicate per row before the
    /// output dedup ever collapses them.
    warned_row_conditions: std::collections::HashSet<String>,
    /// The structural path segments of the item currently being laid out,
    /// in the validate-diagnostic grammar. Pushed/popped via
    /// `enter_item`/`leave_item` as the walk descends into sections, items,
    /// container children, and `repeat`/`repeat_flow`/table steps;
    /// `current_path` joins them for each `PlacedBox` so id-less items are
    /// addressable too, and `leave_item` stamps the same address onto the
    /// diagnostics the item emitted.
    path: Vec<String>,
    /// The resolved page margins `[top, right, bottom, left]` in pt — the
    /// only place in the walk that knows where the PHYSICAL sheet edges
    /// are (every other coordinate is margin-box relative). Written once
    /// by `layout()` after the margin resolves; read by the imposition cut
    /// marks, which must reach into the margin without running off paper.
    page_margin: [f64; 4],
    /// True while building a DIRECT flow text item (`place_flow_text`).
    /// A vertical block whose columns overflow the box width there is
    /// paginated at column boundaries instead of warned, so the builders
    /// suppress the `horizontal_overflow` warning for the visible-behaving
    /// policies; every other context keeps warning. Set/restored around
    /// the one `text_atom` call, like the other walk state.
    flow_text: bool,
    /// The owning line/column index of each ruby reading item the LAST
    /// text atom emitted, in emission order — the flow paginator's
    /// re-anchoring channel (a fragment carries its lines' readings,
    /// shifted with them). Cleared before each direct-flow text build;
    /// meaningless (stale) in every other context, which never reads it.
    ruby_anchors: Vec<usize>,
    /// The chrome the LAST text block built — its decoration paint and the
    /// vertical slack `verticalAlign` distributed — handed to the flow
    /// paginator as DATA so a fragment rebuilds the box instead of
    /// shape-matching the emitted items. Same channel discipline as
    /// [`Self::ruby_anchors`]: reset before each direct-flow text build,
    /// stale (and unread) everywhere else.
    split_chrome: text::SplitChrome,
}

impl Ctx<'_, '_> {
    /// The current item's structural address (`sections.body.items[3]`),
    /// joined from the path stack.
    fn current_path(&self) -> String {
        self.path.join(".")
    }

    /// Descends into a node: pushes its path segment and returns the mark
    /// [`leave_item`](Self::leave_item) needs. Every walk that appends a
    /// path segment goes through this pair, so a diagnostic emitted
    /// anywhere under the node gets the node's address without the emit
    /// site knowing it — including the ones raised by free functions and by
    /// `shojiku-layout-box`, which have no `Ctx` at all.
    fn enter_item(&mut self, segment: String) -> usize {
        self.path.push(segment);
        self.diags.len()
    }

    /// Leaves a node entered by [`enter_item`](Self::enter_item): stamps
    /// its address onto every diagnostic it emitted that has none, then
    /// pops the segment. Nested nodes leave first, so the deepest one wins.
    /// Diagnostics raised before any descent (a page-level margin warning)
    /// stay pathless, which is what a document-scope statement should be.
    fn leave_item(&mut self, mark: usize) {
        let path = self.current_path();
        self.diags.set_missing_paths(mark, &path);
        self.path.pop();
    }
}

/// A `repeat` cell's data scope: the bound array element, its group key,
/// and the element's index (0-based). The index keys per-element cell
/// assets so a `data:`-bound image loads its own `dyn:<array>[<i>].<key>`.
#[derive(Clone)]
struct Scope {
    element: Rc<Value>,
    /// The key exactly as the template AUTHORED it — row-relative inside
    /// an enclosing scope. It is the asset identity
    /// (`shojiku_image::cell_asset_key`), which must keep matching what
    /// `prepare_assets` precomputed, so it is never rewritten.
    array_key: String,
    /// The same array's full dotted path in the definitions catalog —
    /// equal to `array_key` at document scope, joined with the enclosing
    /// scope's path for a nested source (`orders.items`). Field specs
    /// (format, placeholder, enum labels) are looked up under THIS key.
    catalog_key: String,
    index: usize,
}

/// The parent box lengths resolve against — `shojiku-layout-box` owns
/// the definition; re-exported so child modules keep their `super::`
/// paths.
pub(crate) use shojiku_layout_box::Basis;

/// A vertical slice of content: items positioned relative to the atom top.
#[derive(Debug, Clone)]
struct Atom {
    height: f64,
    items: Vec<LayoutItem>,
    /// Id-addressable placements riding with the atom (y relative to the
    /// atom top, like `items`); empty unless an `id:` was authored.
    boxes: Vec<PlacedBox>,
    /// The resolved box this atom was built from, when it has one (lines
    /// and table rows don't). Flex placement reads the authored width and
    /// auto-margin flags from here instead of re-resolving the box (which
    /// would duplicate diagnostics).
    rb: Option<ResolvedBox>,
}

/// The id-less placement builders shared by every atom; child modules
/// reach them via `super::placed_box` / `super::line_placed_box`
/// (descendants see this private use).
use path::{line_placed_box, placed_box};

/// Grows an atom by its vertical margins: items shift down by the top
/// margin and the reserved height gains both, so every placement context
/// (flow stack, container children, absolute body) spaces margins
/// identically and auto heights include them. The height is clamped at
/// zero so hostile negative margins cannot drive a flow cursor backward.
fn with_vertical_margin(atom: Atom, top: f64, bottom: f64) -> Atom {
    if top == 0.0 && bottom == 0.0 {
        return atom;
    }
    Atom {
        height: (atom.height + top + bottom).max(0.0),
        items: translate(&atom.items, top),
        boxes: translate_boxes(&atom.boxes, top),
        rb: atom.rb,
    }
}

use translate::{translate, translate_x};
