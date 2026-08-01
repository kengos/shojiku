//! Pure-core tests (host target): the session state machine, validate, and
//! the three-part render bundle. The wasm-bindgen shim is wasm32-only and is
//! covered by the browser e2e, not here.

mod error_ops;
mod pdf_ops;
mod render_ops;
mod session_ops;
mod subset_ops;

use super::*;
use shojiku_formatter::LangPack;
use shojiku_layout::FontStore;
use std::path::PathBuf;

fn fonts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

/// Injects one font pack the way a JS host does: declare the manifest, ask the
/// ENGINE which face files it lists (`font_files_needed` — the host never
/// parses manifest.yml itself), fetch each from disk, inject.
pub(super) fn inject_pack(session: &mut Session, id: &str) {
    let dir = fonts_dir().join(id);
    let manifest = std::fs::read_to_string(dir.join("manifest.yml")).expect("manifest");
    session.add_font_pack(id.to_string(), manifest);
    for name in session.font_files_needed(id).expect("files") {
        let bytes = std::fs::read(dir.join(&name)).expect("face bytes");
        session.add_font_file(id, name, bytes).expect("add face");
    }
}

pub(super) fn ja_pack() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse builtin ja-JP")
        .expect("builtin ja-JP exists")
}

/// A session with a locale set and a ready (filesystem-loaded) font store —
/// enough to render without building the injected store per test. `FontStore`
/// is not `Clone` and `Session` owns it, so each render test loads its own;
/// the injected-load path is exercised once in `session_ops`.
pub(super) fn ready_session() -> Session {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).expect("locale");
    session.fonts = Some(FontStore::load_from_pack(&ja_pack(), &[fonts_dir()]).expect("ja fonts"));
    session
}

/// A minimal valid single-page template that lays out to one page.
pub(super) const TEMPLATE: &str = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: hello
"#;

/// A template that lays out to exactly `count` pages: one rect per page with a
/// page break BETWEEN rects (not after, which could emit a trailing empty
/// page), so `count` rects and `count - 1` breaks give exactly `count` pages.
pub(super) fn multipage_template(count: usize) -> String {
    let mut items = String::new();
    for i in 0..count {
        if i > 0 {
            items.push_str("      - type: page_break\n");
        }
        items.push_str("      - type: rect\n        box: { w: 100, h: 100 }\n");
    }
    format!(
        "page: {{ margin: 0 }}\nsections:\n  body:\n    type: flow\n    box: {{ x: 0, y: 0, w: 500, h: 700 }}\n    items:\n{items}"
    )
}

#[test]
fn capabilities_reports_the_wasm_surface() {
    let json = capabilities().unwrap();
    let value: serde_json::Value = serde_json::from_str(&json).unwrap();
    let caps = value["capabilities"].as_array().unwrap();
    assert!(caps.iter().any(|c| c == "wasm.bindings"));
    assert!(caps.iter().any(|c| c == "preview.raw"));
}

#[test]
fn wasm_error_messages_carry_context() {
    assert!(WasmError::LocaleNotSet.to_string().contains("locale"));
    assert!(WasmError::FontsNotLoaded.to_string().contains("fonts"));
    assert!(WasmError::Locale("x".into()).to_string().contains('x'));
    assert!(WasmError::UnknownFontPack("p".into())
        .to_string()
        .contains('p'));
    assert!(WasmError::Fonts("f".into()).to_string().contains('f'));
    assert!(WasmError::BadScale(-1.0).to_string().contains("-1"));
    assert!(WasmError::Render("r".into()).to_string().contains('r'));
    assert!(WasmError::PageOutOfRange { page: 3, total: 2 }
        .to_string()
        .contains("page 3 is out of range"));
    assert!(WasmError::TooManyRawPages { total: 30, cap: 20 }
        .to_string()
        .contains("over the 20-page raw cap"));
}
