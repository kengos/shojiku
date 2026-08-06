//! `font add` behavior over a real font file and a real directory.
//!
//! The claim these tests exist to make is not "bytes arrived": it is that
//! a pack this command writes is one the ENGINE loads. So the happy-path
//! case resolves and loads the generated pack through the shipped resolver
//! and `FontStore`, which is the only thing that proves the sha256 and the
//! embedding state are what the loader wants.

use super::*;
use crate::args::{FontStyleArg, FontWeightArg};
use std::path::Path;

mod hostile;

/// A temp dir tagged per TEST, not just per process: two tests writing the
/// same fixture file name have raced in this repo before.
pub(super) fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("shojiku-font-add-{}-{tag}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

pub(super) fn repo_packs() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs")
}

/// A real, loadable face to add. `noto-sans` is unrestricted and small.
pub(super) fn source_font() -> PathBuf {
    repo_packs().join("fonts/noto-sans/NotoSans-Regular.ttf")
}

pub(super) fn args(dir: &Path, file: PathBuf, family: &str) -> crate::FontAddArgs {
    crate::FontAddArgs {
        file,
        family: family.to_string(),
        license: "OFL-1.1".to_string(),
        pack: None,
        face_id: None,
        weight: FontWeightArg::Normal,
        style: FontStyleArg::Normal,
        url: None,
        license_file: None,
        redistributable: false,
        embedding_attested: false,
        dir: Some(dir.to_path_buf()),
    }
}

/// Reads back what was written, through the REAL manifest parser.
pub(super) fn written(dir: &Path, pack: &str) -> PackManifest {
    let text = std::fs::read_to_string(dir.join(pack).join("manifest.yml")).expect("manifest");
    PackManifest::from_yaml(&text).expect("manifest parses")
}

#[test]
fn adds_a_face_and_the_engine_loads_the_pack() {
    let dir = temp_dir("loads");
    let added = add_face(&args(&dir, source_font(), "my-sans")).expect("added");
    assert_eq!(added.pack, "my-sans");
    assert_eq!(added.face_id, "my-sans");
    assert!(dir.join("my-sans/NotoSans-Regular.ttf").is_file());

    let manifest = written(&dir, "my-sans");
    assert_eq!(manifest.version, 1);
    assert_eq!(manifest.license, "OFL-1.1");
    assert_eq!(manifest.faces.len(), 1);
    assert_eq!(manifest.faces[0].file, "NotoSans-Regular.ttf");

    // The end of the chain: a locale naming this pack resolves it and the
    // store loads it — sha256 verified and fsType checked by the loader.
    let pack = locale_using("my-sans");
    let specs =
        shojiku_formatter::resolve_face_specs(&pack, std::slice::from_ref(&dir)).expect("resolve");
    assert_eq!(specs.len(), 1);
    shojiku_layout::FontStore::load_from_specs(specs, &pack).expect("loads");
}

/// A minimal locale pack whose `fonts.uses` names one pack, so the generated
/// pack can be resolved exactly as a render would resolve it.
pub(super) fn locale_using(pack_id: &str) -> shojiku_formatter::LangPack {
    let yaml = format!("fonts:\n  uses: [{pack_id}]\n  default: {pack_id}\n");
    shojiku_formatter::LangPack::builtin("en-US", Some(&yaml))
        .expect("locale")
        .expect("en-US is a builtin")
}

#[test]
fn an_unset_variant_writes_no_key_at_all() {
    let dir = temp_dir("defaults");
    add_face(&args(&dir, source_font(), "plain")).expect("added");
    let text = std::fs::read_to_string(dir.join("plain/manifest.yml")).expect("manifest");
    // Skip-when-unset is what keeps a generated manifest free of keys its
    // author never wrote — and `family` equal to the id says nothing.
    for key in ["weight:", "style:", "family:", "url:", "redistributable:"] {
        assert!(!text.contains(key), "manifest carries `{key}`:\n{text}");
    }
}

#[test]
fn a_bold_face_records_its_family_and_weight() {
    let dir = temp_dir("bold");
    let mut a = args(&dir, source_font(), "duo");
    a.weight = FontWeightArg::Bold;
    a.file = repo_packs().join("fonts/noto-sans/NotoSans-Bold.ttf");
    let added = add_face(&a).expect("added");
    assert_eq!(added.face_id, "duo-bold");

    let manifest = written(&dir, "duo");
    let face = &manifest.faces[0];
    assert_eq!(face.family.as_deref(), Some("duo"));
    assert_eq!(face.weight, Some(shojiku_core::FontWeight::Bold));
    assert_eq!(face.style, None);
}

