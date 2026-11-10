//! The transport harness: the frames it computes from the bytes, the
//! flags it sets, and a property failure it catches.

use super::*;

#[test]
fn the_settings_line_picks_the_cap() {
    assert_eq!(cap(b"cap=3"), 3);
    assert_eq!(cap(b" cap=256 "), 256);
    assert_eq!(cap(b"cap=0"), DEFAULT_CAP);
    assert_eq!(cap(b"cap=257"), DEFAULT_CAP);
    assert_eq!(cap(b"cap=x"), DEFAULT_CAP);
    assert_eq!(cap(b"\xff"), DEFAULT_CAP);
}

#[test]
fn the_expected_frames_split_strip_and_cap() {
    assert_eq!(expected(b"", 4), Vec::new());
    assert_eq!(
        expected(b"ab\r\r\n12345\n\xffz", 4),
        vec![
            Expected::Line("ab".into()),
            Expected::Oversized,
            Expected::Line("\u{fffd}z".into()),
        ]
    );
    assert_eq!(expected(b"\n", 4), vec![Expected::Line(String::new())]);
}

#[test]
fn an_input_without_a_newline_is_settings_only() {
    assert_eq!(frames(b"cap=3"), FramePaths::default());
}

#[test]
fn every_kind_of_line_sets_its_flag() {
    let long_method = format!("{{\"id\":6,\"method\":\"{}\"}}\n", "m".repeat(220));
    let input = concat!(
        "cap=256\n",
        "   \n",
        "not json\n",
        "[1]\n",
        "{\"id\":1}\n",
        "{\"jsonrpc\":\"2.0\"}\n",
        "{\"method\":\"ping\"}\n",
        "{\"id\":2,\"method\":\"no/such\"}\n",
        "{\"id\":3,\"method\":\"ping\"}\n",
        "{\"id\":4,\"method\":\"resources/read\",\"params\":{}}\n",
        "{\"id\":5,\"method\":\"tools/call\"}\n",
    )
    .to_owned()
        + &"0".repeat(300)
        + "\n"
        + &long_method;
    let paths = frames(input.as_bytes());
    assert_eq!(
        paths,
        FramePaths {
            line: true,
            oversized: true,
            parse_error: true,
            not_object: true,
            missing_method: true,
            notification: true,
            unknown_method: true,
            echo_clipped: true,
            result: true,
            method_error: true,
        }
    );
}

#[test]
fn a_blank_line_and_a_tool_call_set_only_the_line_flag() {
    // The harness answers neither a blank line nor a `tools/call`.
    let paths = frames(b"cap=256\n   \n{\"id\":5,\"method\":\"tools/call\"}\n");
    assert_eq!(
        paths,
        FramePaths {
            line: true,
            ..FramePaths::default()
        }
    );
    // An object with neither `id` nor `method` is a notification.
    assert!(frames(b"cap=256\n{}\n").notification);
}

#[test]
#[should_panic(expected = "an error carries another code")]
fn an_error_with_another_code_fails() {
    let response = serde_json::json!({ "id": null, "error": { "code": 1 } });
    assert_error(Some(&response), &Value::Null, PARSE_ERROR);
}
