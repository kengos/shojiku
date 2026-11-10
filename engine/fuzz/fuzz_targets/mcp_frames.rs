//! Bytes on the MCP server's stdin, through the frame reader (with a line
//! cap of a few bytes, so a short input can exceed it) and the line
//! handler. The checks: the frames read are the newline-delimited runs of
//! the bytes, every answer is one line of JSON-RPC 2.0 with exactly one of
//! `result` and `error` and the request's `id`, a notification gets no
//! answer, an echoed method name is bounded, and the same line gets the
//! same answer twice. A `tools/call` request is skipped: its tools read
//! files of the machine running the fuzzer.
//!
//! The harness is in `shojiku_mcp::fuzz`, where the corpus replay test runs
//! the same code.
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = shojiku_mcp::fuzz::frames(data);
});
