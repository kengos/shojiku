//! Unit tests for the diagnostic value type and collection.

use super::*;

#[test]
fn error_detection() {
    let mut diags = Diagnostics::new();
    assert!(!diags.has_errors());
    assert!(diags.is_empty());

    diags.push(Diagnostic::new(DiagnosticCode::SectionOverflow));
    assert!(!diags.has_errors());

    diags.push(Diagnostic::new(DiagnosticCode::PageOverflow).arg("max", 500usize));
    assert!(diags.has_errors());
    assert_eq!(diags.len(), 2);
}

#[test]
fn extend_merges_items() {
    let mut a = Diagnostics::new();
    a.push(Diagnostic::new(DiagnosticCode::SectionOverflow));
    let mut b = Diagnostics::new();
    b.push(Diagnostic::new(DiagnosticCode::RowOverflow).arg("key", "rows"));
    a.extend(b);
    assert_eq!(a.len(), 2);
    assert!(a.has_errors());
}

#[test]
fn new_pulls_severity_category_and_template() {
    let d = Diagnostic::new(DiagnosticCode::InvalidFontSize);
    assert_eq!(d.severity, Severity::Warning);
    assert_eq!(d.category, Category::Layout);
    // Un-argued: placeholders stay literal until filled.
    assert!(d.message.contains("{value}"));
    assert!(d.origin.as_deref().unwrap().contains(".rs"));
}

#[test]
fn arg_renders_message_and_stores_typed_value() {
    let d = Diagnostic::new(DiagnosticCode::InvalidFontSize)
        .arg("value", -5.0)
        .arg("default", 10usize);
    assert_eq!(
        d.message,
        "fontSize -5 is not a positive finite number; using 10"
    );
    assert_eq!(d.args.get("value"), Some(&ArgValue::Num(-5.0)));
    assert_eq!(d.args.get("default"), Some(&ArgValue::Num(10.0)));
}

#[test]
fn display_includes_code_and_path() {
    let d = Diagnostic::new(DiagnosticCode::UnknownDataKey)
        .arg("key", "total")
        .arg("source", "definitions")
        .with_path("items[0]");
    let s = d.to_string();
    assert!(s.contains("error[unknown_data_key]"));
    assert!(s.contains("data key `total` is not declared in definitions"));
    assert!(s.contains("(at items[0])"));
}

#[test]
fn display_covers_all_severities() {
    // A warning-severity code renders the `warning` prefix via Display.
    let warn = Diagnostic::new(DiagnosticCode::SectionOverflow);
    assert_eq!(warn.severity, Severity::Warning);
    assert!(warn.to_string().starts_with("warning[section_overflow]"));
    // Info severity is reachable through Severity even if no code uses it yet.
    let d = Diagnostic {
        severity: Severity::Info,
        code: DiagnosticCode::SectionOverflow,
        category: Category::Layout,
        message: "fyi".to_string(),
        path: None,
        args: BTreeMap::new(),
        origin: None,
    };
    assert_eq!(d.to_string(), "info[section_overflow] fyi");
}

#[test]
fn iter_walks_items_in_order() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::PageNumberInBody));
    diags.push(Diagnostic::new(DiagnosticCode::SectionOverflow));
    let codes: Vec<&str> = diags.iter().map(|d| d.code.as_str()).collect();
    assert_eq!(codes, vec!["page_number_in_body", "section_overflow"]);
}

#[test]
fn serializes_to_json_and_back() {
    let d = Diagnostic::new(DiagnosticCode::MissingData)
        .arg("scope", "")
        .arg("key", "total")
        .with_path("a.b");
    let json = serde_json::to_string(&d).expect("serialize");
    assert!(json.contains("\"warning\""));
    assert!(json.contains("missing_data"));
    assert!(json.contains("\"category\":\"data\""));
    // Args serialize as bare scalars.
    assert!(json.contains("\"key\":\"total\""));

    let back: Diagnostic = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(back, d);
}

