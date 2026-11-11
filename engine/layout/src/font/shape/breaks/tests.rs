//! Unit tests for the prefix widths [`safe_prefix_widths`] reports: every
//! listed width must be exactly the width `run_width` measures for the
//! prefix, and the cut points inside a segment follow the shaper's flags.

use super::*;
use crate::font::shape::{RunOptions, run_width};
use crate::font::test_support::ja_store;
use crate::fuzz::test_chain;

/// Asserts each listed `(offset, width)` equals `run_width` of the prefix
/// (bit for bit) and that offsets are ascending char boundaries.
fn assert_widths_match_run_width(chain: &[&FontFace], text: &str, letter_spacing: f64) {
    let known = safe_prefix_widths(chain, text, 10.0, letter_spacing);
    assert!(
        known.windows(2).all(|w| w[0].0 <= w[1].0),
        "offsets must ascend for {text:?}"
    );
    assert_eq!(known.last().map(|&(o, _)| o), Some(text.len()));
    for (offset, width) in known {
        let alone = run_width(
            chain,
            &text[..offset],
            10.0,
            RunOptions::spacing_only(letter_spacing),
        );
        assert_eq!(
            width.to_bits(),
            alone.to_bits(),
            "width of {:?} (spacing {letter_spacing})",
            &text[..offset]
        );
    }
}

#[test]
fn listed_widths_equal_the_width_of_the_prefix_shaped_alone() {
    let store = ja_store();
    let primary = store.get("biz-udp-gothic").unwrap();
    let fallback = store.get("ipamj-mincho").unwrap();
    // The fuzz font chain (`test_chain`) covers Latin with kerning and
    // ligatures, Japanese, Thai and Devanagari.
    let noto: Vec<&FontFace> = test_chain().iter().collect();
    let texts = [
        "あいうえお",
        "AVATAR To fi ffl Wa",
        "1234 あ 5",
        "e\u{301}e\u{301}x",
        "👨\u{200d}👩\u{200d}👧 a",
        "a𠮷b𠮷\u{10FFFF}\u{10FFFF}c",
        "مرحبا بالعالم",
        "AVA To Wa fi office",
        "ภาษาไทย क्षि 12ก",
        "111111あ111",
    ];
    for text in texts {
        for spacing in [0.0, -1.5, 2.0] {
            assert_widths_match_run_width(&[primary], text, spacing);
            assert_widths_match_run_width(&[primary, fallback], text, spacing);
            assert_widths_match_run_width(&noto, text, spacing);
        }
    }
}

#[test]
fn a_segment_no_face_covers_lists_every_char_end() {
    let store = ja_store();
    let face = store.face(None);
    let text = "\u{10FFFF}\u{10FFFF}\u{10FFFF}";
    let offsets: Vec<usize> = safe_prefix_widths(&[face], text, 10.0, 0.0)
        .into_iter()
        .map(|(offset, _)| offset)
        .collect();
    assert_eq!(offsets, vec![4, 8, 12]);
}

#[test]
fn an_empty_text_lists_nothing() {
    let store = ja_store();
    assert!(safe_prefix_widths(&[store.face(None)], "", 10.0, 0.0).is_empty());
}

#[test]
fn a_cut_inside_a_cluster_is_not_listed() {
    let store = ja_store();
    let face = store.face(None);
    // "e" + combining acute is one cluster: the offset between them
    // (2) must not be listed.
    let known = safe_prefix_widths(&[face], "ae\u{301}b", 10.0, 0.0);
    assert!(known.iter().all(|&(offset, _)| offset != 2));
}

#[test]
fn the_script_deciding_char_ends_the_unsafe_prefix_region() {
    // Common chars never decide the script; the first letter does.
    assert_eq!(script_decided_end("12-あ"), Some("12-あ".len()));
    assert_eq!(script_decided_end("1a"), Some(2));
    assert_eq!(script_decided_end("123 !"), None);
    assert_eq!(script_decided_end(""), None);
}

/// The offsets of `text` listed by `safe_prefix_widths` over the Noto face.
fn noto_offsets(text: &str) -> Vec<usize> {
    let noto: Vec<&FontFace> = test_chain().iter().collect();
    safe_prefix_widths(&noto, text, 10.0, 0.0)
        .into_iter()
        .map(|(offset, _)| offset)
        .collect()
}

#[test]
fn a_cut_between_kerned_letters_is_not_listed() {
    // Noto Sans kerns "AV" and "VA": harfrust flags both cuts as unsafe, so
    // only the end of the text is listed.
    assert_eq!(noto_offsets("AVA"), vec![3]);
    // Without a kerning pair every cut is listed.
    assert_eq!(noto_offsets("AxA"), vec![1, 2, 3]);
}

#[test]
fn a_cut_inside_a_ligature_is_not_listed() {
    // "ffi" and "fi" form ligatures in Noto Sans: no cut inside them.
    assert_eq!(noto_offsets("office"), vec![1, 4, 5, 6]);
}

#[test]
fn cuts_among_the_leading_common_chars_are_listed() {
    let store = ja_store();
    let face = store.face(None);
    // "111" are Common and "あ" decides the script, so the cuts after the
    // first and second "1" are listed through the separate shaping of the
    // Common chars, and the cut after the third "1" is the end of the Common chars.
    let offsets: Vec<usize> = safe_prefix_widths(&[face], "111あい", 10.0, 0.0)
        .into_iter()
        .map(|(offset, _)| offset)
        .collect();
    assert_eq!(offsets, vec![1, 2, 3, 6, 9]);
}
