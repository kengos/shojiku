//! Unit tests for font-pack resolution: search-dir precedence, face
//! merge/dedup, and path confinement. The resolver reads only manifests
//! (never the font bytes), so fixtures need no real `.ttf`.

use super::*;
use crate::lang::MAX_PACK_ID;
use shojiku_diagnostics::Echo;
use std::fs;
use std::path::Path;

mod hardening;

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
fn an_extra_pack_resolves_before_the_locales_own_and_shadows_a_face_id() {
    // The `--font-pack` rule: a host-added pack resolves FIRST, so when it
    // declares a face id the locale's own pack also declares, the user's
    // face is the one that survives the dedupe. Same "earlier wins" the
    // search-dir precedence uses — this pins which side is earlier.
    let root = tmp("extra-shadow");
    write_pack(
        &root,
        "bundled",
        "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: bundled.ttf\n    sha256: aa\n",
    );
    write_pack(
        &root,
        "mine",
        "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: mine.ttf\n    sha256: bb\n",
    );

    // Without the extra, the locale's own pack provides `a`.
    let own = resolve_face_specs(&locale("[bundled]"), std::slice::from_ref(&root)).unwrap();
    assert_eq!(own[0].pack, "bundled");
    assert_eq!(own[0].sha256, "aa");

    // With it, the extra shadows that face — and contributes no second one.
    let extra = ["mine".to_string()];
    let specs =
        resolve_face_specs_with(&locale("[bundled]"), std::slice::from_ref(&root), &extra).unwrap();
    let ids: Vec<_> = specs.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    assert_eq!(specs[0].pack, "mine");
    assert_eq!(specs[0].sha256, "bb");
}

#[test]
fn an_extra_pack_id_is_guarded_exactly_as_a_locales_own_entry_is() {
    // `--font-pack` is host input and bypasses the locale wire's own serde
    // guard, so the resolver re-checks it rather than trusting the flag.
    let root = tmp("extra-guard");
    write_pack(&root, "p", &FACE.replace("{ID}", "p"));
    let hostile = ["../evil".to_string()];
    let err = resolve_face_specs_with(&locale("[p]"), std::slice::from_ref(&root), &hostile)
        .expect_err("a traversal id must not be looked up");
    assert!(matches!(err, PackError::InvalidPackId(ref id) if id == "../evil"));
}

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

    // Rooted at the CANONICAL search dir — a temp dir is itself reached
    // through a symlink on some platforms.
    let root = user.canonicalize().expect("canonicalize");
    assert_eq!(specs[0].path, root.join("p/user.ttf"));
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

/// A hostile pack id: over the echo cap and carrying a terminal escape.
fn hostile_id() -> String {
    format!("\u{1b}[2J\u{7}{}", "p".repeat(10_000))
}

#[test]
fn pack_errors_bound_every_echoed_manifest_value() {
    // A manifest names its own packs and faces, so every id in these
    // messages is text the document chose. The field type is what bounds
    // them — there is no per-site call left to forget.
    let errors = [
        PackError::NotFound(Echo::from(hostile_id())),
        PackError::Traversal {
            pack: Echo::from(hostile_id()),
            id: Echo::from(hostile_id()),
        },
        PackError::MissingBytes {
            pack: Echo::from(hostile_id()),
            id: Echo::from(hostile_id()),
        },
        PackError::ParseInjected {
            pack: Echo::from(hostile_id()),
            detail: Echo::from(hostile_id()),
        },
        PackError::Parse {
            path: Echo::from(hostile_id()),
            detail: Echo::from(hostile_id()),
        },
        PackError::InvalidPackId(Echo::clipped_to(&hostile_id(), MAX_PACK_ID)),
        PackError::PackTraversal(Echo::from(hostile_id())),
    ];
    for err in errors {
        let message = err.to_string();
        assert!(
            !message.chars().any(char::is_control),
            "control character survived: {message:?}"
        );
        // Two echoed values at most, each capped, plus fixed prose.
        assert!(
            message.chars().count() < 2 * (shojiku_diagnostics::MAX_ECHO + 1) + 200,
            "unbounded pack error ({} chars)",
            message.chars().count()
        );
    }
}

#[test]
fn a_hostile_manifest_reaches_the_bound_through_a_real_resolve() {
    // The constructed cases above pin the type; this one proves the real
    // path builds them that way. An id that escapes its pack dir is the
    // cheapest reachable construction.
    let err = confine("../../etc/passwd", &hostile_id(), &hostile_id()).unwrap_err();
    let message = err.to_string();
    assert!(!message.chars().any(char::is_control));
    assert!(
        message.contains('…'),
        "expected a truncation marker: {message:?}"
    );
}
