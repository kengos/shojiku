//! Unit tests for the pure ruby helpers: joined-range → line mapping,
//! proportional reading splits, the cell-range extent guard, and the
//! entry-matching skeleton both axis appliers share.

use shojiku_core::RubyPair;
use shojiku_diagnostics::{DiagnosticCode as Code, Diagnostics};

use super::{locate, match_entries, push_ruby_items, slice_extent, split_reading, Cell};
use crate::tree::{ClipShape, LayoutItem, RectShape};

fn cell(at: f64, advance: f64, source: std::ops::Range<usize>) -> Cell {
    Cell {
        source,
        at,
        advance,
        size: 10.0,
        top: 0.0,
    }
}

fn lines(texts: &[&str]) -> Vec<String> {
    texts.iter().map(|s| s.to_string()).collect()
}

#[test]
fn locate_maps_a_range_within_one_line() {
    let slices = locate(&lines(&["abc", "def"]), 1..3);
    assert_eq!(slices.len(), 1);
    assert_eq!(slices[0].line, 0);
    assert_eq!(slices[0].range, 1..3);
}

#[test]
fn locate_splits_a_range_across_lines() {
    // Multibyte: each kana is 3 bytes; the range crosses the boundary.
    let slices = locate(&lines(&["わが", "はい"]), 3..9);
    assert_eq!(slices.len(), 2);
    assert_eq!((slices[0].line, slices[0].range.clone()), (0, 3..6));
    assert_eq!((slices[1].line, slices[1].range.clone()), (1, 0..3));
}

#[test]
fn locate_ignores_lines_outside_the_range() {
    let slices = locate(&lines(&["ab", "cd", "ef"]), 4..6);
    assert_eq!(slices.len(), 1);
    assert_eq!(slices[0].line, 2);
}

#[test]
fn split_reading_is_proportional_by_weight() {
    // A 3+1 base split gets 3/4 then 1/4 of a 4-char reading.
    let parts = split_reading("わがはい", &[3, 1]);
    assert_eq!(parts, vec!["わがは".to_string(), "い".to_string()]);
}

#[test]
fn split_reading_single_weight_takes_everything() {
    assert_eq!(split_reading("ねこ", &[2]), vec!["ねこ".to_string()]);
}

#[test]
fn split_reading_zero_total_yields_empty_slices() {
    assert_eq!(
        split_reading("よみ", &[0, 0]),
        vec![String::new(), String::new()]
    );
}

#[test]
fn slice_extent_spans_intersecting_cells() {
    let cells = vec![
        cell(0.0, 10.0, 0..3),
        cell(10.0, 12.0, 3..6),
        cell(22.0, 10.0, 6..9),
    ];
    // The middle two cells: starts at 10, ends at 32.
    let se = slice_extent(&cells, &(3..9)).unwrap();
    assert!((se.at - 10.0).abs() < 1e-9);
    assert!((se.extent - 22.0).abs() < 1e-9);
    assert!((se.size - 10.0).abs() < 1e-9);
}

#[test]
fn slice_extent_none_when_nothing_intersects() {
    let cells = vec![cell(0.0, 10.0, 0..3)];
    assert!(slice_extent(&cells, &(5..8)).is_none());
}

#[test]
fn slice_extent_first_cell_carries_placement_fields() {
    let mut second = cell(10.0, 10.0, 3..6);
    second.size = 20.0;
    second.top = 5.0;
    let cells = vec![cell(0.0, 10.0, 0..3), second];
    // The slice covers both cells; placement rides the FIRST (lowest
    // `at`) intersecting cell's run.
    let se = slice_extent(&cells, &(0..6)).unwrap();
    assert!((se.size - 10.0).abs() < 1e-9);
    assert!((se.top - 0.0).abs() < 1e-9);
}

#[test]
fn match_entries_matches_in_order_non_overlapping() {
    let texts = lines(&["ab", "ab"]);
    let ruby = vec![
        RubyPair {
            base: "ab".into(),
            text: "x".into(),
        },
        RubyPair {
            base: "ab".into(),
            text: "y".into(),
        },
    ];
    let mut diags = Diagnostics::default();
    let ms = match_entries(&texts, &ruby, &mut diags);
    assert_eq!(ms.len(), 2);
    assert_eq!((ms[0].line, ms[0].reading.as_str()), (0, "x"));
    assert_eq!((ms[1].line, ms[1].reading.as_str()), (1, "y"));
    assert!(diags.items.is_empty());
}

#[test]
fn match_entries_warns_unmatched_and_skips_malformed() {
    let texts = lines(&["abc"]);
    let ruby = vec![
        RubyPair {
            base: String::new(),
            text: "x".into(),
        },
        RubyPair {
            base: "zz".into(),
            text: "y".into(),
        },
    ];
    let mut diags = Diagnostics::default();
    let ms = match_entries(&texts, &ruby, &mut diags);
    assert!(ms.is_empty());
    assert_eq!(diags.items.len(), 1);
    assert_eq!(diags.items[0].code, Code::RubyBaseNotFound);
}

#[test]
fn push_ruby_items_lands_inside_a_clip_wrapper() {
    let clip = LayoutItem::Clip(ClipShape {
        x: 0.0,
        y: 0.0,
        w: 10.0,
        h: 10.0,
        items: Vec::new(),
        ..Default::default()
    });
    let mut items = vec![clip];
    push_ruby_items(
        &mut items,
        vec![LayoutItem::Rect(RectShape {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
            stroke: None,
            stroke_width: 0.0,
            fill: None,
            opacity: 1.0,
            ..Default::default()
        })],
    );
    assert_eq!(items.len(), 1);
    let LayoutItem::Clip(c) = &items[0] else {
        panic!("clip survives");
    };
    assert_eq!(c.items.len(), 1);
}

#[test]
fn push_ruby_items_appends_without_a_clip() {
    let mut items = Vec::new();
    push_ruby_items(&mut items, Vec::new());
    assert!(items.is_empty());
}
