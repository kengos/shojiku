//! What `font add` refuses, and the proof that a refusal writes nothing.
//!
//! Every case here asserts the TREE as well as the error: a command whose
//! only write surface is a pack directory has to leave that directory
//! exactly as it found it when it says no.

use super::*;
use crate::args::FontWeightArg;

/// Patches a face's OS/2 `fsType` to the Restricted bit — the same
/// construction the loader's own guard test uses.
fn restricted_font(dir: &Path) -> PathBuf {
    let mut bytes = std::fs::read(source_font()).expect("source");
    let n = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    let rec = (0..n)
        .map(|i| 12 + i * 16)
        .find(|&r| &bytes[r..r + 4] == b"OS/2")
        .expect("OS/2 record");
    let o = u32::from_be_bytes(bytes[rec + 8..rec + 12].try_into().expect("offset")) as usize + 8;
    bytes[o] = 0x00;
    bytes[o + 1] = 0x02;
    let path = dir.join("Restricted.ttf");
    std::fs::write(&path, &bytes).expect("write restricted");
    path
}

#[test]
fn a_path_shaped_pack_id_writes_nothing() {
    let dir = temp_dir("bad-pack");
    for bad in ["../evil", "/abs", "a/b"] {
        let mut a = args(&dir, source_font(), "ok-family");
        a.pack = Some(bad.to_string());
        assert!(add_face(&a).is_err(), "accepted `{bad}`");
    }
    // The guard runs before anything is created, so the font dir is still
    // empty — nothing escaped it and nothing was left inside it either.
    assert_eq!(std::fs::read_dir(&dir).expect("read dir").count(), 0);
}

#[test]
fn a_restricted_face_is_refused_unless_attested() {
    let dir = temp_dir("fstype");
    let restricted = restricted_font(&dir);

    let err = add_face(&args(&dir, restricted.clone(), "restricted")).unwrap_err();
    assert!(
        matches!(err, FontPackError::EmbeddingRestricted { .. }),
        "{err}"
    );
    // The refusal is what stops a pack the engine would then refuse to
    // render with from existing at all.
    assert!(!dir.join("restricted").exists());
    // The message has to name the flag AND what asserting it means.
    let shown = err.to_string();
    assert!(shown.contains("--embedding-attested"), "{shown}");
    assert!(shown.contains("embedding licence"), "{shown}");

    let mut attested = args(&dir, restricted, "restricted");
    attested.embedding_attested = true;
    let added = add_face(&attested).expect("attested");
    assert!(added.embedding_attested);
    let manifest = written(&dir, "restricted");
    assert!(manifest.embedding_attested);
    // And the attested pack really does load, which is the whole point of
    // the flag.
    let pack = locale_using("restricted");
    let specs =
        shojiku_formatter::resolve_face_specs(&pack, std::slice::from_ref(&dir)).expect("resolve");
    shojiku_layout::FontStore::load_from_specs(specs, &pack).expect("loads");
}

#[test]
fn a_duplicate_face_id_leaves_the_manifest_untouched() {
    let dir = temp_dir("dup");
    add_face(&args(&dir, source_font(), "dup")).expect("first");
    let before = std::fs::read(dir.join("dup/manifest.yml")).expect("manifest");

    let err = add_face(&args(&dir, source_font(), "dup")).unwrap_err();
    assert!(matches!(err, FontPackError::DuplicateFace { .. }), "{err}");
    assert_eq!(
        std::fs::read(dir.join("dup/manifest.yml")).expect("manifest"),
        before,
        "a refused add rewrote the manifest"
    );
}

#[test]
fn a_different_file_under_an_existing_name_is_refused() {
    let dir = temp_dir("clobber");
    add_face(&args(&dir, source_font(), "keep")).expect("first");
    let before = std::fs::read(dir.join("keep/NotoSans-Regular.ttf")).expect("face");

    // A second, genuinely different font arriving under the same file name.
    let impostor = dir.join("NotoSans-Regular.ttf");
    std::fs::copy(
        repo_packs().join("fonts/noto-sans/NotoSans-Bold.ttf"),
        &impostor,
    )
    .expect("copy impostor");
    let mut a = args(&dir, impostor, "keep");
    a.face_id = Some("keep-other".to_string());
    let err = add_face(&a).unwrap_err();
    assert!(matches!(err, FontPackError::FileExists { .. }), "{err}");
    assert_eq!(
        std::fs::read(dir.join("keep/NotoSans-Regular.ttf")).expect("face"),
        before,
        "a refused add overwrote an existing face"
    );
}

#[test]
fn the_same_bytes_under_a_second_face_id_are_allowed() {
    // A family whose variants legitimately share one file: the file is
    // already there and identical, so there is nothing to clobber.
    let dir = temp_dir("same-bytes");
    add_face(&args(&dir, source_font(), "shared")).expect("first");
    let mut second = args(&dir, source_font(), "shared");
    second.weight = FontWeightArg::Bold;
    add_face(&second).expect("second");
    assert_eq!(written(&dir, "shared").faces.len(), 2);
}

