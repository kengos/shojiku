//! Unit tests for the capability payload shared by `capabilities` and the
//! inspect envelope.

use super::*;

#[test]
fn engine_info_reports_version_capabilities_and_locales() {
    let info = engine_info();
    assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    assert!(info.capabilities.contains(&"text"));
    assert!(info.capabilities.contains(&"style.shapes.unified"));
    assert!(info.capabilities.contains(&"style.textCombineUpright.all"));
    // Number→currency coercion via a `symbol`/`name` format pick.
    assert!(info.capabilities.contains(&"format.currency.coerce"));
    // Grid `fr` track weights (leftover distribution).
    assert!(info.capabilities.contains(&"grid.fr"));
    // Data-driven table row layers (`row.conditionalStyles`).
    assert!(info.capabilities.contains(&"table.row.conditionalStyles"));
    // Border decoration: the patterned borderStyle keywords, corner
    // rounding, and the `line` item's own stroke pattern. Each is pinned
    // individually — the registry's structural tests pass whether or not
    // a given key is present, so this is the only per-key proof.
    assert!(info
        .capabilities
        .contains(&"style.borderStyle.dashed_dotted"));
    assert!(info.capabilities.contains(&"style.borderRadius"));
    assert!(info.capabilities.contains(&"line.style"));
    // The imposition small-flag set: the grid's `gap` shorthand, its trim
    // guides, and the document-scope binding escape. Each is pinned
    // individually — the registry's structural tests pass whether or not a
    // given key is present.
    assert!(info.capabilities.contains(&"repeat.grid.gap"));
    assert!(info.capabilities.contains(&"repeat.cutMarks"));
    assert!(info.capabilities.contains(&"binding.scope"));
    // Named binding declarations: the `{name}` escape out of the bare
    // `{key}` grammar's option-less, charset-bound form.
    assert!(info.capabilities.contains(&"binding.declarations"));
    // The OpenAPI-shaped definitions wire + params-vs-schema validation,
    // and the labeled `enum` member form layered on it. Each is pinned
    // individually — the registry's structural tests pass whether or not a
    // given key is present.
    assert!(info.capabilities.contains(&"definitions.schema"));
    assert!(info.capabilities.contains(&"definitions.enum.labels"));
    // The `document:` metadata block (PDF `/Info` + XMP). Pinned
    // individually — the registry's structural tests pass whether or not a
    // given key is present.
    assert!(info.capabilities.contains(&"template.document.metadata"));
    // The WASM host surface and its encode-free preview form advertise here.
    assert!(info.capabilities.contains(&"wasm.bindings"));
    assert!(info.capabilities.contains(&"preview.raw"));
    assert!(info.capabilities.contains(&"preview.page"));
    // Real PDF output from the browser host (`renderPdf`).
    assert!(info.capabilities.contains(&"wasm.render.pdf"));
    // The C ABI library the FFI SDKs load, and its two-call signing surface
    // for a key that lives outside the calling process.
    assert!(info.capabilities.contains(&"capi.abi"));
    assert!(info.capabilities.contains(&"capi.sign.external"));
    // The CLI's machine-readable `--report` sidecar the subprocess SDKs read.
    assert!(info.capabilities.contains(&"cli.report"));
    // …and its own two-call signing surface, the seam behind the subprocess
    // SDKs' external provider.
    assert!(info.capabilities.contains(&"cli.sign.external"));
    // Layout diagnostics addressed by structural item path, and per-group
    // header fills. Each is pinned individually — the registry's
    // structural tests pass whether or not a given key is present.
    assert!(info.capabilities.contains(&"diagnostics.layout.path"));
    assert!(info.capabilities.contains(&"table.headerGroups.style.fill"));
    assert!(info
        .capabilities
        .contains(&"table.header.style.verticalAlign"));
    assert!(info.builtin_locales.contains(&"ja-JP"));
}

#[test]
fn run_capabilities_emits_camelcase_json() {
    let json = run_capabilities().unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(value["capabilities"]
        .as_array()
        .unwrap()
        .iter()
        .any(|c| c == "text"));
    assert!(value.get("builtinLocales").is_some());
}
