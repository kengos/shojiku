//! The dispatch loop: initialize handshake, method routing, and the
//! JSON-RPC error mapping. Protocol errors are answered in-band; only
//! transport I/O failures abort the loop.

use crate::rpc::{
    clip, error_response, error_response_full, read_frame, result_response, write_frame, Frame,
    RpcError, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR,
};
use crate::{instructions, resources, tools, McpError, ServerArgs};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

/// Protocol revisions this server accepts, newest first (append-only).
/// Adding a revision requires checking its changelog against this loop:
/// 2025-03-26 is deliberately absent — it REQUIRES receiving JSON-RPC
/// batches, which this loop rejects (batching was removed in 2025-06-18).
const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2025-06-18"];

/// Runs the newline-delimited JSON-RPC loop until end of stream.
pub fn serve<R: BufRead, W: Write>(
    args: &ServerArgs,
    reader: &mut R,
    writer: &mut W,
) -> Result<(), McpError> {
    loop {
        match read_frame(reader)? {
            Frame::Eof => return Ok(()),
            Frame::Oversized => {
                let message = "request line exceeds the 1 MiB cap";
                write_frame(writer, &error_response(Value::Null, PARSE_ERROR, message))?;
            }
            Frame::Line(line) => {
                if line.trim().is_empty() {
                    continue;
                }
                if let Some(response) = handle_line(args, &line) {
                    write_frame(writer, &response)?;
                }
            }
        }
    }
}

/// Parses one frame and dispatches it; `None` means nothing to send (a
/// notification, which is never answered — not even with an error).
fn handle_line(args: &ServerArgs, line: &str) -> Option<Value> {
    let message: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(err) => {
            return Some(error_response(
                Value::Null,
                PARSE_ERROR,
                &format!("invalid JSON: {err}"),
            ))
        }
    };
    let Value::Object(request) = message else {
        let message = "expected a JSON-RPC request object";
        return Some(error_response(Value::Null, INVALID_REQUEST, message));
    };
    let id = request.get("id").cloned();
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    let Some(method) = request.get("method").and_then(Value::as_str) else {
        return id.map(|id| error_response(id, INVALID_REQUEST, "missing method"));
    };
    let id = id?; // no id → a notification: handle nothing, answer nothing
    Some(match dispatch(args, method, &params) {
        Some(Ok(result)) => result_response(id, result),
        Some(Err(error)) => error_response_full(id, &error),
        None => error_response(
            id,
            METHOD_NOT_FOUND,
            &format!("unknown method: {}", clip(method)),
        ),
    })
}

/// Routes a request; `None` = unknown method.
fn dispatch(args: &ServerArgs, method: &str, params: &Value) -> Option<Result<Value, RpcError>> {
    match method {
        "initialize" => Some(Ok(initialize_result(params))),
        "ping" => Some(Ok(json!({}))),
        "tools/list" => Some(Ok(tools::list())),
        "tools/call" => Some(tools::call(args, params).map_err(RpcError::from)),
        "resources/list" => Some(Ok(resources::list())),
        "resources/read" => Some(resources::read(params)),
        _ => None,
    }
}

/// The `initialize` result: negotiated protocol revision, the declared
/// capabilities, this build's identity, and the usage guidance clients
/// hand to the model.
///
/// `resources` is declared bare: this server implements `resources/list`
/// and `resources/read` and neither `subscribe` nor `listChanged`, which
/// MCP 2025-06-18 permits — the resource set is compiled in, so it cannot
/// change while the server runs.
fn initialize_result(params: &Value) -> Value {
    let requested = params.get("protocolVersion").and_then(Value::as_str);
    json!({
        "protocolVersion": negotiate_version(requested),
        "capabilities": { "tools": {}, "resources": {} },
        "serverInfo": { "name": "shojiku-mcp", "version": env!("CARGO_PKG_VERSION") },
        "instructions": instructions::INSTRUCTIONS,
    })
}

/// Echoes a supported requested revision; anything else gets our newest.
fn negotiate_version(requested: Option<&str>) -> &'static str {
    requested
        .and_then(|r| SUPPORTED_PROTOCOL_VERSIONS.iter().find(|v| **v == r))
        .copied()
        .unwrap_or(SUPPORTED_PROTOCOL_VERSIONS[0])
}

#[cfg(test)]
mod tests;
