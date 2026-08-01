//! Unit tests for the per-line placement notes (`［＃Ｎ字下げ］`,
//! `［＃地付き］`, `［＃地からＮ字上げ］`, `［＃中央］`): each form's parse,
//! the line-head restriction, one-per-line, and 0-cell rejection.

use super::seg;
use crate::ruby::*;

/// The placement recorded on a run at the head of its source line.
fn placed(text: &str, place: LinePlacement) -> RubySegment {
    RubySegment {
        placement: Some(place),
        ..seg(text, None)
    }
}

#[test]
fn indent_records_the_cell_count() {
    let (segs, warns) = parse_aozora_ruby("［＃２字下げ］題名");
    assert_eq!(segs, vec![placed("題名", LinePlacement::Indent(2))]);
    assert!(warns.is_empty());
}

#[test]
fn an_ascii_indent_count_is_accepted() {
    let (segs, _) = parse_aozora_ruby("［＃2字下げ］題名");
    assert_eq!(segs, vec![placed("題名", LinePlacement::Indent(2))]);
}

#[test]
fn flush_end_records_zero_raise() {
    let (segs, _) = parse_aozora_ruby("［＃地付き］著者");
    assert_eq!(
        segs,
        vec![placed("著者", LinePlacement::FlushEnd { raise: 0 })]
    );
}

#[test]
fn raise_records_the_cell_count() {
    let (segs, _) = parse_aozora_ruby("［＃地から２字上げ］著者");
    assert_eq!(
        segs,
        vec![placed("著者", LinePlacement::FlushEnd { raise: 2 })]
    );
}

#[test]
fn center_records_the_placement() {
    let (segs, _) = parse_aozora_ruby("［＃中央］題名");
    assert_eq!(segs, vec![placed("題名", LinePlacement::Center)]);
}

#[test]
fn a_placement_governs_every_segment_on_its_line() {
    // Ruby mid-line does not end the placement scope.
    let (segs, _) = parse_aozora_ruby("［＃中央］吾輩《わがはい》は");
    assert_eq!(
        segs,
        vec![
            RubySegment {
                placement: Some(LinePlacement::Center),
                ..seg("吾輩", Some("わがはい"))
            },
            placed("は", LinePlacement::Center),
        ]
    );
}

#[test]
fn a_placement_is_honored_after_a_newline() {
    let (segs, _) = parse_aozora_ruby("一行目\n［＃中央］二行目");
    assert_eq!(
        segs,
        vec![
            seg("一行目\n", None),
            placed("二行目", LinePlacement::Center)
        ]
    );
}

#[test]
fn a_placement_is_honored_after_a_sheet_break() {
    let (segs, _) = parse_aozora_ruby("表紙［＃改ページ］［＃中央］題名");
    assert_eq!(
        segs,
        vec![
            seg("表紙", None),
            RubySegment {
                sheet_break: true,
                ..placed("題名", LinePlacement::Center)
            },
        ]
    );
}

#[test]
fn a_placement_resets_at_the_next_line() {
    let (segs, _) = parse_aozora_ruby("［＃中央］題名\n著者");
    assert_eq!(
        segs,
        vec![placed("題名\n", LinePlacement::Center), seg("著者", None)]
    );
}

#[test]
fn a_mid_line_placement_renders_literally_and_warns() {
    let (segs, warns) = parse_aozora_ruby("本文［＃中央］の途中");
    assert_eq!(segs, vec![seg("本文［＃中央］の途中", None)]);
    assert_eq!(warns, vec![RubyWarning::PlacementNotAtLineHead]);
}

#[test]
fn a_second_placement_on_one_line_renders_literally_and_warns() {
    let (segs, warns) = parse_aozora_ruby("［＃中央］［＃２字下げ］題名");
    assert_eq!(
        segs,
        vec![placed("［＃２字下げ］題名", LinePlacement::Center)]
    );
    assert_eq!(warns, vec![RubyWarning::PlacementDuplicate]);
}

#[test]
fn a_zero_indent_renders_literally_and_warns() {
    let (segs, warns) = parse_aozora_ruby("［＃０字下げ］題名");
    assert_eq!(segs, vec![seg("［＃０字下げ］題名", None)]);
    assert_eq!(warns, vec![RubyWarning::PlacementZero]);
}

#[test]
fn a_zero_raise_renders_literally_and_warns() {
    // 地付き is how a plain end-flush is written; 地から０字上げ is a mistake.
    let (_, warns) = parse_aozora_ruby("［＃地から０字上げ］著者");
    assert_eq!(warns, vec![RubyWarning::PlacementZero]);
}

#[test]
fn a_two_digit_count_parses() {
    let (segs, _) = parse_aozora_ruby("［＃10字下げ］深い");
    assert_eq!(segs, vec![placed("深い", LinePlacement::Indent(10))]);
}

#[test]
fn a_placement_before_a_span_governs_the_block_row() {
    let (segs, _) = parse_aozora_ruby("題［＃「題」は大書き］");
    let (segs2, _) = parse_aozora_ruby("［＃中央］題［＃「題」は大書き］");
    // Baseline has no placement; the combo records Center on the span.
    assert_eq!(segs[0].placement, None);
    assert_eq!(segs2[0].placement, Some(LinePlacement::Center));
    assert_eq!(segs2[0].scale, Some(2));
}
