//! The `--report <path>` sidecar as a subprocess SDK actually consumes it.
//!
//! These spawn the real binary because the whole point of the flag is what
//! a php or go client can recover from a finished process: the file's
//! CONTENT and the exit code, not an in-process return value. Every
//! assertion here parses the JSON — a report that has to be matched by
//! substring is one an SDK would surface as malformed output.

use std::path::{Path, PathBuf};

use super::{examples_dir, font_dir, locale_dir, path_arg, shojiku, temp_path};

fn read_report(path: &Path) -> serde_json::Value {
    let text = std::fs::read_to_string(path).expect("the report was written");
    std::fs::remove_file(path).expect("cleanup");
    serde_json::from_str(&text).expect("the report is valid JSON")
}

/// Writes a template + params pair under a per-test name.
fn fixture(tag: &str, template: &str, params: &str) -> (PathBuf, PathBuf) {
    let dir = temp_path(&format!("report-{tag}"));
    std::fs::create_dir_all(&dir).expect("fixture dir");
    let templates = dir.join("templates.yml");
    let params_path = dir.join("params.json");
    std::fs::write(&templates, template).expect("write template");
    std::fs::write(&params_path, params).expect("write params");
    (templates, params_path)
}

fn render_with_report(templates: &Path, params: &Path, report: &Path) -> std::process::Output {
    shojiku(&[
        "render",
        "--templates",
        &path_arg(templates.to_path_buf()),
        "--params",
        &path_arg(params.to_path_buf()),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        "-",
        "--report",
        &path_arg(report.to_path_buf()),
    ])
}

/// A template whose text box is one line-height too short: the engine WARNS
/// and still renders, which is exactly the case a caller who only inspects
/// failures would miss.
const WARNS: &str = r#"version: 0.1.0
name: warns
page:
  size: A4
  margin: 25
defaults:
  locale: en-US
  style:
    fontFamily: noto-sans
    fontSize: 10.5
sections:
  body:
    type: flow
    items:
      - id: cramped
        type: text
        box: { x: 0, y: 0, w: 400, h: 24 }
        text: Cramped
        style: { fontSize: 18 }
"#;

/// An `image` item with neither `src` nor `data` — the cheapest
/// definitions-free way to force a validation ERROR.
const BROKEN: &str = r#"version: 0.1.0
name: broken
page:
  size: A4
  margin: 25
defaults:
  locale: en-US
sections:
  body:
    type: flow
    items:
      - id: nowhere
        type: image
        box: { x: 0, y: 0, w: 100, h: 100 }
"#;

mod documents;
mod signing;
