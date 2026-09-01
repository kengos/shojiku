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
    // Declared bare: this server implements resources/list + resources/read
    // and neither subscribe nor listChanged, which 2025-06-18 permits.
    assert_eq!(result["capabilities"]["resources"], serde_json::json!({}));
    assert_eq!(result["serverInfo"]["name"], "shojiku-mcp");
    assert_eq!(result["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
    // Clients feed this to the model as usage guidance — for a docker-only
    // agent it is the only text it sees before it starts authoring.
    let instructions = result["instructions"].as_str().expect("instructions");
    assert!(instructions.contains("templates.yml"));
    assert!(instructions.contains("list_examples"));
    assert!(instructions.contains("list_reference"));
}

#[test]
fn resources_are_listed_and_readable_over_the_loop() {
    let input = concat!(
        r#"{"jsonrpc":"2.0","id":1,"method":"resources/list"}"#,
        "\n",
        r#"{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"shojiku://example/presets/blank-a4"}}"#,
        "\n",
        r#"{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"shojiku://example/nope/nope"}}"#,
        "\n",
        r#"{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"shojiku://reference/box"}}"#,
        "\n",
    );
    let responses = talk(input);
    assert_eq!(responses.len(), 4);
    // Both families ride one listing: 34 bundled examples + 33 reference
    // pages.
    assert_eq!(
        responses[0]["result"]["resources"]
            .as_array()
            .expect("resources")
            .len(),
        67
    );
    assert_eq!(
        responses[1]["result"]["contents"]
            .as_array()
            .expect("contents")
            .len(),
        2
    );
    // The spec's resource-not-found code, with the requested URI in `data`.
    assert_eq!(responses[2]["error"]["code"], -32002);
    assert_eq!(
        responses[2]["error"]["data"]["uri"],
        "shojiku://example/nope/nope"
    );
    // The second family answers over the same loop: markdown then schema.
    let page = responses[3]["result"]["contents"]
        .as_array()
        .expect("contents");
    assert_eq!(page.len(), 2);
    assert_eq!(page[0]["mimeType"], "text/markdown");
    assert_eq!(page[1]["mimeType"], "application/schema+json");
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
