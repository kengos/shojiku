//! The stdio transport harness the `mcp_frames` fuzz target and the corpus
//! replay test both run.
//!
//! The server reads newline-delimited frames and answers each JSON-RPC
//! request on one line. The harness reads every frame of the input with a
//! small line cap, checks the frames against the ones computed from the
//! input bytes, and answers each frame through the server's own line
//! handler. It asserts that every answer is one line of JSON-RPC 2.0 with
//! exactly one of `result` and `error`, that a request with an `id` gets an
//! answer carrying that `id`, that a notification gets none, that an
//! unparseable line or a non-object gets an error with a null `id`, that an
//! error message holds no character the echo guard strips, that the
//! unknown-method message is at most `MAX_ECHO` characters longer than its
//! fixed `unknown method: ` prefix, and that the same line gives the same
//! answer twice.
//!
//! A `tools/call` request is NOT answered: its tools read files named by
//! `*Path` arguments from the machine running the fuzzer and lay out whole
//! documents, so its answer would depend on that machine's files. The wire
//! fuzz targets cover the parsers the `tools/call` tools call.

use crate::ServerArgs;
use crate::rpc::{INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR, write_frame};
use crate::server::handle_line;
use serde_json::Value;
use shojiku_diagnostics::{MAX_ECHO, sanitize};
use stream::{Expected, expected, read_all};

mod stream;
#[cfg(test)]
mod tests;

/// The line cap when the settings line does not give one.
const DEFAULT_CAP: usize = 16;

/// The largest line cap the settings line may give. Fuzz inputs are a few
/// kilobytes, so a larger cap would make the oversized branch rare.
const MAX_CAP: usize = 256;

/// The methods the server answers with a result whatever their params.
const ALWAYS_ANSWERED: [&str; 4] = ["initialize", "ping", "tools/list", "resources/list"];

/// The fixed text of the unknown-method message, before the method name.
const UNKNOWN_METHOD: &str = "unknown method: ";

/// Which assertions one input checked on a result a no-op engine would not
/// give, each set after the assertion it guards passed.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct FramePaths {
    /// The frame reader read a line within the cap.
    pub line: bool,
    /// The frame reader read a line over the cap as oversized.
    pub oversized: bool,
    /// A line that is not JSON got a parse error with a null `id`.
    pub parse_error: bool,
    /// JSON that is not an object got an invalid-request error, null `id`.
    pub not_object: bool,
    /// A request with an `id` and no string `method` got an invalid-request
    /// error with that `id`.
    pub missing_method: bool,
    /// An object with no `id` got no answer.
    pub notification: bool,
    /// A method the server does not have got a method-not-found error.
    pub unknown_method: bool,
    /// An unknown method name was over `MAX_ECHO` characters, so a message
    /// echoing it whole would fail the echo bound.
    pub echo_clipped: bool,
    /// A request for a method the server always answers with a result got
    /// a `result`.
    pub result: bool,
    /// A `resources/read` request whose `params` hold no string `uri` got
    /// an invalid-params error with its `id`.
    pub method_error: bool,
}

/// Reads the line cap from the settings line: `cap=<1..=256>`, else
/// [`DEFAULT_CAP`].
fn cap(settings: &[u8]) -> usize {
    std::str::from_utf8(settings)
        .ok()
        .and_then(|line| line.trim().strip_prefix("cap="))
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|cap| (1..=MAX_CAP).contains(cap))
        .unwrap_or(DEFAULT_CAP)
}

/// Runs one fuzz input through the transport and the line handler and
/// asserts the properties in the module documentation. The first line
/// holds the settings (see [`cap`]); the bytes after that line's `\n` are
/// the stream the server reads.
///
/// # Panics
///
/// Panics when a property fails; the message names it.
pub fn frames(data: &[u8]) -> FramePaths {
    let (settings, stream) = match data.iter().position(|b| *b == b'\n') {
        Some(at) => (&data[..at], &data[at + 1..]),
        None => (data, &[][..]),
    };
    let cap = cap(settings);
    let read = read_all(stream, cap);
    assert_eq!(
        read,
        expected(stream, cap),
        "the frames read differ from the frames the bytes hold"
    );
    let args = ServerArgs {
        font_dir: Vec::new(),
        locale_dir: Vec::new(),
    };
    let mut paths = FramePaths::default();
    for frame in read {
        match frame {
            Expected::Oversized => paths.oversized = true,
            Expected::Line(line) => {
                paths.line = true;
                answer(&args, &line, &mut paths);
            }
        }
    }
    paths
}