#[test]
fn empty_args_and_path_are_omitted() {
    let d = Diagnostic::new(DiagnosticCode::EmptyTextItem);
    let json = serde_json::to_string(&d).expect("serialize");
    assert!(!json.contains("\"path\""));
    assert!(!json.contains("\"args\""));
    assert!(json.contains("\"origin\""));
}

#[test]
fn code_compares_against_wire_string_both_ways() {
    let code = DiagnosticCode::MissingData;
    assert!(code == "missing_data");
    assert!("missing_data" == code);
    assert!(code != "other");
    assert!("other" != code);
}

#[test]
fn unknown_code_string_fails_to_deserialize() {
    let err = serde_json::from_str::<Diagnostic>(
        r#"{"severity":"warning","code":"not_a_real_code","category":"data","message":"x"}"#,
    )
    .expect_err("must reject unknown code");
    assert!(err.to_string().contains("unknown diagnostic code"));
}

#[test]
fn dedup_keeps_first_per_code_and_path() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::InvalidFontSize).with_path("a"));
    diags.push(Diagnostic::new(DiagnosticCode::InvalidFontSize).with_path("a"));
    diags.push(Diagnostic::new(DiagnosticCode::InvalidFontSize).with_path("b"));
    diags.push(Diagnostic::new(DiagnosticCode::InvalidLineHeight).with_path("a"));
    diags.dedup();
    // (font,a) once, (font,b) kept, (line,a) kept.
    assert_eq!(diags.len(), 3);
    let paths: Vec<_> = diags.iter().map(|d| d.path.clone().unwrap()).collect();
    assert_eq!(paths, vec!["a", "b", "a"]);
}

#[test]
fn dedup_collapses_identical_pathless_duplicates() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::LengthOutOfRange).arg("value", 1.0));
    diags.push(Diagnostic::new(DiagnosticCode::LengthOutOfRange).arg("value", 1.0));
    diags.dedup();
    // Same code, same rendered message (same args), both path-less: one survives.
    assert_eq!(diags.len(), 1);
}

#[test]
fn dedup_keeps_pathless_diagnostics_with_distinct_args() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::VerticalStyleIgnored).arg("prop", "textOverflow"));
    diags.push(Diagnostic::new(DiagnosticCode::VerticalStyleIgnored).arg("prop", "verticalAlign"));
    diags.dedup();
    // Same code and path (None) but different `prop` arg → different message → both kept.
    assert_eq!(diags.len(), 2);
}

#[test]
fn set_missing_paths_stamps_only_the_pathless_ones_from_the_mark() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::TextOverflow));
    let mark = diags.len();
    diags.push(Diagnostic::new(DiagnosticCode::TextOverflow));
    diags.push(Diagnostic::new(DiagnosticCode::TextOverflow).with_path("its.own.place"));
    diags.set_missing_paths(mark, "sections.body.items[3]");
    let paths: Vec<_> = diags.iter().map(|d| d.path.clone()).collect();
    assert_eq!(
        paths,
        vec![
            // Before the mark: untouched, so an enclosing node's stamp
            // never reaches a sibling that already finished.
            None,
            Some("sections.body.items[3]".to_string()),
            // Already located: a diagnostic that named its own place wins.
            Some("its.own.place".to_string()),
        ]
    );
}

#[test]
fn set_missing_paths_from_zero_stamps_every_pathless_diagnostic() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::TextOverflow));
    diags.push(Diagnostic::new(DiagnosticCode::SectionOverflow));
    diags.set_missing_paths(0, "sections.header.items[0]");
    assert!(diags
        .iter()
        .all(|d| d.path.as_deref() == Some("sections.header.items[0]")));
}

#[test]
fn set_missing_paths_past_the_end_is_a_no_op() {
    let mut diags = Diagnostics::new();
    diags.push(Diagnostic::new(DiagnosticCode::TextOverflow));
    // A stale mark (the collection was replaced under it, as a measure
    // pass does) must not panic and must not stamp anything.
    diags.set_missing_paths(99, "sections.body");
    assert_eq!(diags.iter().next().unwrap().path, None);
}
