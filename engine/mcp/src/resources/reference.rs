//! The `resources` view of the authoring reference: the `resources/list`
//! entries for the 33 pages, and the read of one page or one node.
//!
//! **A page read answers TWO parts, always.** The markdown half
//! (`text/markdown`) is the page body byte for byte, minus its front
//! matter; the schema half (`application/schema+json`) is the page's
//! catalog shapes. Eleven pages declare no shapes and get an empty `$defs`
//! rather than a missing part — a client must be able to write one reader,
//! and "the catalog names no shape for this page" is an answer.
//!
//! Both parts carry the PAGE's URI. The schema half is not separately
//! addressable (only `#<Shape>` is), and minting a `#$defs` spelling would
//! advertise a fragment this crate's own parser rejects.
//!
//! The schema half's `$ref`s point OUTWARD, and the document says so in its
//! own `$comment`: the page→shape map is an exact partition, so a shape one
//! of these nodes references is owned by a DIFFERENT page and resolves at
//! that page's URI (`reference::nodes`).
//!
//! **A fragment read answers one part, `application/json`.** Its body is an
//! envelope — the matches, each naming its owning shape — so it is not a
//! schema document and does not claim to be one.

use super::{contents, not_found};
use crate::reference::{self, nodes, uri, Page};
use crate::rpc::{clip, RpcError, INVALID_PARAMS};
use serde_json::{json, Value};

/// The `resources/list` entries for every reference page.
pub(crate) fn list_entries() -> Vec<Value> {
    reference::catalog()
        .iter()
        .map(|page| {
            json!({
                "uri": uri::page_uri(page.stem),
                "name": page.stem,
                "title": page.title,
                "description": page.summary,
                "mimeType": "text/markdown",
                "size": page.body.len(),
            })
        })
        .collect()
}

/// `resources/read` for the reference family.
pub(crate) fn read(target: &str) -> Result<Value, RpcError> {
    let Some(reference) = uri::parse(target) else {
        return Err(RpcError::new(
            INVALID_PARAMS,
            format!(
                "`{}` is not a Shojiku reference URI; expected {}<page>[#<key>]",
                clip(target),
                uri::PREFIX
            ),
        ));
    };
    let page =
        reference::find(reference.stem).ok_or_else(|| not_found("reference page", target))?;
    match reference.fragment {
        None => Ok(read_page(page)),
        Some(fragment) => read_fragment(page, fragment, target),
    }
}

/// A whole page: its markdown and its catalog shapes.
fn read_page(page: &'static Page) -> Value {
    let uri = uri::page_uri(page.stem);
    contents(vec![
        json!({ "uri": uri, "mimeType": "text/markdown", "text": page.body }),
        json!({
            "uri": uri,
            "mimeType": "application/schema+json",
            "text": crate::tools::json_text(&nodes::defs(page)),
        }),
    ])
}

/// One selector's nodes. A selector that names nothing on this page is a
/// not-found, the same as a page that does not exist.
fn read_fragment(page: &'static Page, fragment: &str, target: &str) -> Result<Value, RpcError> {
    let matches = nodes::resolve(page, fragment);
    if matches.is_empty() {
        return Err(not_found("reference node", target));
    }
    Ok(contents(vec![json!({
        "uri": uri::fragment_uri(page.stem, fragment),
        "mimeType": "application/json",
        "text": crate::tools::json_text(&nodes::matches_body(page, fragment, &matches)),
    })]))
}

#[cfg(test)]
mod tests;
