//! Conversation-level dispatch tests: shared driver here, the handshake
//! and protocol-error suites in the submodules.

mod handshake;
mod protocol;

use crate::test_support::server_args;
use crate::{serve, McpError};
use serde_json::Value;
use std::io::Cursor;

/// Runs one full conversation over in-memory stdio; returns the parsed
/// response lines.
pub(crate) fn talk(input: &str) -> Vec<Value> {
    let mut reader = Cursor::new(input.as_bytes().to_vec());
    let mut out = Vec::new();
    serve(&server_args(), &mut reader, &mut out).expect("serve");
    String::from_utf8(out)
        .expect("utf8 output")
        .lines()
        .map(|line| serde_json::from_str(line).expect("response line JSON"))
        .collect()
}

#[test]
fn write_failures_abort_the_loop_with_an_io_error() {
    struct FailingWriter;
    impl std::io::Write for FailingWriter {
        fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("pipe closed"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut reader = Cursor::new(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n".to_vec());
    let result = serve(&server_args(), &mut reader, &mut FailingWriter);
    assert!(matches!(result, Err(McpError::Io(_))));
}
