//! Unit tests for font-pack resolution: search-dir precedence, face
//! merge/dedup, and path confinement. The resolver reads only manifests
//! (never the font bytes), so fixtures need no real `.ttf`.

use super::*;
use std::fs;

fn tmp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("shojiku-packtest").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_pack(root: &Path, pack: &str, manifest: &str) {
    let d = root.join(pack);
    fs::create_dir_all(&d).unwrap();
    fs::write(d.join("manifest.yml"), manifest).unwrap();
}

fn locale(uses: &str) -> LangPack {
    LangPack::from_yaml_str(&format!("id: xx\nfonts:\n  uses: {uses}\n  default: a\n")).unwrap()
}

const FACE: &str =
    "version: 1\nlicense: X\nfaces:\n  - id: {ID}\n    file: {ID}.ttf\n    sha256: aa\n";

#[test]
fn merges_faces_and_first_dir_and_first_id_win() {
    let bundled = tmp("merge-bundled");
    let user = tmp("merge-user");
    // Both dirs carry pack `p`, but `user` is earlier in the list → wins.
    write_pack(&bundled, "p", &FACE.replace("{ID}", "bundled"));
    write_pack(&user, "p", &FACE.replace("{ID}", "user"));
    write_pack(&bundled, "q", &FACE.replace("{ID}", "q"));
    // uses lists p then q; a duplicate face id keeps the first occurrence.
    let dup = "version: 1\nlicense: X\nfaces:\n  \
        - id: user\n    file: dup.ttf\n    sha256: bb\n";
    write_pack(&bundled, "q", dup); // q now also declares `user` → deduped out
    let specs = resolve_face_specs(&locale("[p, q]"), &[user.clone(), bundled.clone()]).unwrap();
    let ids: Vec<_> = specs.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["user"]); // user pack's `user` face; q's dup `user` deduped
    assert_eq!(specs[0].path, user.join("p/user.ttf"));
}

#[test]
fn unknown_pack_is_not_found() {
    let dir = tmp("nf");
    let err = resolve_face_specs(&locale("[ghost]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::NotFound(ref p) if p == "ghost"));
}

#[test]
fn parent_dir_file_is_rejected() {
    let dir = tmp("trav-rel");
    write_pack(
        &dir,
        "p",
        "version: 1\nlicense: X\nfaces:\n  - id: e\n    file: ../evil.ttf\n    sha256: aa\n",
    );
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Traversal { ref id, .. } if id == "e"));
}

#[test]
fn absolute_file_is_rejected() {
    let dir = tmp("trav-abs");
    write_pack(
        &dir,
        "p",
        "version: 1\nlicense: X\nfaces:\n  - id: e\n    file: /etc/passwd\n    sha256: aa\n",
    );
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Traversal { .. }));
}

#[test]
fn malformed_manifest_is_a_parse_error() {
    let dir = tmp("parse");
    write_pack(&dir, "p", "version: not-a-number\n");
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Parse { .. }));
}

#[test]
fn unreadable_manifest_is_an_io_error() {
    // A directory named `manifest.yml` makes read_to_string fail with a
    // non-NotFound error, exercising the Io arm.
    let dir = tmp("io");
    let pack_dir = dir.join("p");
    fs::create_dir_all(pack_dir.join("manifest.yml")).unwrap();
    let err = resolve_face_specs(&locale("[p]"), &[dir]).unwrap_err();
    assert!(matches!(err, PackError::Io { .. }));
}
