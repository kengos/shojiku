//! Unit tests for the id-addressable resolved-box sidecar.

use super::*;

#[test]
fn serializes_flat_rects_and_shifts_both_boxes() {
    let placed = PlacedBox {
        path: "sections.body.items[0]".to_string(),
        id: Some("total".to_string()),
        border: BoxRect {
            x: 10.0,
            y: 20.0,
            w: 100.0,
            h: 30.0,
        },
        content: BoxRect {
            x: 15.0,
            y: 25.0,
            w: 90.0,
            h: 20.0,
        },
        text: None,
        hidden: false,
    };
    let shifted = placed.shifted(5.0);
    assert_eq!((shifted.border.y, shifted.content.y), (25.0, 30.0));
    assert_eq!((shifted.border.x, shifted.content.x), (10.0, 15.0));
    // The path and id ride along every translate.
    assert_eq!(shifted.path, "sections.body.items[0]");
    assert_eq!(shifted.id.as_deref(), Some("total"));

    let index = BoxIndex {
        pages: vec![translate_boxes(&[placed], 1.0)],
    };
    let json = serde_json::to_string(&index).expect("serialize");
    assert!(json.contains("\"path\":\"sections.body.items[0]\""));
    assert!(json.contains("\"id\":\"total\""));
    assert!(json.contains("\"border\":{\"x\":10.0"));
    assert!(json.contains("\"content\":{\"x\":15.0"));
    // A box with no text metrics omits the key entirely.
    assert!(!json.contains("\"text\""));
}

#[test]
fn id_less_box_carries_path_and_omits_the_id_key() {
    let placed = PlacedBox {
        path: "sections.body.items[2].columns[1]".to_string(),
        id: None,
        border: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 10.0,
            h: 10.0,
        },
        content: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 10.0,
            h: 10.0,
        },
        text: None,
        hidden: false,
    };
    let json = serde_json::to_string(&placed).expect("serialize");
    assert!(json.contains("\"path\":\"sections.body.items[2].columns[1]\""));
    // An id-less item omits the id key entirely (it is a skip-if-none
    // alias, not a required field).
    assert!(!json.contains("\"id\""));
    // The path survives a shift with the id still absent.
    assert_eq!(placed.shifted_x(4.0).id, None);
}

#[test]
fn text_metrics_shift_with_the_box_and_serialize_camelcase() {
    let placed = PlacedBox {
        path: "sections.body.items[1]".to_string(),
        id: Some("label".to_string()),
        border: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 40.0,
            h: 18.0,
        },
        content: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 40.0,
            h: 18.0,
        },
        text: Some(TextMetrics::Lines {
            lines: vec![LineMetric {
                x: 2.0,
                width: 30.0,
                baseline: 12.0,
                cap_top: 4.0,
                em_top: 2.0,
                em_bottom: 14.0,
            }],
        }),
        hidden: false,
    };
    // The accessors are variant-exact: lines Some, columns None.
    assert!(placed.text.as_ref().expect("text").columns().is_none());
    let down = placed.shifted(100.0);
    let line = down.text.as_ref().expect("text").lines().expect("lines")[0];
    assert_eq!(
        (line.baseline, line.cap_top, line.em_bottom),
        (112.0, 104.0, 114.0)
    );
    assert_eq!(line.x, 2.0); // vertical shift leaves x untouched
    let right = placed.shifted_x(5.0);
    let rline = right.text.as_ref().expect("text").lines().expect("lines")[0];
    assert_eq!(rline.x, 7.0);
    let json = serde_json::to_string(&placed).expect("serialize");
    assert!(json.contains("\"capTop\":4.0"));
    assert!(json.contains("\"emTop\":2.0"));
    assert!(json.contains("\"emBottom\":14.0"));
}

#[test]
fn vertical_column_metrics_shift_and_serialize_camelcase() {
    let placed = PlacedBox {
        path: "sections.body.items[0]".to_string(),
        id: None,
        border: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 40.0,
            h: 100.0,
        },
        content: BoxRect {
            x: 0.0,
            y: 0.0,
            w: 40.0,
            h: 100.0,
        },
        text: Some(TextMetrics::Columns {
            columns: vec![ColumnMetric {
                y: 2.0,
                height: 60.0,
                baseline: 35.0,
                em_left: 30.0,
                em_right: 40.0,
            }],
        }),
        hidden: false,
    };
    let metrics = placed.text.as_ref().expect("text");
    // The accessors are variant-exact: columns Some, lines None.
    assert!(metrics.columns().is_some());
    assert!(metrics.lines().is_none());
    let down = placed.shifted(10.0);
    let c = down.text.as_ref().expect("text").columns().expect("cols")[0];
    assert_eq!((c.y, c.baseline), (12.0, 35.0)); // dy moves y only
    let right = placed.shifted_x(5.0);
    let c = right.text.as_ref().expect("text").columns().expect("cols")[0];
    assert_eq!((c.baseline, c.em_left, c.em_right), (40.0, 35.0, 45.0));
    assert_eq!(c.y, 2.0); // dx leaves the down axis untouched
    let json = serde_json::to_string(&placed).expect("serialize");
    assert!(json.contains("\"columns\""));
    assert!(json.contains("\"emLeft\":30.0"));
    assert!(json.contains("\"emRight\":40.0"));
    assert!(!json.contains("\"lines\""));
}
