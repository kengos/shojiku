//! The initialize handshake: version negotiation, server identity, and
//! the notification/ping lifecycle.

use super::talk;

#[test]
fn initialize_negotiates_and_identifies_the_server() {
    let responses = talk(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}"#,
    );
    assert_eq!(responses.len(), 1);
    let result = &responses[0]["result"];
    assert_eq!(responses[0]["id"], 1);
    assert_eq!(result["protocolVersion"], "2025-06-18");
    assert!(result["capabilities"]["tools"].is_object());
    assert_eq!(result["serverInfo"]["name"], "shojiku-mcp");
    assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
}

#[test]
fn unsupported_or_missing_protocol_revision_gets_our_newest() {
    // 2025-03-26 is NOT advertised: that revision mandates receiving
    // JSON-RPC batches, which this loop rejects (removed in 2025-06-18).
    for request in [
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}"#,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}"#,
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#,
    ] {
        let responses = talk(request);
        assert_eq!(responses[0]["result"]["protocolVersion"], "2025-06-18");
    }
}

#[test]
fn initialized_notification_is_silent_and_the_session_continues() {
    let input = concat!(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#,
        "\n",
        r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
        "\n",
        r#"{"jsonrpc":"2.0","id":2,"method":"ping"}"#,
        "\n",
    );
    let responses = talk(input);
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[1]["id"], 2);
    assert_eq!(responses[1]["result"], serde_json::json!({}));
}
