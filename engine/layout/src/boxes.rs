//! Id-addressable resolved boxes: the GUI-facing sidecar the layout pass
//! emits alongside the renderer tree.
//!
//! The tree (`crate::tree`) is flattened draw primitives with no link
//! back to template items; the Designer needs per-item resolved geometry
//! to draw selection and margin/padding overlays without reimplementing
//! resolution. EVERY laid-out item gets one [`PlacedBox`] per placement
//! (a `repeat` cell child appears once per element; band items once per
//! page), addressed by a structural `path` in the validate-diagnostic
//! grammar — id-carrying or not, so the canvas can hit-test every item.
//! Renderers never read this — it is not part of the layout↔renderer
//! contract.

mod text;

pub use text::{ColumnMetric, LineMetric, TextMetrics};

use serde::Serialize;

/// A rectangle in absolute page coordinates (pt, top-left origin).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct BoxRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// One placement of a laid-out item: its structural address, border box
/// and content box (border minus padding — equal when the item has no
/// padding), plus per-line text metrics for text items (so the Designer
/// can snap overlays to the glyph band without re-measuring).
#[derive(Debug, Clone, Serialize)]
pub struct PlacedBox {
    /// Structural address of the source item in the validate-diagnostic
    /// path grammar (`sections.body.items[3].items[0]`, `…cell.items[1]`,
    /// `…columns[2]`). ALWAYS present — the GUI's primary key for
    /// correlating canvas geometry back to a YAML node. A single item
    /// produces one box per placement (per page, per repeat element), all
    /// sharing this path; the path is synthesized from structure only,
    /// never from authored ids or data keys.
    pub path: String,
    /// The item's authored `id:`, when it has one — a lookup alias; the
    /// `path` addresses every item, id-carrying or not.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub border: BoxRect,
    pub content: BoxRect,
    /// Present on text items: the baseline and cap/em band of each drawn
    /// line, in the same coordinates as `border`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<TextMetrics>,
}

impl PlacedBox {
    /// The placement shifted down by `dy` — the box analog of the item
    /// `translate` walk helper.
    pub(crate) fn shifted(&self, dy: f64) -> PlacedBox {
        let shift = |r: BoxRect| BoxRect { y: r.y + dy, ..r };
        PlacedBox {
            path: self.path.clone(),
            id: self.id.clone(),
            border: shift(self.border),
            content: shift(self.content),
            text: self.text.as_ref().map(|t| t.shifted(dy)),
        }
    }

    /// The placement shifted right by `dx` — the box analog of the item
    /// `translate_x` helper (flex cross/main placement).
    pub(crate) fn shifted_x(&self, dx: f64) -> PlacedBox {
        let shift = |r: BoxRect| BoxRect { x: r.x + dx, ..r };
        PlacedBox {
            path: self.path.clone(),
            id: self.id.clone(),
            border: shift(self.border),
            content: shift(self.content),
            text: self.text.as_ref().map(|t| t.shifted_x(dx)),
        }
    }
}

/// All placements, parallel to `LayoutDocument::pages` (`pages[i]` holds
/// the boxes drawn on page `i`, in walk order).
#[derive(Debug, Clone, Default, Serialize)]
pub struct BoxIndex {
    pub pages: Vec<Vec<PlacedBox>>,
}

/// Shifts a slice of placements by `dy` (companion to the item
/// `translate`).
pub(crate) fn translate_boxes(boxes: &[PlacedBox], dy: f64) -> Vec<PlacedBox> {
    boxes.iter().map(|b| b.shifted(dy)).collect()
}

/// Shifts a slice of placements right by `dx` (companion to
/// `translate_x`).
pub(crate) fn translate_boxes_x(boxes: &[PlacedBox], dx: f64) -> Vec<PlacedBox> {
    boxes.iter().map(|b| b.shifted_x(dx)).collect()
}

#[cfg(test)]
mod tests {
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
}
