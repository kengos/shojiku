//! Shared fixtures for the crate's unit tests: the builtin ja pack, its
//! filesystem-loaded font store (cached — sha256-verifying the ~47MB IPAmj
//! fallback per test is far too slow), and a known-good single-page run.

use crate::prepare::{prepare, AssetsInput, PrepareCtx, Prepared};
use crate::sources::load_sources;
use shojiku_diagnostics::Diagnostics;
use shojiku_formatter::LangPack;
use shojiku_image::AssetPolicy;
use shojiku_layout::FontStore;
use std::path::PathBuf;
use std::sync::OnceLock;

fn repo_fonts() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts")
}

pub(crate) fn ja_pack() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse builtin ja-JP")
        .expect("builtin ja-JP exists")
}

pub(crate) fn ja_fonts() -> &'static FontStore {
    static STORE: OnceLock<FontStore> = OnceLock::new();
    STORE.get_or_init(|| {
        FontStore::load_from_pack(&ja_pack(), &[repo_fonts()]).expect("load ja fonts")
    })
}

/// A nameless single-page template (title falls back to the default).
pub(crate) const SIMPLE: &str = r#"
page: { margin: 0 }
sections:
  body:
    type: flow
    box: { x: 0, y: 0, w: 500, h: 700 }
    items:
      - type: text
        text: hello
"#;

/// Runs the pipeline with template-walked assets and no bundled root.
pub(crate) fn run(tmpl: &str, params: &str) -> Result<Prepared, Diagnostics> {
    let sources = load_sources(None, tmpl, params).expect("parse sources");
    let pack = ja_pack();
    prepare(
        sources,
        PrepareCtx {
            pack: &pack,
            fonts: ja_fonts(),
            assets: AssetsInput::Prepare {
                policy: &AssetPolicy::default(),
                root: None,
            },
        },
    )
}

/// A known-good prepared document for inspect/preview fixtures.
pub(crate) fn ok_prepared() -> Prepared {
    run(SIMPLE, "{}").expect("prepare ok")
}