/// Answers one line as the server does, unless it is blank or a
/// `tools/call`, and checks the answer against the request.
fn answer(args: &ServerArgs, line: &str, paths: &mut FramePaths) {
    if line.trim().is_empty() {
        return;
    }
    let request: Option<Value> = serde_json::from_str(line).ok();
    let method = request
        .as_ref()
        .and_then(|r| r.get("method"))
        .and_then(Value::as_str);
    if request.as_ref().is_some_and(Value::is_object) && method == Some("tools/call") {
        return;
    }
    let response = handle_line(args, line);
    assert_eq!(
        response,
        handle_line(args, line),
        "the same line was answered differently twice"
    );
    if let Some(response) = &response {
        assert_one_line(response, line);
    }
    match &request {
        None => {
            assert_error(response.as_ref(), &Value::Null, PARSE_ERROR);
            paths.parse_error = true;
        }
        Some(Value::Object(object)) => check_request(object, method, response, paths),
        Some(_) => {
            assert_error(response.as_ref(), &Value::Null, INVALID_REQUEST);
            paths.not_object = true;
        }
    }
}

/// Checks the answer to a JSON object against its `id` and `method`.
fn check_request(
    object: &serde_json::Map<String, Value>,
    method: Option<&str>,
    response: Option<Value>,
    paths: &mut FramePaths,
) {
    let id = object.get("id");
    let Some(method) = method else {
        match id {
            Some(id) => {
                assert_error(response.as_ref(), id, INVALID_REQUEST);
                paths.missing_method = true;
            }
            None => {
                assert!(response.is_none(), "a notification was answered");
                paths.notification = true;
            }
        }
        return;
    };
    let Some(id) = id else {
        assert!(response.is_none(), "a notification was answered");
        paths.notification = true;
        return;
    };
    let response = response.expect("a request with an id was not answered");
    assert_eq!(&response["id"], id, "an answer carries another id");
    let uri = object
        .get("params")
        .and_then(|params| params.get("uri"))
        .and_then(Value::as_str);
    if method == "resources/read" && uri.is_none() {
        assert_error(Some(&response), id, INVALID_PARAMS);
        paths.method_error = true;
    }
    if response.get("result").is_some() {
        assert!(
            ALWAYS_ANSWERED.contains(&method) || method == "resources/read",
            "`{method}`, a method the server does not have, got a result"
        );
        paths.result |= ALWAYS_ANSWERED.contains(&method);
    } else if response["error"]["code"] == METHOD_NOT_FOUND {
        assert!(
            !ALWAYS_ANSWERED.contains(&method) && method != "resources/read",
            "a method the server has was reported unknown"
        );
        let message = response["error"]["message"].as_str().unwrap_or_default();
        super::assert_bounded_echo(message, method, UNKNOWN_METHOD.len());
        paths.unknown_method = true;
        if sanitize(method, usize::MAX).chars().count() > MAX_ECHO {
            assert!(
                message.starts_with(UNKNOWN_METHOD),
                "an unknown-method message does not start with its fixed text"
            );
            paths.echo_clipped = true;
        }
    } else {
        // `tools/call` is skipped, so `resources/read` is the one method
        // the harness answers whose dispatch can return an error.
        assert_eq!(
            method, "resources/read",
            "`{method}` answered with an error other than method not found"
        );
    }
}

/// Asserts that `response` is an error with `code` and `id`.
fn assert_error(response: Option<&Value>, id: &Value, code: i64) {
    let response = response.expect("a line that is not a request was not answered");
    assert_eq!(&response["id"], id, "an error carries another id");
    assert_eq!(
        response["error"]["code"], code,
        "an error carries another code"
    );
}

/// Asserts that `response` is written as one line of JSON-RPC 2.0 with
/// exactly one of `result` and `error`, and an error message within the
/// echo bound.
fn assert_one_line(response: &Value, line: &str) {
    let mut written = Vec::new();
    write_frame(&mut written, response).expect("writing to a Vec cannot fail");
    assert_eq!(
        written.iter().filter(|b| **b == b'\n').count(),
        1,
        "an answer was not written as one line"
    );
    assert_eq!(
        written.last(),
        Some(&b'\n'),
        "an answer has no final newline"
    );
    let mut back: Value = serde_json::from_slice(&written).expect("an answer is not JSON");
    // The `id` is left out of the comparison: serde_json's default float
    // parsing is not correctly rounded, so an `id` holding a float (an
    // integer past the 64-bit range parses as one), at any depth, can read
    // back one unit in the last place away. The answer's `id` is compared
    // with the request's in `check_request` and `assert_error`.
    back["id"] = response["id"].clone();
    assert_eq!(&back, response, "an answer did not survive its own framing");
    assert_eq!(response["jsonrpc"], "2.0", "an answer is not JSON-RPC 2.0");
    assert!(
        response.get("result").is_some() != response.get("error").is_some(),
        "an answer has both or neither of `result` and `error`"
    );
    if let Some(error) = response.get("error") {
        assert!(error["code"].is_i64(), "an error code is not an integer");
        let message = error["message"].as_str().expect("an error has no message");
        super::assert_bounded_echo(message, line, super::MAX_FIXED_TEXT);
    }
}
