//! Near-e2e layout suite: template YAML + params -> `layout()` ->
//! assertions on the positioned tree. One binary; modules mirror the
//! src module they target (`atoms`/`band`/`container`/`flex`/`flow`/
//! `repeat`/`table`/`text` -> `src/engine/<same>.rs`, `style` -> `src/style.rs`).
//! `format` (formatter integration), `limits` (cross-module
//! hostile-input caps), `box_model` (padding/margin across item
//! kinds), `diagnostic_paths` (every warning names its item), and
//! `units` (em/rem + font-length strings) are
//! deliberately cross-cutting; `common` holds shared fixtures.

mod binding_scope;
mod bindings;
mod common;

mod atoms;
mod band;
mod box_model;
mod boxes;
mod char_grid;
mod clip;
mod container;
mod decoration;
mod defaults;
mod diagnostic_paths;
mod document_meta;
mod flex;
mod flow;
mod format;
mod grid;
mod limits;
mod link;
mod list;
mod marks;
mod min_max;
mod page_margin;
mod page_orientation;
mod qr;
mod reflow;
mod repeat;
mod repeat_flow;
mod style;
mod table;
mod text;
mod text_metrics;
mod units;
mod visibility;
