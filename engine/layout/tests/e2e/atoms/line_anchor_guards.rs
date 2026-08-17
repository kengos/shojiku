//! Hostile input reaching the anchor resolver: the echoed id, the cost of
//! resolution, self-reference, cycles, and non-finite offsets.
//!
//! Every one of these is reachable from a template alone — the resolver
//! reads authored ids and authored numbers and writes coordinates straight
//! into the PDF.

use crate::common::*;

/// S1 — the id is echoed into three diagnostics, so hostile text in it
/// must not reach a reader's terminal. Two layers, asserted separately
/// because they fail differently.
#[test]
fn a_control_byte_in_an_id_never_gets_as_far_as_the_resolver() {
    // The wire refuses it outright, which is stronger than sanitizing.
    let yaml = format!(
        "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
         sections:\n  body:\n    type: absolute\n    items:\n      \
         - {{ type: line, from: {{ x: 0, y: 0 }}, to: {{ item: \"a{}b\" }} }}\n",
        '\u{0007}'
    );
    assert!(parse_template(&yaml).is_err(), "a BEL must not parse");
}

#[test]
fn a_bidi_override_in_an_id_is_sanitized_out_of_the_diagnostic() {
    // U+202E is not a control character, so it parses — and then has to
    // be stripped where it would otherwise reverse the rest of the line
    // in a terminal.
    let (_, diags) = run(
        &format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: line, from: {{ x: 0, y: 0 }}, to: {{ item: \"a{}b\" }} }}\n",
            '\u{202E}'
        ),
        json!({}),
    );
    let d = diags
        .iter()
        .find(|d| d.code == "anchor_unknown_target")
        .expect("must warn");
    assert!(
        !d.message.contains('\u{202E}'),
        "a bidi override reached the message: {:?}",
        d.message
    );
}

/// S2 — resolution must not be O(anchors × boxes). The proof that matters
/// to a caller is termination within the walk's own bound, so this is a
/// SIZE case: many anchors over many placements still completes and still
/// resolves correctly.
#[test]
fn many_anchors_over_many_placements_still_resolve() {
    let mut items = String::new();
    for i in 0..60 {
        items.push_str(&format!(
            "      - {{ type: rect, id: t{i}, box: {{ x: 0, y: {}, w: 10, h: 4 }}, \
             style: {{ borderWidth: 1 }} }}\n",
            i * 5
        ));
        items.push_str(&format!(
            "      - {{ type: line, from: {{ x: 0, y: 0 }}, to: {{ item: t{i} }} }}\n"
        ));
    }
    let (doc, diags) = run(
        &format!(
            "page: {{ size: {{ w: 200, h: 400 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n{items}"
        ),
        json!({}),
    );
    assert_eq!(line_shapes(&doc.pages[0]).len(), 60);
    assert!(diags.is_empty(), "{diags:?}");
}

/// S3 — a line anchored to its OWN id resolves to nothing rather than
/// hanging: its placement is written by the drain, so it is absent from
/// the index the drain reads.
#[test]
fn a_self_anchored_line_resolves_to_nothing() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: line, id: loop, from: { x: 0, y: 0 }, to: { item: loop } }
"#,
        json!({}),
    );
    assert!(line_shapes(&doc.pages[0]).is_empty());
    assert!(diags.iter().any(|d| d.code == "anchor_unknown_target"));
}

/// S4 — an A→B, B→A cycle is impossible by construction (resolution is
/// read-only over finished layout). Pinned anyway: "impossible by
/// construction" is exactly the claim that rots.
#[test]
fn a_two_line_anchor_cycle_terminates_and_draws_neither() {
    let (doc, diags) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: line, id: a, from: { x: 0, y: 0 }, to: { item: b } }
      - { type: line, id: b, from: { x: 0, y: 0 }, to: { item: a } }
"#,
        json!({}),
    );
    assert!(line_shapes(&doc.pages[0]).is_empty());
    assert_eq!(
        diags
            .iter()
            .filter(|d| d.code == "anchor_unknown_target")
            .count(),
        2,
        "each line warns for its own unresolvable target"
    );
}

/// S5 — a hostile `offset` must not put a non-finite coordinate in the
/// tree. `Length`-free numbers still go through the wire's own finiteness
/// guard, so `.inf` / `.nan` are refused at parse rather than clamped.
#[test]
fn a_non_finite_offset_never_reaches_the_tree() {
    for bad in [".inf", "-.inf", ".nan"] {
        let yaml = format!(
            "page: {{ size: {{ w: 200, h: 200 }}, margin: 0 }}\n\
             sections:\n  body:\n    type: absolute\n    items:\n      \
             - {{ type: rect, id: t, box: {{ x: 0, y: 0, w: 10, h: 10 }}, \
             style: {{ borderWidth: 1 }} }}\n      \
             - {{ type: line, from: {{ x: 0, y: 0 }}, \
             to: {{ item: t, offset: {{ x: {bad} }} }} }}\n"
        );
        match parse_template(&yaml) {
            // Refused at the wire: the strongest outcome.
            Err(_) => {}
            Ok(_) => {
                let (doc, _) = run(&yaml, json!({}));
                for l in line_shapes(&doc.pages[0]) {
                    assert!(
                        l.x1.is_finite()
                            && l.y1.is_finite()
                            && l.x2.is_finite()
                            && l.y2.is_finite(),
                        "`{bad}` reached the tree: {l:?}"
                    );
                }
            }
        }
    }
}

/// A huge but finite offset stays finite in the tree — the coordinate is
/// what a renderer will consume, so "finite" is the whole guarantee.
#[test]
fn an_enormous_offset_stays_finite() {
    let (doc, _) = run(
        r#"
page: { size: { w: 200, h: 200 }, margin: 0 }
sections:
  body:
    type: absolute
    items:
      - { type: rect, id: t, box: { x: 0, y: 0, w: 10, h: 10 }, style: { borderWidth: 1 } }
      - { type: line, from: { x: 0, y: 0 }, to: { item: t, offset: { x: 1e300, y: 1e300 } } }
"#,
        json!({}),
    );
    for l in line_shapes(&doc.pages[0]) {
        assert!(l.x2.is_finite() && l.y2.is_finite(), "{l:?}");
    }
}
