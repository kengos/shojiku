//! End-to-end test of the `shojiku-mcp` binary over real stdio.
//!
//! Spawning via `CARGO_BIN_EXE_shojiku-mcp` keeps `main.rs` inside the
//! coverage measurement (cargo-llvm-cov instruments child processes).

use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn initialize_list_and_capabilities_over_stdio() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_shojiku-mcp"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn shojiku-mcp");
    let mut stdin = child.stdin.take().expect("stdin");
    stdin
        .write_all(
            concat!(
                r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}"#,
                "\n",
                r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
                "\n",
                r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
                "\n",
                r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"capabilities"}}"#,
                "\n",
            )
            .as_bytes(),
        )
        .expect("write requests");
    drop(stdin); // EOF ends the session cleanly

    let out = child.wait_with_output().expect("wait");
    assert!(out.status.success());
    let lines: Vec<serde_json::Value> = String::from_utf8(out.stdout)
        .expect("utf8")
        .lines()
        .map(|line| serde_json::from_str(line).expect("response JSON"))
        .collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0]["result"]["serverInfo"]["name"], "shojiku-mcp");
    assert_eq!(
        lines[1]["result"]["tools"].as_array().expect("tools").len(),
        4
    );
    let caps = lines[2]["result"]["content"][0]["text"]
        .as_str()
        .expect("capabilities text");
    assert!(caps.contains("mcp.stdio"));
}

/// A client with no shared filesystem: the whole document travels inline in
/// the `tools/call` frame, and the server never touches a path.
#[test]
fn inline_sources_validate_over_stdio() {
    let template = "page: { margin: 0 }\nsections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 500, h: 700 }\n    items:\n      - type: text\n        data: { key: order.ghost }\n";
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": { "name": "validate", "arguments": { "template": template, "params": "{}" } },
    });

    let mut child = Command::new(env!("CARGO_BIN_EXE_shojiku-mcp"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn shojiku-mcp");
    let mut stdin = child.stdin.take().expect("stdin");
    writeln!(stdin, "{request}").expect("write request");
    drop(stdin);

    let out = child.wait_with_output().expect("wait");
    assert!(out.status.success());
    let stdout = String::from_utf8(out.stdout).expect("utf8");
    let response: serde_json::Value =
        serde_json::from_str(stdout.lines().next().expect("one line")).expect("response JSON");
    assert_eq!(response["result"]["isError"], false);
    let diags: serde_json::Value = serde_json::from_str(
        response["result"]["content"][0]["text"]
            .as_str()
            .expect("text"),
    )
    .expect("diagnostics JSON");
    assert_eq!(diags["items"][0]["code"], "missing_data");
}
