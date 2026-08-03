//! Unit tests for the pack-manifest and locale font-policy wire types.

use super::*;
use std::path::Path;

const MANIFEST: &str = r#"
version: 1
license: OFL-1.1
redistributable: true
faces:
  - id: sans
    file: sans.ttf
    sha256: aa
  - id: sans-bold
    file: sans-bold.ttf
    sha256: bb
    family: sans
    weight: bold
"#;

#[test]
fn manifest_face_specs_apply_variant_defaults_and_join_paths() {
    let m: PackManifest = serde_yaml::from_str(MANIFEST).expect("parse");
    assert_eq!(m.version, 1);
    assert_eq!(m.license, "OFL-1.1");
    assert!(m.redistributable);
    assert!(!m.embedding_attested);
    let specs = m.face_specs("sans-pack", Path::new("/p/sans"));
    assert_eq!(specs.len(), 2);
    // Defaults: family = id, weight/style = normal, path joined, sha carried.
    assert_eq!(specs[0].family, "sans");
    assert_eq!(specs[0].weight, FontWeight::Normal);
    assert_eq!(specs[0].style, FontStyle::Normal);
    assert_eq!(specs[0].path, PathBuf::from("/p/sans/sans.ttf"));
    assert_eq!(specs[0].sha256, "aa");
    assert!(!specs[0].embedding_attested);
    // No `url:` in the manifest → no fetch hint; the pack id is carried.
    assert_eq!(specs[0].url, None);
    assert_eq!(specs[0].pack, "sans-pack");
    // Explicit family + weight.
    assert_eq!(specs[1].family, "sans");
    assert_eq!(specs[1].weight, FontWeight::Bold);
}

#[test]
fn embedding_attested_propagates_to_every_face() {
    let m: PackManifest = serde_yaml::from_str(
        "version: 1\nlicense: X\nembeddingAttested: true\n\
         faces:\n  - id: a\n    file: a.ttf\n    sha256: aa\n",
    )
    .expect("parse");
    assert!(m
        .face_specs("p", Path::new("/p"))
        .iter()
        .all(|f| f.embedding_attested));
}

#[test]
fn manifest_rejects_unknown_keys() {
    let bad = "version: 1\nlicense: X\nfaces: []\nbogus: 1\n";
    assert!(serde_yaml::from_str::<PackManifest>(bad).is_err());
}

#[test]
fn face_variant_keys_round_trip_and_skip_when_unset() {
    let m: PackManifest = serde_yaml::from_str(MANIFEST).expect("parse");
    let out = serde_yaml::to_string(&m).expect("serialize");
    assert!(out.contains("family: sans"), "got: {out}");
    assert!(out.contains("weight: bold"), "got: {out}");
    assert!(out.contains("sha256: aa"), "got: {out}");
    // A plain face injects no variant keys.
    let plain: PackManifest = serde_yaml::from_str(
        "version: 1\nlicense: X\nfaces:\n  - id: s\n    file: s.ttf\n    sha256: aa\n",
    )
    .expect("parse");
    let out2 = serde_yaml::to_string(&plain).expect("serialize");
    assert!(!out2.contains("weight:"), "injected weight: {out2}");
    assert!(!out2.contains("family:"), "injected family: {out2}");
}

#[test]
fn face_url_parses_and_rides_the_spec_as_a_hint() {
    let m: PackManifest = serde_yaml::from_str(
        "version: 1\nlicense: X\nfaces:\n  - id: s\n    file: s.ttf\n    sha256: aa\n    \
         url: https://fonts.example/s.ttf\n",
    )
    .expect("parse");
    assert_eq!(
        m.faces[0].url.as_deref(),
        Some("https://fonts.example/s.ttf")
    );
    let specs = m.face_specs("p", Path::new("/p"));
    assert_eq!(specs[0].url.as_deref(), Some("https://fonts.example/s.ttf"));
    // The hint round-trips verbatim.
    let out = serde_yaml::to_string(&m).expect("serialize");
    assert!(
        out.contains("url: https://fonts.example/s.ttf"),
        "got: {out}"
    );
}

#[test]
fn manifest_without_optional_keys_injects_none_of_them() {
    let plain: PackManifest = serde_yaml::from_str(
        "version: 1\nlicense: X\nfaces:\n  - id: s\n    file: s.ttf\n    sha256: aa\n",
    )
    .expect("parse");
    let out = serde_yaml::to_string(&plain).expect("serialize");
    // Unset keys stay unwritten, so a generated manifest carries only what
    // its author wrote (the Designer's "only touched keys change" policy).
    for key in ["url:", "redistributable:", "embeddingAttested:"] {
        assert!(!out.contains(key), "injected {key}: {out}");
    }
}

#[test]
fn manifest_true_flags_still_serialize() {
    let m: PackManifest = serde_yaml::from_str(
        "version: 1\nlicense: X\nredistributable: true\nembeddingAttested: true\n\
         faces:\n  - id: s\n    file: s.ttf\n    sha256: aa\n",
    )
    .expect("parse");
    let out = serde_yaml::to_string(&m).expect("serialize");
    assert!(out.contains("redistributable: true"), "got: {out}");
    assert!(out.contains("embeddingAttested: true"), "got: {out}");
}

#[test]
fn face_rejects_unknown_keys() {
    let bad = "version: 1\nlicense: X\nfaces:\n  - id: s\n    file: s.ttf\n    \
               sha256: aa\n    hover: x\n";
    assert!(serde_yaml::from_str::<PackManifest>(bad).is_err());
}

#[test]
fn locale_fonts_parses_uses_default_fallback() {
    let lf: LocaleFonts = serde_yaml::from_str(
        "uses: [biz-ud, ipamj-mincho]\ndefault: biz-udp-gothic\nfallback: [ipamj-mincho]\n",
    )
    .expect("parse");
    assert_eq!(lf.uses, ["biz-ud", "ipamj-mincho"]);
    assert_eq!(lf.default, "biz-udp-gothic");
    assert_eq!(lf.fallback, ["ipamj-mincho"]);
    // fallback omitted → empty, and does not serialize back.
    let none: LocaleFonts = serde_yaml::from_str("uses: [x]\ndefault: d\n").expect("parse");
    assert!(none.fallback.is_empty());
    assert!(!serde_yaml::to_string(&none).unwrap().contains("fallback"));
}

#[test]
fn locale_fonts_rejects_unknown_keys() {
    assert!(serde_yaml::from_str::<LocaleFonts>("uses: [x]\ndefault: d\nbogus: 1\n").is_err());
}

#[test]
fn locale_fonts_rejects_a_uses_entry_that_is_not_a_pack_id() {
    // The guard belongs to this struct's parse, so it is pinned here as
    // well as through a whole locale pack: a `uses` entry names a
    // DIRECTORY, and `LocaleFonts` is where that becomes true.
    let over_long = "p".repeat(MAX_PACK_ID + 1);
    for bad in ["../evil", "/etc", "a/b", ".", "", &over_long] {
        let yaml = format!("uses: [\"{bad}\"]\ndefault: d\n");
        assert!(
            serde_yaml::from_str::<LocaleFonts>(&yaml).is_err(),
            "accepted `{bad}` as a pack id"
        );
    }
    // …and still takes the shapes the shipped packs use.
    for good in ["biz-ud", "noto_sans", "Gf-Lato2"] {
        let yaml = format!("uses: [\"{good}\"]\ndefault: d\n");
        assert!(
            serde_yaml::from_str::<LocaleFonts>(&yaml).is_ok(),
            "rejected `{good}`"
        );
    }
}
