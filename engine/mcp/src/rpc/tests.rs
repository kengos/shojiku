//! Framing bounds, response builders, and the echo clip.

use super::*;
use std::io::Cursor;

#[test]
fn reads_lines_stripping_newlines_then_eof() {
    let mut input = Cursor::new(b"one\ntwo\r\n".to_vec());
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Line(l) if l == "one"));
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Line(l) if l == "two"));
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Eof));
}

#[test]
fn final_line_without_newline_is_still_a_line() {
    let mut input = Cursor::new(b"tail".to_vec());
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Line(l) if l == "tail"));
}

#[test]
fn exactly_max_line_is_accepted() {
    let mut data = vec![b'x'; MAX_LINE];
    data.push(b'\n');
    let mut input = Cursor::new(data);
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Line(l) if l.len() == MAX_LINE));
}

#[test]
fn oversized_line_is_drained_and_the_next_line_survives() {
    // Long enough that the drain loop needs more than one bounded chunk.
    let mut data = vec![b'x'; MAX_LINE * 2 + 100];
    data.push(b'\n');
    data.extend_from_slice(b"next\n");
    let mut input = Cursor::new(data);
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Oversized));
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Line(l) if l == "next"));
}

#[test]
fn oversized_line_at_eof_drains_cleanly() {
    let mut input = Cursor::new(vec![b'x'; MAX_LINE + 5]);
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Oversized));
    assert!(matches!(read_frame(&mut input).unwrap(), Frame::Eof));
}

#[test]
fn builders_shape_responses() {
    let ok = result_response(json!(1), json!({ "a": 1 }));
    assert_eq!(ok["jsonrpc"], "2.0");
    assert_eq!(ok["id"], 1);
    assert_eq!(ok["result"]["a"], 1);
    let err = error_response(Value::Null, PARSE_ERROR, "bad");
    assert!(err["id"].is_null());
    assert_eq!(err["error"]["code"], -32700);
    assert_eq!(err["error"]["message"], "bad");
}

#[test]
fn write_frame_emits_one_line_and_propagates_failures() {
    let mut out = Vec::new();
    write_frame(&mut out, &json!({ "x": "a\nb" })).expect("write");
    let text = String::from_utf8(out).expect("utf8");
    // The embedded newline is escaped; exactly one physical line.
    assert_eq!(text, "{\"x\":\"a\\nb\"}\n");

    struct FailingWriter;
    impl Write for FailingWriter {
        fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("pipe closed"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    assert!(write_frame(&mut FailingWriter, &json!({})).is_err());
}

#[test]
fn clip_strips_controls_and_bounds_length() {
    assert_eq!(clip("a\x1b[31mb\n"), "a[31mb");
    assert_eq!(clip(&"x".repeat(500)).len(), 200);
}
