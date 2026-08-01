//! Unit tests for bytes-first font-pack resolution: dedup/first-wins parity
//! with the filesystem resolver, plus the injected-specific error arms
//! (missing pack, missing bytes, malformed manifest, path confinement). The
//! resolver never verifies sha256 (that is the layout `FontStore`'s job), so
//! the fixtures' `bytes` are arbitrary placeholders.

use super::*;

fn locale(uses: &str) -> LangPack {
    LangPack::from_yaml_str(&format!("id: xx\nfonts:\n  uses: {uses}\n  default: a\n")).unwrap()
}

fn pack(id: &str, manifest: &str, files: &[(&str, &[u8])]) -> InjectedPack {
    InjectedPack {
        id: id.to_string(),
        manifest: manifest.to_string(),
        files: files
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_vec()))
            .collect(),
    }
}

const ONE: &str = "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: a.ttf\n    sha256: aa\n";

#[test]
fn resolves_bytes_and_defaults_family_to_id() {
    let specs = resolve_face_bytes(
        &locale("[p]"),
        vec![pack("p", ONE, &[("a.ttf", b"FONTBYTES")])],
    )
    .unwrap();
    assert_eq!(specs.len(), 1);
    assert_eq!(specs[0].id, "a");
    assert_eq!(specs[0].bytes, b"FONTBYTES");
    // family omitted in the manifest → defaults to the face id.
    assert_eq!(specs[0].family, "a");
    assert_eq!(specs[0].sha256, "aa");
}

#[test]
fn first_pack_and_first_id_win_on_duplicate() {
    // `uses` lists p then q; both declare face id `a`. The first occurrence
    // (pack p) wins, mirroring the filesystem resolver's user-pack shadow.
    let q = "version: 1\nlicense: X\nfaces:\n  - id: a\n    file: q.ttf\n    sha256: bb\n";
    let specs = resolve_face_bytes(
        &locale("[p, q]"),
        vec![
            pack("p", ONE, &[("a.ttf", b"P")]),
            pack("q", q, &[("q.ttf", b"Q")]),
        ],
    )
    .unwrap();
    let ids: Vec<_> = specs.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    assert_eq!(specs[0].bytes, b"P");
}

#[test]
fn duplicate_injected_pack_ids_first_wins() {
    // Two injections claim pack id `p`; the FIRST wins, mirroring the
    // filesystem resolver's first-dir-wins user-pack shadow.
    let specs = resolve_face_bytes(
        &locale("[p]"),
        vec![
            pack("p", ONE, &[("a.ttf", b"FIRST")]),
            pack("p", ONE, &[("a.ttf", b"SECOND")]),
        ],
    )
    .unwrap();
    assert_eq!(specs[0].bytes, b"FIRST");
}

#[test]
fn two_faces_may_share_one_file() {
    // The filesystem path reads a shared file once per face; the bytes path
    // must load both faces too, not consume the bytes on the first.
    let shared = "version: 1\nlicense: X\nfaces:\n  \
        - id: a\n    file: s.ttf\n    sha256: aa\n  \
        - id: b\n    file: s.ttf\n    sha256: aa\n";
    let specs = resolve_face_bytes(
        &locale("[p]"),
        vec![pack("p", shared, &[("s.ttf", b"SHARED")])],
    )
    .unwrap();
    let ids: Vec<_> = specs.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a", "b"]);
    assert_eq!(specs[0].bytes, b"SHARED");
    assert_eq!(specs[1].bytes, b"SHARED");
}

#[test]
fn uninjected_pack_is_not_found() {
    let err = resolve_face_bytes(&locale("[ghost]"), vec![]).unwrap_err();
    assert!(matches!(err, PackError::NotFound(ref p) if p == "ghost"));
}

#[test]
fn missing_face_bytes_is_an_error() {
    // Manifest declares `a.ttf` but the host injected no matching file.
    let err = resolve_face_bytes(&locale("[p]"), vec![pack("p", ONE, &[])]).unwrap_err();
    assert!(matches!(err, PackError::MissingBytes { ref id, .. } if id == "a"));
}

#[test]
fn malformed_manifest_is_a_parse_error() {
    let err =
        resolve_face_bytes(&locale("[p]"), vec![pack("p", "version: nope\n", &[])]).unwrap_err();
    assert!(matches!(err, PackError::ParseInjected { ref pack, .. } if pack == "p"));
}

#[test]
fn parent_dir_file_is_rejected() {
    let bad = "version: 1\nlicense: X\nfaces:\n  - id: e\n    file: ../evil.ttf\n    sha256: aa\n";
    let err = resolve_face_bytes(&locale("[p]"), vec![pack("p", bad, &[])]).unwrap_err();
    assert!(matches!(err, PackError::Traversal { ref id, .. } if id == "e"));
}

// --- Subset resolution (the browser-preview lenient path) ---

const TWO_Q: &str = "version: 1\nlicense: X\nfaces:\n  - id: b\n    file: b.ttf\n    sha256: bb\n";

