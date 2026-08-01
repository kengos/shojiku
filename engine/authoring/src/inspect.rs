//! The `inspect` envelope: engine info (version + capabilities) for GUI
//! gating, the layout tree, the path-addressed box sidecar (one box per
//! item, id-carrying or not), and the resolved page margins — the
//! bundle a Designer canvas hit-tests against.

use crate::capabilities::{engine_info, EngineInfo};
use crate::prepare::Prepared;
use shojiku_layout::{BoxIndex, LayoutDocument};

/// The `inspect` output: engine capabilities, the layout document, the box
/// sidecar, and the resolved page margins.
#[derive(serde::Serialize)]
pub struct InspectEnvelope<'a> {
    pub engine: EngineInfo,
    pub document: &'a LayoutDocument,
    pub boxes: &'a BoxIndex,
    /// Resolved page margins `[top, right, bottom, left]` in pt — the content
    /// origin for Designer margin guides.
    pub margin: [f64; 4],
}

/// Borrows a [`Prepared`] into the inspect envelope (no copy of the tree).
pub fn inspect_envelope(prepared: &Prepared) -> InspectEnvelope<'_> {
    InspectEnvelope {
        engine: engine_info(),
        document: &prepared.document,
        boxes: &prepared.boxes,
        margin: prepared.margin,
    }
}

/// Serializes the inspect envelope as pretty JSON.
pub fn inspect_json(prepared: &Prepared) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(&inspect_envelope(prepared))
}

#[cfg(test)]
mod tests;
