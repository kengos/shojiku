//! Session state machine: locale, font-pack injection, the injected font
//! load, and assets — including the misuse errors each guards.

use super::*;
use std::fs;

#[test]
fn set_locale_accepts_a_builtin_and_rejects_an_unknown() {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    assert!(session.pack.is_some());

    // A non-builtin locale with no overlay/standalone content is a Locale error.
    let err = Session::new().set_locale("zz-ZZ", None).unwrap_err();
    assert!(matches!(err, WasmError::Locale(_)));
}

#[test]
fn font_packs_needed_requires_a_locale_then_lists_ids() {
    assert!(matches!(
        Session::new().font_packs_needed(),
        Err(WasmError::LocaleNotSet)
    ));

    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    let ids = session.font_packs_needed().unwrap();
    assert!(!ids.is_empty());
}

#[test]
fn add_font_file_needs_a_declared_pack() {
    let mut session = Session::new();
    let err = session
        .add_font_file("ghost", "a.ttf".into(), vec![0])
        .unwrap_err();
    assert!(matches!(err, WasmError::UnknownFontPack(id) if id == "ghost"));

    session.add_font_pack("real".into(), "manifest".into());
    session
        .add_font_file("real", "a.ttf".into(), vec![1, 2, 3])
        .unwrap();
    assert_eq!(session.font_packs[0].files["a.ttf"], vec![1, 2, 3]);
}

#[test]
fn font_files_needed_lists_the_manifest_faces() {
    let mut session = Session::new();
    let manifest = fs::read_to_string(fonts_dir().join("noto-sans/manifest.yml")).expect("read");
    session.add_font_pack("noto-sans".into(), manifest);
    let files = session.font_files_needed("noto-sans").unwrap();
    assert!(files.iter().any(|f| f == "NotoSans-Regular.ttf"));
}

#[test]
fn font_files_needed_guards_unknown_pack_and_bad_manifest() {
    let mut session = Session::new();
    assert!(matches!(
        session.font_files_needed("ghost"),
        Err(WasmError::UnknownFontPack(id)) if id == "ghost"
    ));
    session.add_font_pack("broken".into(), "not: [a: manifest".into());
    assert!(matches!(
        session.font_files_needed("broken"),
        Err(WasmError::Fonts(_))
    ));
}

#[test]
fn font_faces_needed_pairs_each_file_with_its_url_hint() {
    // A pinned-reference manifest: one face carries a `url`, one does not.
    // The hint rides through verbatim (the host fetches exactly it); an
    // absent hint stays absent rather than becoming an empty string.
    let mut session = Session::new();
    session.add_font_pack(
        "pinned".into(),
        concat!(
            "version: 1\n",
            "license: OFL-1.1\n",
            "redistributable: true\n",
            "faces:\n",
            "  - id: lato\n",
            "    file: Lato-Regular.ttf\n",
            "    sha256: abc123\n",
            "    url: https://example.test/Lato-Regular.ttf\n",
            "  - id: local-only\n",
            "    file: Local.ttf\n",
            "    sha256: def456\n",
        )
        .into(),
    );

    let faces = session.font_faces_needed("pinned").unwrap();
    assert_eq!(faces.len(), 2);
    assert_eq!(faces[0].file, "Lato-Regular.ttf");
    assert_eq!(
        faces[0].url.as_deref(),
        Some("https://example.test/Lato-Regular.ttf")
    );
    assert_eq!(faces[1].file, "Local.ttf");
    assert_eq!(faces[1].url, None);

    // The file-name form is unchanged by the addition — same faces, same order.
    let files = session.font_files_needed("pinned").unwrap();
    assert_eq!(files, vec!["Lato-Regular.ttf", "Local.ttf"]);
}

#[test]
fn font_faces_needed_omits_an_absent_url_from_the_json() {
    // The wire the shim serializes: `url` is skipped, never `null`, so a host
    // reading `face.url === undefined` is the absent case.
    let face = crate::FaceFile {
        file: "Local.ttf".into(),
        url: None,
    };
    assert_eq!(
        serde_json::to_string(&face).unwrap(),
        r#"{"file":"Local.ttf"}"#
    );
}

#[test]
fn font_faces_needed_guards_unknown_pack_and_bad_manifest() {
    let mut session = Session::new();
    assert!(matches!(
        session.font_faces_needed("ghost"),
        Err(WasmError::UnknownFontPack(id)) if id == "ghost"
    ));
    // A hostile/corrupt injected manifest degrades to a Fonts error, no panic.
    session.add_font_pack("broken".into(), "not: [a: manifest".into());
    assert!(matches!(
        session.font_faces_needed("broken"),
        Err(WasmError::Fonts(_))
    ));
}

#[test]
fn font_faces_needed_reads_a_real_bundled_manifest() {
    let mut session = Session::new();
    let manifest = fs::read_to_string(fonts_dir().join("noto-sans/manifest.yml")).expect("read");
    session.add_font_pack("noto-sans".into(), manifest);
    let faces = session.font_faces_needed("noto-sans").unwrap();
    // The bundled packs ship their bytes, so they declare no fetch hints.
    assert!(faces.iter().any(|f| f.file == "NotoSans-Regular.ttf"));
    assert!(faces.iter().all(|f| f.url.is_none()));
}

#[test]
fn load_fonts_requires_a_locale() {
    assert!(matches!(
        Session::new().load_fonts(),
        Err(WasmError::LocaleNotSet)
    ));
}

#[test]
fn load_fonts_rejects_a_garbage_manifest() {
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    // A declared pack whose manifest is unparsable → a Fonts error, never a
    // panic, from the injected byte path.
    session.add_font_pack("biz-ud".into(), "not: [a: valid manifest".into());
    let err = session.load_fonts().unwrap_err();
    assert!(matches!(err, WasmError::Fonts(_)));
}

#[test]
fn load_fonts_builds_the_store_from_injected_bytes() {
    // The real injected path: every `uses` pack's manifest + face bytes are
    // injected, sha256/embedding verified inside the engine. Slow (reads the
    // full ja fallback chain), so it runs once.
    let mut session = Session::new();
    session.set_locale("ja-JP", None).unwrap();
    let ids = session.font_packs_needed().unwrap();
    for id in &ids {
        inject_pack(&mut session, id);
    }
    session.load_fonts().unwrap();
    assert!(session.fonts.is_some());
    // The injected packs were consumed.
    assert!(session.font_packs.is_empty());
}

#[test]
fn add_asset_file_retains_the_bytes() {
    let mut session = Session::new();
    session.add_asset_file("logo.svg".into(), vec![9, 9]);
    assert_eq!(session.assets["logo.svg"], vec![9, 9]);
}
