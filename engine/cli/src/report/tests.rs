//! The report envelope's serialized shape.
//!
//! These assertions are the CONTRACT the subprocess SDKs read, so they
//! pin spellings (`pageCount`, the `{"items": […]}` diagnostics object)
//! rather than merely proving the struct serializes.

use super::*;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode};

fn warned() -> Diagnostics {
    let mut diagnostics = Diagnostics::new();
    diagnostics
        .push(Diagnostic::new(DiagnosticCode::ImageSourceMissing).with_path("body.items[0]"));
    diagnostics
}

fn json(report: &Report<'_>) -> serde_json::Value {
    serde_json::from_str(&serde_json::to_string(report).expect("serialize")).expect("valid json")
}

#[test]
fn a_render_reports_its_page_count_in_the_capi_spelling() {
    let empty = Diagnostics::new();
    let value = json(&Report::success(&empty).with_page_count(3));
    assert_eq!(value["ok"], serde_json::json!(true));
    // camelCase, matching what `engine/capi` already emits — five SDKs
    // read that spelling and the two subprocess ones must not need a
    // second mapping.
    assert_eq!(value["pageCount"], serde_json::json!(3));
    assert!(value.get("page_count").is_none());
}

#[test]
fn diagnostics_serialize_as_the_items_object_the_sdks_parse() {
    let diagnostics = warned();
    let value = json(&Report::success(&diagnostics));
    // NOT a bare array: `Diagnostics` is `{"items": [...]}`, which is what
    // the shipped SDKs already pull out of the capi's diagnostics JSON.
    let items = value["diagnostics"]["items"]
        .as_array()
        .expect("an items array");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["code"], serde_json::json!("image_source_missing"));
    assert_eq!(items[0]["path"], serde_json::json!("body.items[0]"));
}

#[test]
fn a_successful_operation_still_carries_its_diagnostics() {
    // The case a caller who only inspects failures would miss: it worked,
    // and the engine still had something to say.
    let diagnostics = warned();
    let value = json(&Report::success(&diagnostics));
    assert_eq!(value["ok"], serde_json::json!(true));
    assert_eq!(
        value["diagnostics"]["items"]
            .as_array()
            .expect("items")
            .len(),
        1
    );
    assert!(value.get("failure").is_none(), "no failure when ok");
}

#[test]
fn a_failure_names_its_class_step_kind_and_message() {
    let empty = Diagnostics::new();
    let error = CliError::PageOutOfRange { page: 9, total: 2 };
    let value = json(&Report::failed("render", &error, &empty));
    assert_eq!(value["ok"], serde_json::json!(false));
    assert_eq!(value["failure"]["class"], serde_json::json!("usage"));
    assert_eq!(value["failure"]["step"], serde_json::json!("render"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("out_of_range"));
    assert!(value["failure"]["message"]
        .as_str()
        .expect("message")
        .contains("out of range"));
}

#[test]
fn a_refused_document_carries_the_diagnostics_that_explain_it() {
    let error = CliError::ValidationFailed {
        diagnostics: warned(),
    };
    let carried = error.diagnostics().expect("carried").clone();
    let value = json(&Report::failed("render", &error, &carried));
    assert_eq!(value["failure"]["class"], serde_json::json!("document"));
    assert_eq!(value["failure"]["kind"], serde_json::json!("document"));
    assert_eq!(
        value["diagnostics"]["items"][0]["code"],
        serde_json::json!("image_source_missing")
    );
}

#[test]
fn absent_fields_are_omitted_rather_than_null() {
    let empty = Diagnostics::new();
    let value = json(&Report::success(&empty));
    for key in ["pageCount", "verification", "failure"] {
        assert!(value.get(key).is_none(), "{key} should be omitted");
    }
}

#[test]
fn a_hostile_message_is_stripped_of_control_characters_and_capped() {
    // An engine error quotes paths and file content, and this report is
    // read by SDKs that put the message into logs and exception
    // reporters — so the bound is a guard, not cosmetics.
    let hostile = format!("\u{1}\u{7}bad{}", "A".repeat(MAX_MESSAGE * 2));
    let clipped = clip(&hostile);
    assert!(
        !clipped.chars().any(char::is_control),
        "control characters survived: {clipped:?}"
    );
    assert_eq!(clipped.chars().count(), MAX_MESSAGE);
    assert!(clipped.starts_with("bad"));
}

#[test]
fn writing_to_an_unwritable_path_is_a_usage_failure() {
    let empty = Diagnostics::new();
    // A directory where a file belongs — the refusal shape a test can
    // actually produce (the gate container runs as root, so a chmod
    // would prove nothing).
    let dir = std::env::temp_dir().join(format!("shojiku-report-dir-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    let error = Report::success(&empty)
        .write(&dir)
        .expect_err("a directory cannot take the report");
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert_eq!(error.class(), crate::error::FailureClass::Usage);
    assert_eq!(error.kind(), "output");
}

#[test]
fn a_written_report_round_trips_as_json() {
    let empty = Diagnostics::new();
    let path = std::env::temp_dir().join(format!("shojiku-report-rt-{}.json", std::process::id()));
    Report::success(&empty)
        .with_page_count(1)
        .write(&path)
        .expect("write");
    let text = std::fs::read_to_string(&path).expect("read back");
    std::fs::remove_file(&path).expect("cleanup");
    let value: serde_json::Value = serde_json::from_str(&text).expect("valid json on disk");
    assert_eq!(value["pageCount"], serde_json::json!(1));
}

#[test]
fn a_prepare_report_carries_the_payload_under_prepared() {
    // The subprocess SDKs read the prepare payload off the ENVELOPE, not off
    // stdout — stdout carries the PDF for the commands beside this one — so
    // the key and its contents are the contract, not an extra.
    let empty = Diagnostics::new();
    let prepared = crate::external::run_sign_prepare(&crate::args::SignPrepareArgs {
        input: crate::tests::example_pdf(),
        cert: crate::tests::key_dir().join("rsa2048.cert.pem"),
        algorithm: "rsa-pkcs1-sha256".to_owned(),
        report: crate::ReportArg::default(),
    })
    .expect("preparing succeeds");

    let value = serde_json::to_value(Report::success(&empty).with_prepared(&prepared))
        .expect("the envelope serializes");

    assert_eq!(value["ok"], serde_json::json!(true));
    let mut keys: Vec<&str> = value["prepared"]
        .as_object()
        .expect("a prepared object")
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(keys, ["byteRange", "capacity", "digest", "toBeSigned"]);
    // Absent on every other operation, so a caller cannot mistake one report
    // for another.
    assert!(serde_json::to_value(Report::success(&empty))
        .expect("serializes")
        .get("prepared")
        .is_none());
}