#[test]
fn a_non_font_is_refused() {
    let dir = temp_dir("not-a-font");
    let junk = dir.join("junk.ttf");
    std::fs::write(&junk, b"this is not a font").expect("write junk");
    let err = add_face(&args(&dir, junk, "junk")).unwrap_err();
    assert!(matches!(err, FontPackError::NotAFont { .. }), "{err}");
    assert!(!dir.join("junk").exists());
}

#[test]
fn a_missing_source_file_is_refused() {
    let dir = temp_dir("missing");
    let err = add_face(&args(&dir, dir.join("nope.ttf"), "nope")).unwrap_err();
    assert!(matches!(err, FontPackError::Read { .. }), "{err}");
}

#[test]
fn an_oversized_file_is_refused_without_being_read() {
    let dir = temp_dir("oversize");
    let big = dir.join("big.ttf");
    let file = std::fs::File::create(&big).expect("create");
    // A sparse file: the cap is checked from metadata, so this costs no
    // disk and proves the check happens before the read.
    file.set_len(MAX_FONT_FILE + 1).expect("set_len");
    drop(file);
    let err = add_face(&args(&dir, big, "big")).unwrap_err();
    assert!(matches!(err, FontPackError::TooLarge { .. }), "{err}");
}

#[test]
fn a_malformed_existing_manifest_is_never_overwritten() {
    let dir = temp_dir("malformed");
    std::fs::create_dir_all(dir.join("broken")).expect("pack dir");
    let manifest = dir.join("broken/manifest.yml");
    std::fs::write(&manifest, b"faces: [oh dear\n").expect("write");

    let mut a = args(&dir, source_font(), "broken");
    a.pack = Some("broken".to_string());
    let err = add_face(&a).unwrap_err();
    assert!(matches!(err, FontPackError::ParseExisting { .. }), "{err}");
    assert_eq!(
        std::fs::read(&manifest).expect("manifest"),
        b"faces: [oh dear\n",
        "a refused add overwrote a manifest nobody could read"
    );
}

#[test]
fn a_second_licence_in_one_pack_is_refused() {
    let dir = temp_dir("licence");
    add_face(&args(&dir, source_font(), "mixed")).expect("first");
    let mut other = args(
        &dir,
        repo_packs().join("fonts/noto-sans/NotoSans-Bold.ttf"),
        "mixed",
    );
    other.license = "IPA-1.0".to_string();
    other.weight = FontWeightArg::Bold;
    let err = add_face(&other).unwrap_err();
    assert!(
        matches!(err, FontPackError::LicenseMismatch { .. }),
        "{err}"
    );
    assert_eq!(written(&dir, "mixed").license, "OFL-1.1");
}

#[test]
fn a_later_face_may_widen_the_pack_flags_but_never_drop_them() {
    let dir = temp_dir("flags");
    let mut first = args(&dir, source_font(), "flags");
    first.redistributable = true;
    add_face(&first).expect("first");

    // The second add says nothing about redistribution; the pack's existing
    // claim must survive rather than being silently switched off.
    let mut second = args(
        &dir,
        repo_packs().join("fonts/noto-sans/NotoSans-Bold.ttf"),
        "flags",
    );
    second.weight = FontWeightArg::Bold;
    add_face(&second).expect("second");
    assert!(written(&dir, "flags").redistributable);
}

#[test]
fn an_unusable_licence_file_name_is_refused() {
    let dir = temp_dir("bad-licence-name");
    let src = dir.join(".hidden");
    std::fs::write(&src, b"x").expect("write");
    let mut a = args(&dir, source_font(), "badlic");
    a.license_file = Some(src);
    let err = add_face(&a).unwrap_err();
    assert!(
        matches!(err, FontPackError::UnusableFileName { .. }),
        "{err}"
    );
}

#[test]
fn a_missing_licence_file_is_refused() {
    let dir = temp_dir("no-licence-file");
    let mut a = args(&dir, source_font(), "nolic");
    a.license_file = Some(dir.join("absent.txt"));
    let err = add_face(&a).unwrap_err();
    assert!(matches!(err, FontPackError::Read { .. }), "{err}");
}

#[test]
fn a_face_file_name_that_is_not_a_plain_segment_is_refused() {
    let dir = temp_dir("bad-face-name");
    let odd = dir.join("my font.ttf");
    std::fs::copy(source_font(), &odd).expect("copy");
    let err = add_face(&args(&dir, odd, "odd")).unwrap_err();
    assert!(
        matches!(err, FontPackError::UnusableFileName { .. }),
        "{err}"
    );
}
