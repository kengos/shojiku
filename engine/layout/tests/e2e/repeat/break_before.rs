//! `breakBefore` on an imposition grid: the opt-in cursor start
//! (`auto`), the unchanged fresh-page default, and the guards.

mod cursor;
mod guards;

use crate::common::*;
use shojiku_layout::{LayoutOutput, PlacedBox};

/// A 2 x 4 imposition in a 400x400 flow region: no gaps, so slots are a
/// uniform 200 x 100 and a full page holds 8 cells.
///
/// `title_h` puts a fixed-height text above the grid (moving the flow
/// cursor to exactly that y before the `repeat` starts); `None` leaves the
/// grid first in the flow, on an untouched page.
fn imposition(
    title_h: Option<f64>,
    break_before: Option<&str>,
    direction: &str,
    count: usize,
) -> LayoutOutput {
    let title = title_h
        .map(|h| {
            format!(
                concat!(
                    "      - type: text\n",
                    "        text: TITLE\n",
                    "        box: {{ w: 400, h: {} }}\n",
                    "        style: {{ fontSize: 10, lineHeight: 1.0 }}\n",
                ),
                h
            )
        })
        .unwrap_or_default();
    let opt_in = break_before
        .map(|v| format!("        breakBefore: {v}\n"))
        .unwrap_or_default();
    let elements: Vec<Value> = (0..count)
        .map(|i| json!({ "label": format!("c{i}") }))
        .collect();
    run_full(
        &format!(
            concat!(
                "page: {{ margin: 0 }}\n",
                "sections:\n",
                "  body:\n",
                "    type: flow\n",
                "    box: {{ x: 0, y: 0, w: 400, h: 400 }}\n",
                "    items:\n",
                "{}",
                "      - type: repeat\n",
                "        id: sheet\n",
                "        data: {{ key: cells }}\n",
                "        grid: {{ columns: 2, rows: 4, direction: {} }}\n",
                "{}",
                "        cell:\n",
                "          id: cell\n",
                "          items:\n",
                "            - type: text\n",
                "              box: {{ x: 0, y: 0 }}\n",
                "              data: {{ key: label }}\n",
                "              style: {{ fontSize: 10, lineHeight: 1.0 }}\n",
            ),
            title, direction, opt_in
        ),
        json!({ "cells": elements }),
    )
}

/// The cells laid on `page`, in placement order.
fn cell_boxes(out: &LayoutOutput, page: usize) -> Vec<&PlacedBox> {
    out.boxes.pages[page]
        .iter()
        .filter(|b| b.id.as_deref() == Some("cell"))
        .collect()
}

/// Every element label that landed anywhere, across all pages.
fn placed_labels(out: &LayoutOutput) -> Vec<String> {
    out.document
        .pages
        .iter()
        .flat_map(|p| text_blocks(p))
        .map(|b| b.lines[0].text.clone())
        .filter(|t| t.starts_with('c'))
        .collect()
}
