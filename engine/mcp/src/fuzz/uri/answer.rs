//! The `mcp_uri` reading of one URI through `resources/read` and the read
//! tool, and the assertions on the answer: contents, error code, and the
//! resource-not-found data.

use crate::resources;
use crate::rpc::{RESOURCE_NOT_FOUND, RpcError};
use serde_json::{Value, json};

/// One answer of `resources/read`: the result, or the error's code,
/// message and data.
pub(super) type Answer = Result<Value, (i64, String, Option<Value>)>;

/// Reads `target` through `resources/read`.
pub(super) fn read(target: &str) -> Answer {
    resources::read(&json!({ "uri": target })).map_err(
        |RpcError {
             code,
             message,
             data,
         }| (code, message, data),
    )
}

/// Asserts that the read tool answers `target` with the same contents, or
/// with the same message as an `isError` result.
pub(super) fn assert_tool_parity(target: &str, answer: &Answer) {
    let tool = crate::tools::read_tool(&json!({ "uri": target }))
        .expect("the read tool refused a string uri");
    match answer {
        Ok(result) => {
            assert_eq!(tool["isError"], false, "the read tool reported an error");
            let parts: Vec<&Value> = tool["content"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|part| &part["resource"])
                .collect();
            let items: Vec<&Value> = result["contents"]
                .as_array()
                .into_iter()
                .flatten()
                .collect();
            assert_eq!(parts, items, "the read tool returned other contents");
        }
        Err((_, message, _)) => {
            assert_eq!(tool["isError"], true, "the read tool reported no error");
            assert_eq!(
                tool["content"][0]["text"], *message,
                "the read tool returned another message"
            );
        }
    }
}

/// Asserts that `result` holds at least one content item and that every
/// item's `uri` passes `expected`.
pub(super) fn assert_contents(result: &Value, expected: impl Fn(&str) -> bool) {
    let items = result["contents"]
        .as_array()
        .expect("a read result has no contents");
    assert!(!items.is_empty(), "a read result has no content item");
    for item in items {
        let uri = item["uri"].as_str().expect("a content item has no uri");
        assert!(expected(uri), "a content item names another URI: {uri}");
    }
}

/// Asserts that `answer` is an error with `code`.
pub(super) fn assert_code(answer: &Answer, code: i64) {
    assert!(
        matches!(answer, Err((got, _, _)) if *got == code),
        "a URI was answered with contents or another code than {code}"
    );
}

/// Asserts that `answer` is resource not found, with a prefix of the URI
/// in its data.
pub(super) fn assert_not_found(answer: &Answer, target: &str) {
    let echoed = answer
        .as_ref()
        .err()
        .filter(|(code, _, _)| *code == RESOURCE_NOT_FOUND)
        .and_then(|(_, _, data)| data.as_ref())
        .and_then(|data| data["uri"].as_str());
    assert!(
        echoed.is_some_and(|echoed| target.starts_with(echoed)),
        "a URI was not answered with resource not found echoing it"
    );
}
