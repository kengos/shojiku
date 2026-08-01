//! `--report` over the RENDER lifecycle step: what a document did.

use super::*;

#[test]
fn a_rendered_document_reports_ok_with_its_page_count() {
    let report = temp_path("ok-render.json");
    let out = shojiku(&[
        "render",
        "--definitions",
        &path_arg(examples_dir().join("definitions.yml")),
        "--templates",
        &path_arg(examples_dir().join("templates.yml")),
        "--params",
        &path_arg(examples_dir().join("params.json")),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        "-",
        "--report",
        &path_arg(report.clone()),
    ]);
    assert!(
        out.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(true));
    assert_eq!(value["pageCount"], serde_json::json!(1));
    assert!(
        value["diagnostics"]["items"]
            .as_array()
            .expect("items")
            .is_empty(),
        "the bundled example renders clean: {value}"
    );
    assert!(value.get("failure").is_none());
}

#[test]
fn a_render_that_warned_still_reports_ok_and_carries_the_warning() {
    let (templates, params) = fixture("warns", WARNS, "{}");
    let report = temp_path("warns.json");
    let out = render_with_report(&templates, &params, &report);
    assert!(out.status.success(), "a warning is not a failure");
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(true));
    let items = value["diagnostics"]["items"]
        .as_array()
        .expect("items")
        .clone();
    assert!(!items.is_empty(), "the short box should have warned");
    // The codes and typed args are what stderr prose cannot express, and
    // they are the reason this flag exists.
    assert!(
        items.iter().all(|d| d["code"].is_string()),
        "every diagnostic carries a machine-readable code: {value}"
    );
}

#[test]
fn a_refused_document_reports_the_document_class_and_its_diagnostics() {
    let (templates, params) = fixture("broken", BROKEN, "{}");
    let report = temp_path("broken.json");
    let out = render_with_report(&templates, &params, &report);
    assert!(!out.status.success(), "a refused document exits non-zero");
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(false));
    // The half an SDK must get right: this is a FAILED RESULT, not
    // programmer misuse.
    assert_eq!(value["failure"]["class"], serde_json::json!("document"));
    assert_eq!(value["failure"]["step"], serde_json::json!("render"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("document"));
    let codes: Vec<&str> = value["diagnostics"]["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter_map(|d| d["code"].as_str())
        .collect();
    assert!(
        codes.contains(&"image_source_missing"),
        "the refusal must carry what explains it, got {codes:?}"
    );
}

#[test]
fn without_the_flag_no_report_is_written() {
    let (templates, params) = fixture("noflag", WARNS, "{}");
    let unwanted = temp_path("never-written.json");
    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(templates),
        "--params",
        &path_arg(params),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        "-",
    ]);
    assert!(out.status.success());
    assert!(
        !unwanted.exists(),
        "the flag is opt-in; nothing is written without it"
    );
}

#[test]
fn an_unwritable_report_path_is_a_usage_failure() {
    let (templates, params) = fixture("unwritable", WARNS, "{}");
    // A directory where the file belongs: the refusal shape a container
    // running as root can actually produce.
    let dir = temp_path("report-is-a-directory");
    std::fs::create_dir_all(&dir).expect("scratch dir");
    let out = render_with_report(&templates, &params, &dir);
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert!(!out.status.success(), "the run must not claim success");
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("failed to write output"),
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn an_unwritable_report_does_not_replace_the_documents_own_failure() {
    // Both things are wrong at once: the document is refused AND the
    // report cannot be written. The caller must be told about the
    // DOCUMENT — a file-writing complaint would bury the real cause,
    // and a non-zero exit with no report is already unambiguous.
    let (templates, params) = fixture("both-broken", BROKEN, "{}");
    let dir = temp_path("report-dir-on-failure");
    std::fs::create_dir_all(&dir).expect("scratch dir");
    let out = render_with_report(&templates, &params, &dir);
    let wrote_anything = std::fs::read_dir(&dir)
        .expect("read scratch dir")
        .next()
        .is_some();
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert!(!out.status.success());
    assert!(!wrote_anything, "nothing should land inside the directory");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("image_source_missing"),
        "the document's own cause must survive: {stderr}"
    );
    assert!(
        !stderr.contains("failed to write output"),
        "the report's write must not become the reported failure: {stderr}"
    );
}

#[test]
fn an_unwritable_output_reports_a_usage_failure() {
    // The OUTPUT path is the caller's choice, so a PDF that cannot be
    // written is programmer misuse — an SDK raises for it rather than
    // handing back a failed result about the document, which is fine.
    let (templates, params) = fixture("badoutput", WARNS, "{}");
    let dir = temp_path("output-is-a-directory");
    std::fs::create_dir_all(&dir).expect("scratch dir");
    let report = temp_path("badoutput.json");
    let out = shojiku(&[
        "render",
        "--templates",
        &path_arg(templates),
        "--params",
        &path_arg(params),
        "--font-dir",
        &path_arg(font_dir()),
        "--locale-dir",
        &path_arg(locale_dir()),
        "--output",
        &path_arg(dir.clone()),
        "--report",
        &path_arg(report.clone()),
    ]);
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert!(!out.status.success());
    let value = read_report(&report);
    assert_eq!(value["ok"], serde_json::json!(false));
    assert_eq!(value["failure"]["class"], serde_json::json!("usage"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("output"));
    assert_eq!(value["failure"]["step"], serde_json::json!("render"));
}
