//! The MCP `resources` area: `resources/list` and `resources/read` over the
//! two resource families — the bundled examples (served from this file) and
//! the authoring reference (`resources/reference`). `read` dispatches on the
//! URI's own prefix, so neither family can answer for the other.
//!
//! Only the two request methods are implemented. The capability is declared
//! as a bare `{}` — no `subscribe`, no `listChanged` — which MCP 2025-06-18
//! permits explicitly, and which is honest: the list is compiled into the
//! binary, so it cannot change while the server runs and there is nothing
//! to notify about. The list is complete in one response, so no
//! `nextCursor` is emitted either.
//!
//! Size discipline differs by family, deliberately, and each bound sits
//! where it is enforced. An EXAMPLE entry is normally read as a bundle (its
//! source files together — a template cannot be understood without the
//! definitions its bindings name), so a bundle that would dwarf the
//! client's context is REFUSED at read time with the per-file URIs to use
//! instead: [`MAX_ENTRY_BYTES`], below. A REFERENCE page has no per-file
//! spelling to be sent to, so refusing one at read time would only make it
//! unreachable; it carries its own, larger bound, asserted over the
//! compiled-in corpus rather than at read time —
//! `MAX_REFERENCE_BYTES` in `crate::reference::tests`, which is where the
//! two families' different appetites are argued. Neither family truncates.

pub(crate) mod reference;

use crate::examples::{self, uri, CatalogEntry, SourceFile};
use crate::rpc::{clip, RpcError, INVALID_PARAMS, RESOURCE_NOT_FOUND};
use serde_json::{json, Value};

/// Largest bundle `resources/read` will assemble for a whole entry.
/// Comfortably above every product example; the syntax showcase is the one
/// entry that exceeds it, which is the intended "ask for that file by name"
/// path rather than a surprise.
pub(crate) const MAX_ENTRY_BYTES: usize = 64 * 1024;

// A single file has no runtime cap, deliberately. A file is the atomic
// unit here — this surface cannot serve half of one — so refusing an
// oversized file at runtime would only make it unreachable. The bound is
// enforced one step earlier instead: the corpus is compiled in, so
// `examples::tests::MAX_FILE_BYTES` asserts over every embedded file and a
// future example that crosses it fails the suite rather than shipping.

/// `resources/list`: every bundled entry and every reference page, each
/// addressed as one resource.
pub(crate) fn list() -> Value {
    let mut resources: Vec<Value> = examples::catalog()
        .iter()
        .map(|entry| {
            json!({
                "uri": uri::entry_uri(entry.id),
                "name": entry.id,
                "title": entry.title,
                "description": entry.description,
                "size": entry.size(),
            })
        })
        .collect();
    resources.extend(reference::list_entries());
    json!({ "resources": resources })
}

/// `resources/read`: routes the URI to its family, then to one entry's
/// sources, one named file, one reference page, or one catalog node.
pub(crate) fn read(params: &Value) -> Result<Value, RpcError> {
    let Some(target) = params.get("uri").and_then(Value::as_str) else {
        return Err(RpcError::new(
            INVALID_PARAMS,
            "`uri` is required and must be a string".into(),
        ));
    };
    if target.starts_with(crate::reference::uri::PREFIX) {
        return reference::read(target);
    }
    match uri::parse(target) {
        Some(uri::Ref::Entry(id)) => read_entry(lookup(id, target)?, target),
        Some(uri::Ref::File(id, name)) => read_file(lookup(id, target)?, name, target),
        None => Err(RpcError::new(
            INVALID_PARAMS,
            format!(
                "`{}` is not a Shojiku resource URI; expected {}<bucket>/<name>[/<file>] \
                 or {}<page>[#<key>]",
                clip(target),
                uri::PREFIX,
                crate::reference::uri::PREFIX
            ),
        )),
    }
}

/// Resolves an entry id, reporting a well-formed miss as not-found.
fn lookup(id: &str, target: &str) -> Result<&'static CatalogEntry, RpcError> {
    examples::find(id).ok_or_else(|| not_found("bundled example", target))
}

/// The spec's resource-not-found error, echoing the requested URI in
/// `data` (bounded like any other client-supplied string). `kind` names
/// what was looked for, so the two families' misses read differently.
fn not_found(kind: &str, target: &str) -> RpcError {
    RpcError::with_data(
        RESOURCE_NOT_FOUND,
        format!("no {kind} at `{}`", clip(target)),
        json!({ "uri": clip(target) }),
    )
}

/// Reads a whole entry, or refuses with the per-file URIs when the bundle
/// would exceed the cap.
fn read_entry(entry: &'static CatalogEntry, target: &str) -> Result<Value, RpcError> {
    let size = entry.size();
    if size > MAX_ENTRY_BYTES {
        let uris: Vec<String> = entry
            .files
            .iter()
            .map(|f| uri::file_uri(entry.id, f.name))
            .collect();
        return Err(RpcError::new(
            INVALID_PARAMS,
            format!(
                "`{}` is {size} bytes, over the {MAX_ENTRY_BYTES}-byte bundle cap; read one file at a time: {}",
                clip(target),
                uris.join(", ")
            ),
        ));
    }
    Ok(contents(
        entry.files.iter().map(|f| part(entry.id, f)).collect(),
    ))
}

/// Reads one named file of an entry. Always served in full — see the note
/// on file size above.
fn read_file(entry: &'static CatalogEntry, name: &str, target: &str) -> Result<Value, RpcError> {
    let file = entry
        .file(name)
        .ok_or_else(|| not_found("bundled example", target))?;
    Ok(contents(vec![part(entry.id, file)]))
}

/// One `ResourceContents` item.
fn part(id: &str, file: &SourceFile) -> Value {
    json!({
        "uri": uri::file_uri(id, file.name),
        "mimeType": file.mime(),
        "text": file.text,
    })
}

/// The `resources/read` result envelope.
fn contents(items: Vec<Value>) -> Value {
    json!({ "contents": items })
}

#[cfg(test)]
mod tests;
