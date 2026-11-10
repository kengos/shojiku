//! The echo bound the MCP fuzz harnesses share.

use super::{MAX_FIXED_TEXT, assert_bounded_echo};

#[test]
fn a_clipped_echo_passes() {
    let input = "x".repeat(300);
    assert_bounded_echo(
        &format!("no page `{}`", "x".repeat(200)),
        &input,
        MAX_FIXED_TEXT,
    );
}

#[test]
#[should_panic(expected = "echoes more than")]
fn a_whole_long_echo_fails() {
    let input = "x".repeat(2000);
    assert_bounded_echo(&format!("no page `{input}`"), &input, MAX_FIXED_TEXT);
}

#[test]
#[should_panic(expected = "the echo guard strips")]
fn a_control_character_fails() {
    assert_bounded_echo("bad\u{1b}[31m", "short", MAX_FIXED_TEXT);
}

#[test]
#[should_panic(expected = "echoes more than")]
fn an_echo_past_the_bound_of_one_sentence_fails() {
    let input = "x".repeat(201);
    assert_bounded_echo(&format!("unknown method: {input}"), &input, 16);
}
