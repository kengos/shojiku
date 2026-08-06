//! The IO refusal paths, driven directly.
//!
//! Each one is provoked by a DIRECTORY standing where a file belongs. The
//! obvious alternative — an unreadable file — proves nothing here: the
//! gates run in a container as root, where `chmod 000` still reads. A
//! directory is refused by the kernel whoever you are, so these are the
//! same refusals a user meets and they are reachable in CI.

use super::*;
use crate::font::tests::{args, source_font, temp_dir};

#[test]
fn a_directory_given_as_the_font_file_is_a_read_failure() {
    // Metadata succeeds on a directory, so this reaches the read itself —
    // the arm that a missing file (refused earlier) never gets to.
    let dir = temp_dir("write-read-dir");
    let err = read_font(&dir).expect_err("a directory is not a font");
    assert!(matches!(err, FontPackError::Read { .. }), "{err}");
}

#[test]
fn an_unreadable_manifest_is_a_read_failure_not_a_fresh_start() {
    // `manifest.yml` as a DIRECTORY: not NotFound, so the pack must not be
    // treated as new — that would overwrite whatever the pack really holds.
    let dir = temp_dir("write-manifest-dir");
    std::fs::create_dir_all(dir.join("manifest.yml")).expect("manifest dir");
    let err = read_manifest(&dir).expect_err("a directory is not a manifest");
    assert!(matches!(err, FontPackError::Read { .. }), "{err}");
}

#[test]
fn an_absent_manifest_is_not_an_error() {
    let dir = temp_dir("write-manifest-absent");
    assert!(read_manifest(&dir).expect("absent is fine").is_none());
}

#[test]
fn an_unreadable_existing_face_is_a_read_failure() {
    let dir = temp_dir("write-face-dir");
    let pack = dir.join("p");
    std::fs::create_dir_all(pack.join("F.ttf")).expect("face dir");
    let manifest = PackManifest {
        version: 1,
        license: "OFL-1.1".to_string(),
        redistributable: false,
        embedding_attested: false,
        faces: Vec::new(),
    };
    let a = args(&dir, source_font(), "p");
    let err = commit(&pack, "p", &manifest, "F.ttf", b"bytes", &a)
        .expect_err("a directory is not a face file");
    assert!(matches!(err, FontPackError::Read { .. }), "{err}");
}

#[test]
fn a_write_onto_a_directory_is_a_write_failure() {
    let dir = temp_dir("write-file-dir");
    let target = dir.join("occupied");
    std::fs::create_dir_all(&target).expect("occupied dir");
    let err = write_file(&target, b"x").expect_err("cannot write onto a directory");
    assert!(matches!(err, FontPackError::Write { .. }), "{err}");
}

#[test]
fn a_pack_dir_under_an_existing_file_is_a_write_failure() {
    let dir = temp_dir("write-mkdir-file");
    let blocker = dir.join("blocker");
    std::fs::write(&blocker, b"not a directory").expect("blocker");
    let err = create_dir(&blocker.join("pack")).expect_err("a file is not a parent directory");
    assert!(matches!(err, FontPackError::Write { .. }), "{err}");
}

#[test]
fn a_manifest_rename_onto_a_non_empty_directory_is_a_write_failure() {
    // The tmp file writes fine and the RENAME is what fails, which is the
    // half of the atomic write that leaves the previous manifest in place.
    let dir = temp_dir("write-rename");
    let target = dir.join("target");
    std::fs::create_dir_all(&target).expect("target dir");
    std::fs::write(target.join("occupant"), b"x").expect("occupant");
    let err = write_atomically(&target, b"manifest").expect_err("rename onto a non-empty dir");
    assert!(matches!(err, FontPackError::Write { .. }), "{err}");
}
