//! Pipeline error paths: validation/layout failures, unreadable inputs,
//! and output-writing errors. The happy-path example renders live in
//! `examples`.

use super::*;

#[test]
fn validation_errors_fail_inspect_and_render() {
    let templates = temp_file(
        "bad-binding.yml",
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        data: { key: order.ghost }
"#,
    );
    let params = temp_file("empty-params.json", "{}");
    let args = RenderishArgs {
        definitions: Some(examples_dir().join("definitions.yml")),
        templates,
        params,
        lang: None,
        font_dir: vec![font_dir()],
        locale_dir: vec![locale_dir()],
        assets_dir: None,
        asset_mode: AssetModeArg::Open,
        allow_dynamic_image: Vec::new(),
        deny_dynamic_image: Vec::new(),
        offline: false,
        font_fetch_allow: Vec::new(),
        font_pack: Vec::new(),
    };
    assert!(matches!(
        run_inspect(&args),
        Err(CliError::ValidationFailed { .. })
    ));
}

#[test]
fn layout_errors_fail_render() {
    // A tiny flow region with thousands of rows exceeds the page cap,
    // producing a layout-stage (not validation-stage) error.
    let templates = temp_file(
        "overflow.yml",
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 40 }
    items:
      - type: table
        data: { key: rows }
        columns:
          - data: { key: n }
            width: 100
"#,
    );
    let rows: Vec<String> = (0..2000).map(|i| format!("{{\"n\": {i}}}")).collect();
    let params = temp_file(
        "many-rows.json",
        &format!("{{\"rows\": [{}]}}", rows.join(",")),
    );
    let args = RenderArgs {
        common: RenderishArgs {
            definitions: None,
            templates,
            params,
            lang: Some("ja-JP".to_string()),
            font_dir: vec![font_dir()],
            locale_dir: vec![locale_dir()],
            assets_dir: None,
            asset_mode: AssetModeArg::Open,
            allow_dynamic_image: Vec::new(),
            deny_dynamic_image: Vec::new(),
            offline: false,
            font_fetch_allow: Vec::new(),
            font_pack: Vec::new(),
        },
        output: "-".to_string(),
        report: ReportArg::default(),
    };
    assert!(matches!(
        run_render(&args),
        Err(CliError::ValidationFailed { .. })
    ));
}

#[test]
fn validation_errors_win_over_missing_font_packs() {
    // A broken template must report its own errors even when no font packs
    // are installed: the validation gate runs BEFORE locale/font loading
    // (an `image` item with neither `src` nor `data` is a validation error;
    // the builtin locale needs no file, but the font packs would).
    let templates = temp_file(
        "sourceless-image.yml",
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: image
        box: { x: 0, y: 0, w: 50, h: 50 }
"#,
    );
    let params = temp_file("no-fonts-params.json", "{}");
    let args = RenderishArgs {
        definitions: None,
        templates,
        params,
        lang: None,
        font_dir: vec![PathBuf::from("/no/such/fonts")],
        locale_dir: vec![PathBuf::from("/no/such/locale")],
        assets_dir: None,
        asset_mode: AssetModeArg::Open,
        allow_dynamic_image: Vec::new(),
        deny_dynamic_image: Vec::new(),
        offline: false,
        font_fetch_allow: Vec::new(),
        font_pack: Vec::new(),
    };
    assert!(matches!(
        run_inspect(&args),
        Err(CliError::ValidationFailed { .. })
    ));
}

#[test]
fn unreadable_input_fails_inspect() {
    let args = RenderishArgs {
        definitions: None,
        templates: PathBuf::from("/no/such/template.yml"),
        params: PathBuf::from("/no/such/params.json"),
        lang: None,
        font_dir: vec![font_dir()],
        locale_dir: vec![locale_dir()],
        assets_dir: None,
        asset_mode: AssetModeArg::Open,
        allow_dynamic_image: Vec::new(),
        deny_dynamic_image: Vec::new(),
        offline: false,
        font_fetch_allow: Vec::new(),
        font_pack: Vec::new(),
    };
    assert!(matches!(run_inspect(&args), Err(CliError::Io { .. })));
}

