//! Path-hardening tests for font-pack resolution: what a pack id may be
//! (at the wire AND at both resolvers), and what a manifest's `file` may
//! point at once symlinks are followed. The resolver reads only manifests,
//! so the "font files" here are ordinary bytes.

use super::*;
use crate::lang::valid_pack_id;
use std::path::PathBuf;

/// A locale whose `uses` was filled WITHOUT going through serde — the wire
/// guard cannot see this, because `LocaleFonts.uses` is a public field.
fn locale_bypassing_serde(pack_id: &str) -> LangPack {
    let mut pack = locale("[p]");
    pack.fonts.as_mut().expect("fonts").uses = vec![pack_id.to_string()];
    pack
}

fn locale_yaml(pack_id: &str) -> String {
    format!("id: xx\nfonts:\n  uses: [\"{pack_id}\"]\n  default: a\n")
}

#[test]
fn every_bundled_pack_id_is_valid() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs/fonts");
    let ids: Vec<String> = fs::read_dir(&dir)
        .expect("packs/fonts")
        .map(|e| e.expect("entry"))
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    // A charset the shipped packs failed would be a wrong charset, so the
    // count is the positive control: an empty read would pass vacuously.
    assert!(ids.len() >= 7, "expected the bundled packs, found {ids:?}");
    for id in ids {
        assert!(valid_pack_id(&id), "bundled pack id rejected: {id}");
    }
}

#[test]
fn a_hostile_uses_entry_fails_the_locale_parse() {
    // The positive control first: a real id parses, so a rejection below
    // is the pack-id guard and not some unrelated YAML problem.
    assert!(LangPack::from_yaml_str(&locale_yaml("noto-sans")).is_ok());
    let over_long = "p".repeat(MAX_PACK_ID + 1);
    for bad in ["../evil", "/etc", "a/b", "", &over_long] {
        let err = LangPack::from_yaml_str(&locale_yaml(bad)).unwrap_err();
        assert!(
            err.to_string().contains("pack id"),
            "`{bad}` rejected for the wrong reason: {err}"
        );
    }
}

#[test]
fn a_hostile_pack_id_is_rejected_by_the_filesystem_resolver() {
    let dir = tmp("badid-fs");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    let err = resolve_face_specs(&locale_bypassing_serde("../p"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::InvalidPackId(_)), "{err}");
}

#[test]
fn a_hostile_pack_id_is_rejected_by_both_bytes_resolvers() {
    // The bytes path builds no filesystem path, but it must answer the
    // same edge input the same way — the two resolvers claim parity.
    let pack = locale_bypassing_serde("../p");
    let strict = resolve_face_bytes(&pack, vec![]).unwrap_err();
    assert!(matches!(strict, PackError::InvalidPackId(_)), "{strict}");
    // The lenient path reports an absent pack instead of failing; an
    // invalid id is NOT absence, so it must still fail loudly.
    let subset = resolve_face_bytes_subset(&pack, vec![]).unwrap_err();
    assert!(matches!(subset, PackError::InvalidPackId(_)), "{subset}");
}

#[test]
fn an_absent_face_file_still_resolves() {
    // A pinned pack travels without its files and a host fetch layer fills
    // them in later, so resolution must not require the file to exist.
    let dir = tmp("absent-face");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    let specs = resolve_face_specs(&locale("[p]"), &[dir]).expect("resolve");
    assert_eq!(specs.len(), 1);
    assert!(!specs[0].path.exists());
}

#[test]
fn a_font_dir_that_does_not_exist_is_skipped() {
    let dir = tmp("missing-dir");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    let ghost = dir.join("no-such-dir");
    let specs = resolve_face_specs(&locale("[p]"), &[ghost.clone(), dir]).expect("resolve");
    assert_eq!(specs.len(), 1);
    let err = resolve_face_specs(&locale("[p]"), &[ghost]).unwrap_err();
    assert!(matches!(err, PackError::NotFound(_)), "{err}");
}

#[cfg(unix)]
#[test]
fn a_symlinked_face_escaping_the_pack_is_a_traversal() {
    let dir = tmp("sym-escape");
    let outside = tmp("sym-escape-outside");
    fs::write(outside.join("secret.ttf"), b"x").expect("write");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    std::os::unix::fs::symlink(outside.join("secret.ttf"), dir.join("p/p.ttf")).expect("symlink");
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(
        matches!(err, PackError::Traversal { ref id, .. } if id == "p"),
        "{err}"
    );
}

#[cfg(unix)]
#[test]
fn a_symlinked_face_inside_the_pack_resolves() {
    let dir = tmp("sym-inside");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    fs::write(dir.join("p/real.ttf"), b"x").expect("write");
    std::os::unix::fs::symlink(dir.join("p/real.ttf"), dir.join("p/p.ttf")).expect("symlink");
    let specs = resolve_face_specs(&locale("[p]"), &[dir]).expect("resolve");
    assert_eq!(specs.len(), 1);
}

#[cfg(unix)]
#[test]
fn a_dangling_symlinked_face_is_an_io_error() {
    let dir = tmp("sym-dangling");
    write_pack(&dir, "p", &FACE.replace("{ID}", "p"));
    std::os::unix::fs::symlink(dir.join("p/nowhere.ttf"), dir.join("p/p.ttf")).expect("symlink");
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Io { .. }), "{err}");
}

#[cfg(unix)]
#[test]
fn a_symlinked_directory_component_is_a_traversal() {
    let dir = tmp("sym-dir");
    let outside = tmp("sym-dir-outside");
    fs::write(outside.join("f.ttf"), b"x").expect("write");
    let manifest = "version: 1\nlicense: X\nfaces:\n  \
        - id: p\n    file: sub/f.ttf\n    sha256: aa\n";
    write_pack(&dir, "p", manifest);
    std::os::unix::fs::symlink(&outside, dir.join("p/sub")).expect("symlink");
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Traversal { .. }), "{err}");
}

#[cfg(unix)]
#[test]
fn a_symlinked_pack_directory_is_refused() {
    let dir = tmp("sym-packdir");
    let outside = tmp("sym-packdir-outside");
    write_pack(&outside, "p", &FACE.replace("{ID}", "p"));
    std::os::unix::fs::symlink(outside.join("p"), dir.join("p")).expect("symlink");
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(
        matches!(err, PackError::PackTraversal(ref p) if p == "p"),
        "{err}"
    );
}
