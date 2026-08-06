//! `auto` column tracks: sized to the max-content of the cells placed in
//! them. The measurement runs BEFORE track sizing (an auto column cannot
//! be sized without knowing its cells), so these also pin the cell
//! pre-pass — most visibly that it does not double-report span clamps.

use crate::flex::container_body;

use super::rects;

/// One cell's text, then a full-cell rect whose x/w report where the
/// NEXT track starts and how wide it is.
fn auto_then_rect(columns: &str, first: &str) -> Vec<(f64, f64, f64, f64)> {
    let yaml = container_body(
        &format!("{{ x: 0, y: 0, w: 200, type: grid, columns: {columns} }}"),
        &format!(
            "- type: text\n  text: {first}\n\
             - type: rect\n  style: {{ borderWidth: 1 }}\n  box: {{ w: \"100%\", h: 10 }}"
        ),
    );
    rects(&yaml)
}

#[test]
fn an_auto_column_is_as_wide_as_its_cell_content() {
    // "MMMM" at the default 10pt face measures 39.19921875pt, so the auto
    // track takes exactly that and the `fr` track takes the rest of the
    // 200pt row. The two must still sum to the container.
    let r = auto_then_rect("[\"auto\", \"1fr\"]", "MMMM");
    assert_eq!(r[0].0, 39.19921875, "fr track starts after the auto track");
    assert_eq!(r[0].2, 160.80078125, "fr takes the remainder");
    assert_eq!(r[0].0 + r[0].2, 200.0, "tracks fill the container");
}

#[test]
fn auto_columns_with_different_content_get_different_widths() {
    // The discriminating pair: the same grid with a SHORTER string must
    // give the auto track a smaller width and the `fr` track more. A
    // fixture with two equal strings would pass on a stub that ignored
    // the content entirely.
    let wide = auto_then_rect("[\"auto\", \"1fr\"]", "MMMM");
    let narrow = auto_then_rect("[\"auto\", \"1fr\"]", "M");
    assert!(
        narrow[0].0 < wide[0].0,
        "narrower content -> narrower auto track: {} vs {}",
        narrow[0].0,
        wide[0].0
    );
    assert!(narrow[0].2 > wide[0].2, "and a wider fr track");
    assert_eq!(narrow[0].0 + narrow[0].2, 200.0);
}

#[test]
fn an_auto_column_wider_than_the_container_is_clamped() {
    // Content is measured with no container to bound it, so a long
    // unwrapped string can demand more than the whole grid. The track
    // takes what is there rather than running off the page, and the
    // content re-wraps inside it.
    let long = "M".repeat(400);
    let yaml = container_body(
        "{ x: 0, y: 0, w: 200, type: grid, columns: [\"auto\"] }",
        &format!(
            "- type: text\n  text: \"{long}\"\n\
             - type: rect\n  style: {{ borderWidth: 1 }}\n  box: {{ w: \"100%\", h: 10 }}"
        ),
    );
    let r = rects(&yaml);
    assert!(
        r[0].2 > 0.0 && r[0].2 <= 200.0,
        "auto track clamped into the container, got {}",
        r[0].2
    );
}

#[test]
fn an_auto_row_entry_is_the_implicit_auto_row() {
    // `auto` in a ROW list means what omitting the entry already means:
    // the row grows to its tallest child. Accepting the spelling keeps a
    // mixed list readable; it adds no machinery.
    let children = "- type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 25 }\n\
                    - type: rect\n  style: { borderWidth: 1 }\n  box: { w: \"100%\", h: 15 }";
    let spelled = container_body(
        "{ x: 0, y: 0, w: 100, h: 100, type: grid, columns: 1, rows: [\"auto\", \"auto\"] }",
        children,
    );
    let omitted = container_body(
        "{ x: 0, y: 0, w: 100, h: 100, type: grid, columns: 1 }",
        children,
    );
    assert_eq!(rects(&spelled), rects(&omitted));
}