struct FailingWriter;

impl std::io::Write for FailingWriter {
    fn write(&mut self, _buf: &[u8]) -> std::io::Result<usize> {
        Err(std::io::Error::other("pipe closed"))
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[test]
fn stream_write_failures_become_output_errors() {
    use std::io::Write;
    let ok = write_stream(&mut Vec::new(), b"data");
    assert!(ok.is_ok());
    let result = write_stream(&mut FailingWriter, b"data");
    assert!(matches!(result, Err(CliError::Output { ref path, .. }) if path == "-"));
    assert!(FailingWriter.flush().is_ok());
}

#[test]
fn a_render_reports_the_page_count_its_layout_actually_produced() {
    // The `--report` sidecar publishes this number, and every end-to-end
    // fixture is single-page — so a hardcoded 1 would satisfy them all.
    // This pins the invariant instead: the count tracks pagination.
    let templates = temp_file(
        "paginating.yml",
        r#"
page: { size: A4, margin: 20 }
sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          - data: { key: n }
            width: 100
"#,
    );
    let rows: Vec<String> = (0..200).map(|i| format!("{{\"n\": {i}}}")).collect();
    let params = temp_file(
        "paginating.json",
        &format!("{{\"rows\": [{}]}}", rows.join(",")),
    );
    let mut args = example_render_args();
    args.common.definitions = None;
    args.common.templates = templates;
    args.common.params = params;
    let rendered = run_render(&args).expect("render");
    assert!(
        rendered.page_count > 1,
        "200 rows must paginate, got {}",
        rendered.page_count
    );
    // The PDF the caller receives and the count the report publishes
    // describe the same document.
    let pages = rendered
        .bytes
        .windows(9)
        .filter(|w| w == b"/Type/Pag")
        .count();
    assert!(pages > 1, "the PDF itself carries several pages");
}

#[test]
fn render_falls_back_to_default_title_for_nameless_templates() {
    let templates = temp_file(
        "nameless.yml",
        r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: hello
"#,
    );
    let params = temp_file("nameless-params.json", "{}");
    let args = RenderArgs {
        common: RenderishArgs {
            definitions: None,
            templates,
            params,
            lang: Some("ja-JP".to_string()),
            font_dir: vec![font_dir()],
            locale_dir: vec![locale_dir()],
            assets_dir: None,
            asset_mode: AssetModeArg::Open,
            allow_dynamic_image: Vec::new(),
            deny_dynamic_image: Vec::new(),
            offline: false,
            font_fetch_allow: Vec::new(),
            font_pack: Vec::new(),
        },
        output: "-".to_string(),
        report: ReportArg::default(),
    };
    let rendered = run_render(&args).expect("render");
    assert!(rendered.bytes.starts_with(b"%PDF-"));
}

#[test]
fn write_output_writes_files_and_rejects_directories() {
    let path = std::env::temp_dir().join(format!("shojiku-out-{}.bin", std::process::id()));
    write_output(path.to_str().expect("utf8 path"), b"data").expect("write");
    assert_eq!(std::fs::read(&path).expect("read back"), b"data");
    std::fs::remove_file(&path).expect("cleanup");

    let dir = std::env::temp_dir();
    let result = write_output(dir.to_str().expect("utf8 path"), b"data");
    assert!(matches!(result, Err(CliError::Output { .. })));
}

#[test]
fn missing_file_is_io_error() {
    let args = ValidateArgs {
        definitions: None,
        templates: PathBuf::from("/no/such/file.yml"),
        params: None,
    };
    assert!(matches!(run_validate(&args), Err(CliError::Io { .. })));
}

#[test]
fn preview_propagates_render_errors() {
    let mut args = example_preview_args();
    args.scale = 0.0;
    assert!(matches!(run_preview(&args), Err(CliError::RenderPng(_))));
}
