//! `shojiku validate`: diagnostics JSON, exit codes, and the
//! parse-failure-as-diagnostic routing.

use super::*;

#[test]
fn validate_reports_clean_example() {
    let out = shojiku(&[
        "validate",
        "--definitions",
        &path_arg(examples_dir().join("definitions.yml")),
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("\"items\""));
}

#[test]
fn validate_fails_on_unknown_binding() {
    let templates = temp_path("bad.yml");
    std::fs::write(
        &templates,
        r#"
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: order.ghost }
"#,
    )
    .expect("write template");
    let out = shojiku(&[
        "validate",
        "--definitions",
        &path_arg(examples_dir().join("definitions.yml")),
        "--templates",
        &path_arg(templates.clone()),
    ]);
    std::fs::remove_file(templates).expect("cleanup");
    assert!(!out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("unknown_data_key"));
}

#[test]
fn missing_input_file_reports_error_on_stderr() {
    let out = shojiku(&["validate", "--templates", "/no/such/file.yml"]);
    assert!(!out.status.success());
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("shojiku:"), "stderr: {stderr}");
}

#[test]
fn validate_surfaces_a_parse_error_as_a_diagnostic() {
    // An unknown top-level key is a structural parse failure; `validate`
    // emits it as a `parse_error` diagnostic (JSON) and exits non-zero,
    // rather than an opaque CLI error string.
    let templates = temp_path("parse-error.yml");
    std::fs::write(
        &templates,
        "bogus_top_level_key: 1\nsections:\n  body: { type: absolute }\n",
    )
    .expect("write template");
    let out = shojiku(&["validate", "--templates", &path_arg(templates.clone())]);
    std::fs::remove_file(templates).expect("cleanup");
    assert!(!out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("parse_error"), "stdout: {stdout}");
    // The located args ride along for a GUI to render inline.
    assert!(stdout.contains("\"path\""));
}

#[test]
fn validate_surfaces_a_non_finite_number_as_a_diagnostic() {
    let templates = temp_path("non-finite.yml");
    std::fs::write(
        &templates,
        "sections:\n  body:\n    type: absolute\n    items:\n      - type: rect\n        box: { x: 0, y: 0, w: .inf, h: 10 }\n",
    )
    .expect("write template");
    let out = shojiku(&["validate", "--templates", &path_arg(templates.clone())]);
    std::fs::remove_file(templates).expect("cleanup");
    assert!(!out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("non_finite_number"), "stdout: {stdout}");
}

#[test]
fn validate_surfaces_a_definitions_parse_error() {
    let defs = temp_path("bad-defs.yml");
    std::fs::write(&defs, "bogus_defs_key: 1\n").expect("write defs");
    let out = shojiku(&[
        "validate",
        "--definitions",
        &path_arg(defs.clone()),
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
    ]);
    std::fs::remove_file(defs).expect("cleanup");
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("parse_error"));
}

#[test]
fn validate_surfaces_a_params_parse_error() {
    let params = temp_path("bad-params.json");
    std::fs::write(&params, "{ not valid json ").expect("write params");
    let out = shojiku(&[
        "validate",
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(params.clone()),
    ]);
    std::fs::remove_file(params).expect("cleanup");
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stdout).contains("parse_error"));
}
