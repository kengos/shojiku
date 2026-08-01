//! Source arguments: each of definitions/template/params arrives either as a
//! `*Path` file reference or as an inline string (a client without a shared
//! filesystem passes the text itself). Parsing decides WHICH form — passing
//! both for one source is a client bug, so it is a protocol error — and
//! reading resolves the chosen form to text.

use super::pipeline::{opt_string, ToolFailure};
use crate::rpc::{clip, INVALID_PARAMS};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Longest accepted inline source, per argument. Explicit and transport
/// independent: the stdio frame cap bounds a whole request only incidentally,
/// and a future transport would not bound it at all.
pub(crate) const MAX_INLINE_BYTES: usize = 512 * 1024;

/// Where one source's text comes from.
pub(crate) enum Source {
    /// A file the server reads.
    Path(PathBuf),
    /// The text itself, supplied by the client.
    Inline(String),
}

impl Source {
    /// The directory this source's sibling assets resolve against: a file's
    /// parent directory; inline text has no directory at all.
    pub(crate) fn dir(&self) -> Option<PathBuf> {
        match self {
            Source::Path(path) => Some(match path.parent() {
                Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
                _ => PathBuf::from("."),
            }),
            Source::Inline(_) => None,
        }
    }

    /// Resolves to text. A read failure surfaces in-band so the client sees
    /// which path was unreadable (bounded like any other hostile string).
    pub(crate) fn read(&self) -> Result<String, ToolFailure> {
        match self {
            Source::Path(path) => std::fs::read_to_string(path).map_err(|err| {
                ToolFailure::Message(format!("failed to read {}: {err}", clip_path(path)))
            }),
            Source::Inline(text) => Ok(text.clone()),
        }
    }
}

/// Bounds a caller-supplied path echo like any other hostile string.
fn clip_path(path: &Path) -> String {
    clip(&path.display().to_string())
}

/// Parses one optional source: the inline `<key>` XOR the `<key>Path` file
/// reference. Both present is invalid params; neither is `None`.
pub(crate) fn opt_source(arguments: &Value, key: &str) -> Result<Option<Source>, (i64, String)> {
    let path_key = format!("{key}Path");
    let inline = opt_string(arguments, key)?;
    let path = opt_string(arguments, &path_key)?;
    match (inline, path) {
        (Some(_), Some(_)) => Err((
            INVALID_PARAMS,
            format!("`{key}` and `{path_key}` are mutually exclusive"),
        )),
        (Some(text), None) => Ok(Some(inline_source(key, &path_key, text)?)),
        (None, Some(path)) => Ok(Some(Source::Path(PathBuf::from(path)))),
        (None, None) => Ok(None),
    }
}

/// Parses one required source; absent in BOTH forms names both spellings.
pub(crate) fn req_source(arguments: &Value, key: &str) -> Result<Source, (i64, String)> {
    opt_source(arguments, key)?.ok_or_else(|| {
        (
            INVALID_PARAMS,
            format!("`{key}` or `{key}Path` is required"),
        )
    })
}

/// Accepts an inline payload under the cap. The refusal names the size and
/// the path form to fall back to — never the payload itself.
fn inline_source(key: &str, path_key: &str, text: String) -> Result<Source, (i64, String)> {
    if text.len() > MAX_INLINE_BYTES {
        return Err((
            INVALID_PARAMS,
            format!(
                "`{key}` is {} bytes, over the {MAX_INLINE_BYTES}-byte inline cap; pass `{path_key}` instead",
                text.len()
            ),
        ));
    }
    Ok(Source::Inline(text))
}

#[cfg(test)]
mod tests;
