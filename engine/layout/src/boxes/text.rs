//! Text metrics of the box-index sidecar: per-line optical anchors for
//! horizontal text items and per-column anchors for vertical
//! ones. Two wire forms of one `text` key — `{ lines: […] }` or
//! `{ columns: […] }` — so a pre-vertical consumer keeps parsing exactly
//! what it always saw and a newer one switches on the present key
//! (capability-gated on the inspect surface).

use serde::Serialize;

/// The drawn-glyph metrics of a text item: per-line for a horizontal
/// block, per-column for a vertical one. Serializes untagged — the
/// variant is visible as the `lines` / `columns` key.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum TextMetrics {
    /// Horizontal: one entry per wrapped line.
    Lines { lines: Vec<LineMetric> },
    /// Vertical: one entry per column, right-to-left in drawn order.
    Columns { columns: Vec<ColumnMetric> },
}

impl TextMetrics {
    /// The per-line metrics, when this is a horizontal item.
    pub fn lines(&self) -> Option<&[LineMetric]> {
        match self {
            TextMetrics::Lines { lines } => Some(lines),
            TextMetrics::Columns { .. } => None,
        }
    }

    /// The per-column metrics, when this is a vertical item.
    pub fn columns(&self) -> Option<&[ColumnMetric]> {
        match self {
            TextMetrics::Columns { columns } => Some(columns),
            TextMetrics::Lines { .. } => None,
        }
    }

    pub(crate) fn shifted(&self, dy: f64) -> TextMetrics {
        match self {
            TextMetrics::Lines { lines } => TextMetrics::Lines {
                lines: lines.iter().map(|l| l.shifted(dy)).collect(),
            },
            TextMetrics::Columns { columns } => TextMetrics::Columns {
                columns: columns.iter().map(|c| c.shifted(dy)).collect(),
            },
        }
    }

    pub(crate) fn shifted_x(&self, dx: f64) -> TextMetrics {
        match self {
            TextMetrics::Lines { lines } => TextMetrics::Lines {
                lines: lines.iter().map(|l| l.shifted_x(dx)).collect(),
            },
            TextMetrics::Columns { columns } => TextMetrics::Columns {
                columns: columns.iter().map(|c| c.shifted_x(dx)).collect(),
            },
        }
    }
}

/// One line's optical anchors, in page coordinates (pt, top-left origin):
/// the baseline plus the cap-top and em (ascent/descent) band an overlay
/// keys off. `x`/`width` mirror the drawn line.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMetric {
    pub x: f64,
    pub width: f64,
    /// Baseline y (glyphs sit on it).
    pub baseline: f64,
    /// Top of the capital band (baseline − cap height).
    pub cap_top: f64,
    /// Top of the em box (baseline − ascent).
    pub em_top: f64,
    /// Bottom of the em box (baseline + descent).
    pub em_bottom: f64,
}

impl LineMetric {
    pub(crate) fn shifted(self, dy: f64) -> LineMetric {
        LineMetric {
            baseline: self.baseline + dy,
            cap_top: self.cap_top + dy,
            em_top: self.em_top + dy,
            em_bottom: self.em_bottom + dy,
            ..self
        }
    }

    pub(crate) fn shifted_x(self, dx: f64) -> LineMetric {
        LineMetric {
            x: self.x + dx,
            ..self
        }
    }
}

/// One vertical column's optical anchors, in page coordinates (pt,
/// top-left origin): the column axis — the vertical baseline glyph cells
/// center on — plus its em band's left/right edges. `y`/`height` mirror
/// the drawn column's top and down-extent (the axis-swapped analog of
/// `x`/`width` on [`LineMetric`]).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMetric {
    /// Top of the column, page coords.
    pub y: f64,
    /// Inked down-extent of the column in pt.
    pub height: f64,
    /// Column-axis x (the vertical baseline).
    pub baseline: f64,
    /// Left edge of the em cell (baseline − em/2).
    pub em_left: f64,
    /// Right edge of the em cell (baseline + em/2).
    pub em_right: f64,
}

impl ColumnMetric {
    pub(crate) fn shifted(self, dy: f64) -> ColumnMetric {
        ColumnMetric {
            y: self.y + dy,
            ..self
        }
    }

    pub(crate) fn shifted_x(self, dx: f64) -> ColumnMetric {
        ColumnMetric {
            baseline: self.baseline + dx,
            em_left: self.em_left + dx,
            em_right: self.em_right + dx,
            ..self
        }
    }
}
