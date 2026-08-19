//! The probe GD11 stands on: text drawn at a paint alpha of ZERO must
//! still reach the PDF as EXTRACTABLE text.
//!
//! krilla exposes no text rendering mode (0.8.2 is the latest release and
//! `Surface` has no `Tr` control), so an invisible-but-readable header row
//! cannot be built the way the PDF spec's mode 3 would do it. What both
//! backends DO already carry is a per-item paint alpha, and nothing in this
//! crate short-circuits a draw at 0 — but "nothing short-circuits it" is a
//! claim about our code, not about krilla's. These tests measure the actual
//! bytes.

use super::*;
use flate2::read::ZlibDecoder;
use std::io::Read;

/// Every Flate-compressed stream in the PDF, decompressed. Uncompressed
/// streams are skipped: krilla compresses content streams, and the ones that
/// fail to inflate are the raw binary payloads (fonts, images).
fn content_streams(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let mut cursor = 0usize;
    while let Some(start) = find(&bytes[cursor..], b"stream") {
        let mut at = cursor + start + b"stream".len();
        // The keyword is followed by CRLF or LF.
        if bytes.get(at) == Some(&b'\r') {
            at += 1;
        }
        if bytes.get(at) == Some(&b'\n') {
            at += 1;
        }
        let Some(end) = find(&bytes[at..], b"endstream") else {
            break;
        };
        let raw = &bytes[at..at + end];
        let mut buf = Vec::new();
        if ZlibDecoder::new(raw).read_to_end(&mut buf).is_ok() {
            out.push(buf);
        }
        // Past the whole `endstream` keyword: `find` for "stream" would
        // otherwise match INSIDE it and desynchronize the scan (which is
        // exactly how the first cut of this helper reported zero text
        // operators for an ordinary opaque render).
        cursor = at + end + b"endstream".len();
    }
    out
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    find(haystack, needle).is_some()
}

/// A one-text-item page at the given opacity.
fn render_at(opacity: &str) -> Vec<u8> {
    render_template(
        &format!(
            r##"
page: {{ margin: 0 }}
sections:
  body:
    type: flow
    box: {{ x: 25, y: 100, w: 500, h: 600 }}
    items:
      - type: text
        box: {{ w: 400 }}
        text: "Quantity"
        style: {{ fontSize: 14, opacity: {opacity} }}
"##
        ),
        json!({}),
    )
}

#[test]
fn zero_opacity_text_still_reaches_the_content_stream() {
    let invisible = render_at("0");
    let streams = content_streams(&invisible);
    // Positive control FIRST: a decompressor that silently found nothing
    // would make every assertion below pass vacuously.
    assert!(
        !streams.is_empty(),
        "no Flate stream inflated — the probe is measuring nothing"
    );
    // The text-showing operator is what an extractor reads. `BT`/`ET` bracket
    // a text object; `Tf` selects the font; `TJ` shows the glyphs.
    let drawn = streams.iter().any(|s| {
        contains(s, b"BT") && contains(s, b"Tf") && (contains(s, b"TJ") || contains(s, b"Tj"))
    });
    assert!(
        drawn,
        "a fully transparent fill dropped the glyphs — GD11 cannot ride paint alpha"
    );
}

#[test]
fn zero_opacity_is_expressed_as_a_ca_zero_graphics_state() {
    // krilla routes the alpha through an ExtGState, which it writes into an
    // object body uncompressed — so this is readable without inflating.
    let invisible = render_at("0");
    assert!(
        contains(&invisible, b"/ca 0>>") || contains(&invisible, b"/ca 0 "),
        "expected an ExtGState carrying a zero fill alpha"
    );
    // …and an opaque render must NOT carry one, or the assertion above would
    // pass for reasons unrelated to the opacity we authored.
    let opaque = render_at("1");
    assert!(
        !contains(&opaque, b"/ca 0>>"),
        "an opaque render should need no alpha graphics state"
    );
}

#[test]
fn zero_opacity_emits_the_same_text_operators_as_an_opaque_render() {
    // The strongest form of the claim: invisibility changes the PAINT, not
    // what the text layer says. Counting the text-showing operators pins that
    // the glyphs were not merely present but present in the same quantity.
    let count = |bytes: &[u8]| -> usize {
        content_streams(bytes)
            .iter()
            .map(|s| s.windows(2).filter(|w| *w == b"TJ" || *w == b"Tj").count())
            .sum()
    };
    let opaque = count(&render_at("1"));
    assert!(opaque > 0, "the opaque control drew no text");
    assert_eq!(count(&render_at("0")), opaque);
}
