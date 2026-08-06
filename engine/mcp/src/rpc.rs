//! JSON-RPC 2.0 plumbing: newline-delimited framing with a line cap,
//! response/error builders, and the bounded echo for hostile strings.

use serde_json::{json, Value};
use std::io::{BufRead, Read, Write};

/// JSON-RPC error codes (the standard set).
pub(crate) const PARSE_ERROR: i64 = -32700;
pub(crate) const INVALID_REQUEST: i64 = -32600;
pub(crate) const METHOD_NOT_FOUND: i64 = -32601;
pub(crate) const INVALID_PARAMS: i64 = -32602;
/// MCP's resource-not-found code (spec 2025-06-18, Resources § Error
/// Handling), outside the JSON-RPC standard range.
pub(crate) const RESOURCE_NOT_FOUND: i64 = -32002;

/// A dispatchable error. The tool surface answers with a bare
/// `(code, message)` pair; the resources area additionally attaches the
/// spec's `data` object, so this carries the optional third field and
/// converts from the pair.
#[derive(Debug)]
pub(crate) struct RpcError {
    pub(crate) code: i64,
    pub(crate) message: String,
    pub(crate) data: Option<Value>,
}

impl RpcError {
    /// An error with no `data` member.
    pub(crate) fn new(code: i64, message: String) -> Self {
        Self {
            code,
            message,
            data: None,
        }
    }

    /// An error carrying a structured `data` member.
    pub(crate) fn with_data(code: i64, message: String, data: Value) -> Self {
        Self {
            code,
            message,
            data: Some(data),
        }
    }
}

impl From<(i64, String)> for RpcError {
    fn from((code, message): (i64, String)) -> Self {
        Self::new(code, message)
    }
}

/// Longest accepted request line. Inputs are file PATHS (not inline
/// content), so real requests stay tiny; the cap bounds a hostile client's
/// memory use.
pub(crate) const MAX_LINE: usize = 1024 * 1024;

/// One read attempt from the transport.
pub(crate) enum Frame {
    /// A complete line, trailing newline stripped.
    Line(String),
    /// The line exceeded [`MAX_LINE`]; the remainder was drained.
    Oversized,
    /// End of stream.
    Eof,
}

/// Reads one newline-delimited frame, bounding memory at [`MAX_LINE`].
pub(crate) fn read_frame<R: BufRead>(reader: &mut R) -> std::io::Result<Frame> {
    let mut buf = Vec::new();
    let n = (&mut *reader)
        .take(MAX_LINE as u64 + 1)
        .read_until(b'\n', &mut buf)?;
    if n == 0 {
        return Ok(Frame::Eof);
    }
    if buf.last() != Some(&b'\n') && buf.len() > MAX_LINE {
        drain_line(reader)?;
        return Ok(Frame::Oversized);
    }
    while matches!(buf.last(), Some(b'\n' | b'\r')) {
        buf.pop();
    }
    Ok(Frame::Line(String::from_utf8_lossy(&buf).into_owned()))
}

/// Discards the rest of an oversized line (bounded chunks) so the loop can
/// resynchronize on the next newline.
fn drain_line<R: BufRead>(reader: &mut R) -> std::io::Result<()> {
    loop {
        let mut sink = Vec::new();
        let n = (&mut *reader)
            .take(MAX_LINE as u64)
            .read_until(b'\n', &mut sink)?;
        if n == 0 || sink.last() == Some(&b'\n') {
            return Ok(());
        }
    }
}

/// Serializes one message as a single line and flushes it.
pub(crate) fn write_frame<W: Write>(writer: &mut W, message: &Value) -> std::io::Result<()> {
    // `Value` serialization escapes embedded newlines, so this is one line.
    writer.write_all(message.to_string().as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()
}

/// A JSON-RPC success response.
pub(crate) fn result_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// A JSON-RPC error response.
pub(crate) fn error_response(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// A JSON-RPC error response carrying an optional `data` member.
pub(crate) fn error_response_full(id: Value, error: &RpcError) -> Value {
    let mut body = json!({ "code": error.code, "message": error.message });
    if let Some(data) = &error.data {
        body["data"] = data.clone();
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": body })
}

/// Bounds an attacker-controlled echo: control characters stripped, then
/// clipped to 200 chars (the diagnostics layer's convention).
pub(crate) fn clip(s: &str) -> String {
    shojiku_diagnostics::sanitize(s, shojiku_diagnostics::MAX_ECHO)
}

#[cfg(test)]
mod tests;