#[test]
fn subset_skips_an_absent_pack_and_reports_it() {
    // `uses` lists p (injected) then q (absent): p's faces load, q is reported
    // missing, and the loaded faces keep `uses` order.
    let out =
        resolve_face_bytes_subset(&locale("[p, q]"), vec![pack("p", ONE, &[("a.ttf", b"A")])])
            .unwrap();
    let ids: Vec<_> = out.faces.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    assert_eq!(out.missing, vec!["q".to_string()]);
}

#[test]
fn subset_with_every_pack_present_equals_strict() {
    // All `uses` packs injected → the subset walk resolves face-for-face like
    // the strict path, with nothing missing.
    let injected = || {
        vec![
            pack("p", ONE, &[("a.ttf", b"A")]),
            pack("q", TWO_Q, &[("b.ttf", b"B")]),
        ]
    };
    let strict = resolve_face_bytes(&locale("[p, q]"), injected()).unwrap();
    let out = resolve_face_bytes_subset(&locale("[p, q]"), injected()).unwrap();
    assert!(out.missing.is_empty());
    let strict_ids: Vec<_> = strict.iter().map(|s| (s.id.as_str(), &s.bytes)).collect();
    let subset_ids: Vec<_> = out
        .faces
        .iter()
        .map(|s| (s.id.as_str(), &s.bytes))
        .collect();
    assert_eq!(strict_ids, subset_ids);
}

#[test]
fn subset_reports_every_absent_pack_uniformly() {
    // The resolver does not special-case the default-face pack: any absent
    // `uses` pack is reported, default-role handling is the layout layer's job.
    let out = resolve_face_bytes_subset(&locale("[p]"), vec![]).unwrap();
    assert!(out.faces.is_empty());
    assert_eq!(out.missing, vec!["p".to_string()]);
}

#[test]
fn subset_still_fails_on_a_malformed_injected_manifest() {
    // Leniency covers ABSENCE only — a broken manifest in an injected pack is
    // still a hard error, integrity unchanged.
    let err = resolve_face_bytes_subset(&locale("[p]"), vec![pack("p", "version: nope\n", &[])])
        .unwrap_err();
    assert!(matches!(err, PackError::ParseInjected { ref pack, .. } if pack == "p"));
}

#[test]
fn subset_still_fails_on_missing_declared_bytes() {
    let err = resolve_face_bytes_subset(&locale("[p]"), vec![pack("p", ONE, &[])]).unwrap_err();
    assert!(matches!(err, PackError::MissingBytes { ref id, .. } if id == "a"));
}

#[test]
fn subset_still_rejects_a_traversal_manifest() {
    let bad = "version: 1\nlicense: X\nfaces:\n  - id: e\n    file: ../evil.ttf\n    sha256: aa\n";
    let err = resolve_face_bytes_subset(&locale("[p]"), vec![pack("p", bad, &[])]).unwrap_err();
    assert!(matches!(err, PackError::Traversal { ref id, .. } if id == "e"));
}

#[test]
fn subset_first_injected_pack_wins_on_duplicate() {
    let out = resolve_face_bytes_subset(
        &locale("[p]"),
        vec![
            pack("p", ONE, &[("a.ttf", b"FIRST")]),
            pack("p", ONE, &[("a.ttf", b"SECOND")]),
        ],
    )
    .unwrap();
    assert_eq!(out.faces[0].bytes, b"FIRST");
    assert!(out.missing.is_empty());
}

#[test]
fn duplicate_uses_entry_resolves_once_like_the_fs_resolver() {
    // A locale listing the same pack twice must not consume the single
    // injection twice: the FS resolver tolerates the duplicate (re-read +
    // face dedupe), so the bytes path must too, not error NotFound.
    let specs =
        resolve_face_bytes(&locale("[p, p]"), vec![pack("p", ONE, &[("a.ttf", b"A")])]).unwrap();
    let ids: Vec<_> = specs.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
}

#[test]
fn subset_duplicate_uses_entry_of_a_loaded_pack_is_not_missing() {
    // The second occurrence must not report the pack the host DID inject as
    // missing — that would send the host refetching a pack it already has.
    let out =
        resolve_face_bytes_subset(&locale("[p, p]"), vec![pack("p", ONE, &[("a.ttf", b"A")])])
            .unwrap();
    let ids: Vec<_> = out.faces.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    assert!(out.missing.is_empty());
}

#[test]
fn subset_duplicate_uses_entry_of_an_absent_pack_is_reported_once() {
    let out = resolve_face_bytes_subset(&locale("[p, p]"), vec![]).unwrap();
    assert_eq!(out.missing, vec!["p".to_string()]);
}

#[test]
fn subset_ignores_an_injected_pack_the_locale_does_not_use() {
    // A pack outside `uses` is neither loaded nor reported missing.
    let out = resolve_face_bytes_subset(
        &locale("[p]"),
        vec![
            pack("p", ONE, &[("a.ttf", b"A")]),
            pack("extra", TWO_Q, &[("b.ttf", b"B")]),
        ],
    )
    .unwrap();
    let ids: Vec<_> = out.faces.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(ids, ["a"]);
    assert!(out.missing.is_empty());
}
