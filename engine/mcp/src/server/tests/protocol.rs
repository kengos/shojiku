//! Protocol-error mapping and loop survival under hostile frames.

use super::talk;
use crate::rpc::MAX_LINE;

const PING: &str = r#"{"jsonrpc":"2.0","id":9,"method":"ping"}"#;

#[test]
fn malformed_json_is_a_parse_error_and_the_loop_survives() {
    let responses = talk(&format!("{{oops\n{PING}\n"));
    assert_eq!(responses.len(), 2);
    assert!(responses[0]["id"].is_null());
    assert_eq!(responses[0]["error"]["code"], -32700);
    assert_eq!(responses[1]["id"], 9);
}

#[test]
fn non_object_requests_are_invalid() {
    let responses = talk("[1,2]\n");
    assert_eq!(responses[0]["error"]["code"], -32600);
}

#[test]
fn missing_method_with_id_is_invalid_and_silent_without_one() {
    let responses = talk(r#"{"jsonrpc":"2.0","id":1}"#);
    assert_eq!(responses[0]["error"]["code"], -32600);
    assert!(talk(r#"{"jsonrpc":"2.0"}"#).is_empty());
}

#[test]
fn unknown_method_is_method_not_found_with_a_bounded_echo() {
    let hostile = format!("x{}\u{7}", "y".repeat(400));
    // Built via `json!` so the control char arrives ESCAPED (valid JSON):
    // the method name itself carries the BEL, not the frame.
    let request = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": hostile }).to_string();
    let responses = talk(&request);
    assert_eq!(responses[0]["error"]["code"], -32601);
    let message = responses[0]["error"]["message"].as_str().expect("message");
    assert!(message.len() < 250, "unbounded echo: {}", message.len());
    assert!(!message.contains('\u{7}'), "control char echoed");
}

#[test]
fn unknown_notifications_are_ignored() {
    assert!(talk(r#"{"jsonrpc":"2.0","method":"notifications/cancelled"}"#).is_empty());
}

#[test]
fn string_ids_echo_back() {
    let responses = talk(r#"{"jsonrpc":"2.0","id":"abc","method":"ping"}"#);
    assert_eq!(responses[0]["id"], "abc");
}

#[test]
fn oversized_lines_are_answered_and_the_loop_survives() {
    let mut input = "x".repeat(MAX_LINE + 10);
    input.push('\n');
    input.push_str(PING);
    input.push('\n');
    let responses = talk(&input);
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["error"]["code"], -32700);
    assert!(responses[0]["error"]["message"]
        .as_str()
        .expect("message")
        .contains("1 MiB"));
    assert_eq!(responses[1]["id"], 9);
}

#[test]
fn tool_protocol_errors_reach_the_wire() {
    let responses = talk(r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{}}"#);
    assert_eq!(responses[0]["id"], 4);
    assert_eq!(responses[0]["error"]["code"], -32602);
}

#[test]
fn blank_lines_are_skipped() {
    let responses = talk(&format!("\n  \n{PING}\n"));
    assert_eq!(responses.len(), 1);
}
