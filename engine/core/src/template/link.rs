//! Hyperlink wire (`link:`): a URL attached to a text/image item or span.

use serde::{Deserialize, Serialize};

/// A hyperlink on a text item, image item, or rich-text span,
/// emitted as a PDF link annotation over the item's drawn geometry
/// (per line/run for text, the draw box for images). Object form — not a
/// bare string — so internal destinations (`destination:`) can be added
/// later without a second authored shape.
///
/// `url` takes `{key:format}` interpolation like static text and is
/// resolved against the current data scope (per-element inside `repeat`
/// cells). Layout gates the *resolved* value: only `http:`/`https:`/
/// `mailto:`/`tel:` URLs within the length cap are emitted; anything
/// else warns and drops the link (params are untrusted, and a PDF `/URI`
/// action reaches the reader's machine).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub url: String,
}

#[cfg(test)]
mod tests;
