//! Max-content (intrinsic) width measurement, driven from templates: the
//! `flexBasis: content` spelling, which kinds have a defined intrinsic
//! width and which fall back to a share, and the hostile inputs the walk
//! has to survive without a stack or a NaN.
//!
//! Every width here is asserted NUMERICALLY. "It renders without errors"
//! passes just as happily on `NaN` and `inf`, which is exactly what a
//! measurement walk over untrusted templates produces when it goes wrong.

use crate::common::*;

/// A fixed-pitch row: in `biz-ud-gothic` every FULL-WIDTH glyph is
/// exactly 1em, so a content width is `chars × fontSize` and a golden
/// reads instead of being a magic number. Hence the kana throughout —
/// Latin in the same face is half-width, and the default face is
/// proportional, either of which makes every number here wrong in a way
/// that looks like a code bug.
fn row(row_box: &str, children: &str) -> Vec<(f64, f64)> {
    row_with(row_box, children, json!({}))
}

/// [`row`] with template params, for the kinds that only lay out with
/// data behind them.
fn row_with(row_box: &str, children: &str, params: serde_json::Value) -> Vec<(f64, f64)> {
    let yaml = format!(
        "page: {{ margin: 0 }}\ndefaults: {{ style: {{ fontFamily: biz-ud-gothic, fontSize: 10, lineHeight: 1.2 }} }}\n\
         sections:\n  body:\n    type: absolute\n    items:\n      - type: container\n        box: {row_box}\n        items:\n{}",
        children
            .lines()
            .map(|l| format!("          {l}\n"))
            .collect::<String>()
    );
    let (doc, diags) = run(&yaml, params);
    assert!(!diags.has_errors(), "{diags:?}");
    rect_shapes(&doc.pages[0])
        .iter()
        .map(|r| (r.x, r.w))
        .collect()
}

/// Two bordered containers in a 200pt row, the first wrapping `inner`.
/// Its border rect reports the width the measurement gave it.
fn probe(first: &str) -> Vec<(f64, f64)> {
    row(
        "{ x: 0, y: 0, w: 200, h: 40, direction: row }",
        &format!(
            "{first}\n- type: container\n  box: {{ h: 20, flexGrow: 1 }}\n  style: {{ borderWidth: 1 }}\n  items:\n    - type: text\n      text: ん"
        ),
    )
}

mod hostile;
mod kinds;
