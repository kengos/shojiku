//! The `mcp_frames` frame model: the frames the frame reader reads from a
//! byte stream, and the frames the same bytes hold when split by hand.

use crate::rpc::{Frame, read_frame_capped};
use std::io::Cursor;

/// One frame the input bytes should produce.
#[derive(Debug, PartialEq)]
pub(super) enum Expected {
    /// A line within the cap, without its trailing `\r` bytes.
    Line(String),
    /// A line over the cap.
    Oversized,
}

/// Every frame `read_frame_capped` reads from `stream`, until end of
/// stream.
pub(super) fn read_all(stream: &[u8], cap: usize) -> Vec<Expected> {
    let mut reader = Cursor::new(stream);
    let mut out = Vec::new();
    loop {
        match read_frame_capped(&mut reader, cap).expect("a Cursor read cannot fail") {
            Frame::Eof => return out,
            Frame::Oversized => out.push(Expected::Oversized),
            Frame::Line(line) => out.push(Expected::Line(line)),
        }
        // Each frame consumes at least one byte, so a stream of n bytes
        // holds at most n frames before the end of stream.
        assert!(
            out.len() <= stream.len(),
            "the frame reader read more frames than the stream has bytes"
        );
    }
}

/// The frames `stream` holds: each run of bytes up to a `\n` (or to the
/// end of the stream, when not empty) is oversized when longer than `cap`,
/// and otherwise a line without its trailing `\r` bytes, decoded as UTF-8
/// with invalid sequences replaced.
pub(super) fn expected(stream: &[u8], cap: usize) -> Vec<Expected> {
    let mut out = Vec::new();
    let mut start = 0;
    while start < stream.len() {
        let end = stream[start..]
            .iter()
            .position(|b| *b == b'\n')
            .map_or(stream.len(), |at| start + at);
        let run = &stream[start..end];
        if run.len() > cap {
            out.push(Expected::Oversized);
        } else {
            let kept = run.len() - run.iter().rev().take_while(|b| **b == b'\r').count();
            out.push(Expected::Line(
                String::from_utf8_lossy(&run[..kept]).into_owned(),
            ));
        }
        start = end + 1;
    }
    out
}
