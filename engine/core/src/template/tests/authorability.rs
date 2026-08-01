//! AA-batch tests: `version:` scalar forms (AA1), the deny-unknown /
//! no-injected-serialization sweep (AA2) — every wire struct rejects a
//! typo'd key, and a minimal template round-trips byte-lean.

use super::*;

#[test]
fn version_accepts_number_and_string_and_round_trips_as_authored() {
    // AA1: `version: 1` failed every file in the external acceptance run.
    let n: Template = parse_template("version: 1\nsections:\n  body: { type: absolute }\n")
        .expect("number version");
    assert_eq!(n.version, Some(Version::Number(1.0)));
    let f: Template = parse_template("version: 1.5\nsections:\n  body: { type: absolute }\n")
        .expect("float version");
    assert_eq!(f.version, Some(Version::Number(1.5)));
    let s: Template = parse_template("version: \"2.0\"\nsections:\n  body: { type: absolute }\n")
        .expect("string version");
    assert_eq!(s.version, Some(Version::Text("2.0".to_string())));
    // Authored form survives serialization: numbers stay numbers,
    // strings stay strings.
    let out = serde_yaml::to_string(&n).expect("yaml");
    assert!(out.contains("version: 1"), "got: {out}");
    assert!(!out.contains("version: '1'"), "got: {out}");
    let out = serde_yaml::to_string(&s).expect("yaml");
    assert!(out.contains("version: '2.0'"), "got: {out}");
}

#[test]
fn minimal_template_serializes_without_injected_keys() {
    // AA2: the round-trip is byte-lean — nothing the author didn't write
    // appears (no `null`s, no injected defaults). This is the sweep's
    // one-glance regression net.
    let tpl = parse_template(
        r#"
sections:
  body:
    type: flow
    items:
      - type: text
        text: hello
      - type: rect
        box: { x: 0, y: 0, w: 10, h: 10 }
      - type: line
        from: { x: 0, y: 0 }
        to: { x: 10, y: 0 }
      - type: image
        box: { w: 10, h: 10 }
        src: logo.svg
      - type: qr_code
        box: { w: 20, h: 20 }
        text: t
      - type: page_break
      - type: repeat
        data: { key: rows }
        cell:
          items: []
"#,
    )
    .expect("parse");
    let yaml = serde_yaml::to_string(&tpl).expect("yaml");
    assert!(!yaml.contains("null"), "injected null: {yaml}");
    for injected in [
        "version:",
        "name:",
        "page:",
        "gap:",
        "repeat:", // Band repeat (no bands here) — also matches nothing else
        "fit:",    // image default
        "errorCorrection:",
        "format:", // binding/page_number defaults
        "grid:",   // all-default 1x1 grid
        "direction:",
        "columns:",
        "rows:",
        "style:", // default RectStyle/LineStyle must not serialize
        "styleNames:",
        "header:",
        "footer:",
        "height:",
        "id:",
    ] {
        assert!(!yaml.contains(injected), "injected `{injected}`: {yaml}");
    }
    // And it re-parses to the same structure.
    let back = parse_template(&yaml).expect("reparse");
    assert_eq!(serde_yaml::to_string(&back).expect("yaml"), yaml);
}

#[test]
fn every_wire_struct_rejects_unknown_keys() {
    // AA2: a typo'd key anywhere is a parse error, never a silent no-op.
    // One probe per struct, each with a plausible author mistake.
    let cases: &[(&str, &str)] = &[
        ("Template", "sections: { body: { type: absolute } }\nbogus: 1\n"),
        ("Sections", "sections: { body: { type: absolute }, sidebar: {} }\n"),
        (
            "Band",
            "sections:\n  header: { hight: 20 }\n  body: { type: absolute }\n",
        ),
        (
            "FlowBody",
            "sections:\n  body: { type: flow, gaps: 4 }\n",
        ),
        (
            "AbsoluteBody",
            "sections:\n  body: { type: absolute, gap: 4 }\n",
        ),
        (
            "TextItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: text, text: t, alin: left } ]\n",
        ),
        (
            "Binding",
            "sections:\n  body:\n    type: flow\n    items: [ { type: text, data: { key: k, fromat: date } } ]\n",
        ),
        (
            "RectItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: rect, box: { x: 0, y: 0, w: 1, h: 1 }, styl: {} } ]\n",
        ),
        (
            // rect converged onto the unified Style: the RETIRED
            // `fillColor` spelling is the plausible author mistake now
            // (`backgroundColor` is the accepted key).
            "Style-on-rect",
            "sections:\n  body:\n    type: flow\n    items: [ { type: rect, box: { x: 0, y: 0, w: 1, h: 1 }, style: { fillColor: '#fff' } } ]\n",
        ),
        (
            "LineItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: line, from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, w: 2 } ]\n",
        ),
        (
            "LineStyle",
            "sections:\n  body:\n    type: flow\n    items: [ { type: line, from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, style: { borderWidth: 2 } } ]\n",
        ),
        (
            "PointSpec",
            "sections:\n  body:\n    type: flow\n    items: [ { type: line, from: { x: 0, y: 0, z: 1 }, to: { x: 1, y: 0 } } ]\n",
        ),
        (
            "ImageItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: image, box: { w: 1, h: 1 }, source: a.png } ]\n",
        ),
        (
            "QrCodeItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: qr_code, box: { w: 1, h: 1 }, text: t, level: high } ]\n",
        ),
        (
            "ListItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: list, data: { key: k }, overflow: x } ]\n",
        ),
        (
            "PageBreakItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: page_break, force: true } ]\n",
        ),
        (
            "PageNumberItem",
            "sections:\n  header:\n    items: [ { type: page_number, fromat: '{page}' } ]\n  body: { type: absolute }\n",
        ),
        (
            "ContainerItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: container, childs: [] } ]\n",
        ),
        (
            "RepeatItem",
            "sections:\n  body:\n    type: flow\n    items: [ { type: repeat, data: { key: k }, cells: {} } ]\n",
        ),
        (
            "GridSpec",
            "sections:\n  body:\n    type: flow\n    items: [ { type: repeat, data: { key: k }, grid: { cols: 2 }, cell: { items: [] } } ]\n",
        ),
        (
            "BoxSpec",
            "sections:\n  body:\n    type: flow\n    box: { x: 0, y: 0, w: 1, h: 1, gap: 3 }\n",
        ),
        ("PageSpec", "page: { margins: 10 }\nsections: { body: { type: absolute } }\n"),
    ];
    for (name, yaml) in cases {
        let err = parse_template(yaml).expect_err(&format!("{name} must reject"));
        assert!(
            err.to_string().contains("unknown"),
            "{name}: expected unknown-field error, got: {err}"
        );
    }
}
