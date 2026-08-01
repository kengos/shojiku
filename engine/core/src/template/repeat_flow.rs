//! Flow repeat (`type: repeat_flow`): one auto-height card per array
//! element, stacked in normal flow and paginating card-by-card (IG1).

use serde::{Deserialize, Serialize};

use crate::length::Length;

use super::{Binding, ContainerItem};

/// Data-driven flow repeat: lays one `item` card per element of a `data`
/// array in normal flow — auto height, stacked with `gap` between cards,
/// starting at the flow cursor and paginating card-by-card. A card never
/// splits across pages (it breaks to the next page whole, like any flow
/// atom); a card taller than the flow region overflows with a warning.
/// The n-up sibling is [`super::RepeatItem`] (rigid grid slots aligned to
/// fresh pages); `repeat_flow` is the vertical card-list counterpart.
/// Flow-body only, like `table` and `repeat`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RepeatFlowItem {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// The array params key; one card is emitted per element, in order.
    pub data: Binding,
    /// Vertical gap between cards; resolves against the flow-region
    /// height (a [`Length`]: pt or `%`). Omitted = no gap; negative
    /// values clamp to 0 at layout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gap: Option<Length>,
    /// The per-element card, modeled as a [`ContainerItem`]: auto height
    /// unless `box.h` is set, and **element-scoped** like a `repeat`
    /// cell — its `data:` / `{{key}}` bindings resolve against the bound
    /// array element, so the card is authored once.
    pub item: ContainerItem,
}
