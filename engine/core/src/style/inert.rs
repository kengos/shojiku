//! Context-inert style keys: which authored properties have no effect on
//! the surface they are authored on, reported by wire name.
//!
//! Derived from [`crate::facts::painted_by`], so a key's surfaces are
//! written once. The lists back two validation diagnostics
//! (`ignored_span_style`, `shape_style_ignored`) so an authoring mistake is
//! visible instead of a silent no-op. Only the author's own inline style is
//! walked — a named style is a shared bag whose extra keys are legitimate
//! elsewhere.

use super::{Style, StyleKey};
use crate::ItemKind;
use crate::facts::{Surface, painted_by};

impl Style {
    /// Wire names of the set properties `surface` does not paint with, in
    /// field order — the names, never the authored values, so the
    /// diagnostic stays bounded. A key the layout reports for this surface
    /// itself is left out, so one mistake gets one warning: a form mark's
    /// `borderRadius` warns `border_radius_ignored` where the shape is
    /// drawn.
    pub fn ignored_on(&self, surface: Surface) -> Vec<&'static str> {
        StyleKey::ALL
            .into_iter()
            .filter(|key| self.is_set(*key))
            .filter(|key| !painted_by(*key).contains(&surface))
            .filter(|key| !reported_by_layout(surface, *key))
            .map(StyleKey::as_str)
            .collect()
    }

    /// [`Style::ignored_on`] a rich-text span. Spans are text runs, not
    /// boxes: only the font, colour, spacing, decoration and tate-chu-yoko
    /// keys apply per span.
    pub fn ignored_span_keys(&self) -> Vec<&'static str> {
        self.ignored_on(Surface::Span)
    }
}

/// Whether layout itself warns about `key` on `surface`.
fn reported_by_layout(surface: Surface, key: StyleKey) -> bool {
    key == StyleKey::BorderRadius
        && matches!(
            surface,
            Surface::Item(ItemKind::Ellipse | ItemKind::Checkbox) | Surface::Mark
        )
}