#[test]
fn an_italic_face_records_its_style_and_suffixed_id() {
    let dir = temp_dir("italic");
    let mut a = args(
        &dir,
        repo_packs().join("fonts/noto-sans/NotoSans-Italic.ttf"),
        "slanted",
    );
    a.style = FontStyleArg::Italic;
    let added = add_face(&a).expect("added");
    assert_eq!(added.face_id, "slanted-italic");

    let face = &written(&dir, "slanted").faces[0];
    assert_eq!(face.style, Some(shojiku_core::FontStyle::Italic));
    assert_eq!(face.weight, None);
    assert_eq!(face.family.as_deref(), Some("slanted"));
}

#[test]
fn a_second_invocation_merges_into_the_same_pack() {
    let dir = temp_dir("merge");
    add_face(&args(&dir, source_font(), "duo")).expect("regular");
    let first = std::fs::read(dir.join("duo/NotoSans-Regular.ttf")).expect("first face");

    let mut bold = args(
        &dir,
        repo_packs().join("fonts/noto-sans/NotoSans-Bold.ttf"),
        "duo",
    );
    bold.weight = FontWeightArg::Bold;
    add_face(&bold).expect("bold");

    let manifest = written(&dir, "duo");
    // Appended, so declaration order records the order they were added.
    assert_eq!(
        manifest
            .faces
            .iter()
            .map(|f| f.id.as_str())
            .collect::<Vec<_>>(),
        ["duo", "duo-bold"]
    );
    assert_eq!(
        std::fs::read(dir.join("duo/NotoSans-Regular.ttf")).expect("first face"),
        first,
        "the earlier face's bytes were disturbed"
    );
    // Both faces of the merged pack load together.
    let pack = locale_using("duo");
    let specs =
        shojiku_formatter::resolve_face_specs(&pack, std::slice::from_ref(&dir)).expect("resolve");
    assert_eq!(specs.len(), 2);
    shojiku_layout::FontStore::load_from_specs(specs, &pack).expect("loads");
}

#[test]
fn explicit_ids_and_a_pin_hint_are_written_through() {
    let dir = temp_dir("explicit");
    let mut a = args(&dir, source_font(), "the-family");
    a.pack = Some("the-pack".to_string());
    a.face_id = Some("the-face".to_string());
    a.url = Some("https://example.test/f.ttf".to_string());
    a.redistributable = true;
    let added = add_face(&a).expect("added");
    assert_eq!(added.pack, "the-pack");
    assert_eq!(added.face_id, "the-face");

    let manifest = written(&dir, "the-pack");
    assert!(manifest.redistributable);
    assert_eq!(
        manifest.faces[0].url.as_deref(),
        Some("https://example.test/f.ttf")
    );
    assert_eq!(manifest.faces[0].family.as_deref(), Some("the-family"));
}

#[test]
fn a_license_file_is_copied_beside_the_faces() {
    let dir = temp_dir("license");
    let src = dir.join("OFL.txt");
    std::fs::write(&src, b"the licence text").expect("write licence");
    let mut a = args(&dir, source_font(), "licensed");
    a.license_file = Some(src);
    add_face(&a).expect("added");
    assert_eq!(
        std::fs::read(dir.join("licensed/OFL.txt")).expect("copied licence"),
        b"the licence text"
    );
}

#[test]
fn the_sha256_pins_the_bytes_that_were_written() {
    let dir = temp_dir("sha");
    add_face(&args(&dir, source_font(), "pinned")).expect("added");
    let manifest = written(&dir, "pinned");
    let bytes = std::fs::read(dir.join("pinned/NotoSans-Regular.ttf")).expect("face");
    assert_eq!(
        manifest.faces[0].sha256,
        shojiku_layout::face_sha256(&bytes)
    );
}

#[test]
fn the_default_pack_dir_is_the_first_resolved_font_dir() {
    // With no `--dir`, the pack lands where a render would look first —
    // otherwise it would need `--font-dir` to be found again.
    let mut a = args(Path::new("unused"), source_font(), "somewhere");
    a.dir = None;
    let dir = super::write::pack_dir(&a, "somewhere");
    assert!(
        dir.ends_with("packs/fonts/somewhere"),
        "unexpected default dir: {}",
        dir.display()
    );
}
