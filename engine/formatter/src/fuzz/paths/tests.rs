//! The `formatter_pack_paths` harness: confined faces resolve through both
//! resolvers, and each assertion panics on the input it checks for.

use super::*;

const SHA: &str = "0000000000000000000000000000000000000000000000000000000000000000";

fn locale(uses: &str) -> String {
    format!("id: xx\nfonts:\n  uses: [{uses}]\n  default: f\n")
}

fn manifest(file: &str) -> String {
    format!(
        "version: 1\nlicense: OFL-1.1\nfaces:\n  - id: f\n    file: \"{file}\"\n    sha256: \"{SHA}\"\n"
    )
}

fn face(id: &str) -> FaceBytes {
    let resolved = resolve_face_bytes(
        &LangPack::from_yaml_str(&locale("p")).expect("the locale pack parses"),
        vec![InjectedPack {
            id: "p".to_string(),
            manifest: manifest("f.ttf").replace("id: f", &format!("id: {id}")),
            files: BTreeMap::from([("f.ttf".to_string(), vec![0])]),
        }],
    );
    resolved.expect("the pack resolves").remove(0)
}

#[test]
fn a_confined_face_resolves_and_a_missing_pack_resolves_no_face() {
    // Positive control: the manifest these cases use does resolve to a face.
    assert_eq!(face("f").id, "f");
    // `q` is never injected: the strict resolver refuses, the subset one
    // reports it missing.
    assert_eq!(
        pack_paths(&format!("{}---\n{}", locale("p, q"), manifest("dir/f.ttf"))),
        0
    );
    assert_eq!(
        pack_paths(&format!("{}---\n{}", locale("p"), manifest("f.ttf"))),
        1
    );
}

#[test]
fn a_traversal_an_unparsable_input_or_a_pack_without_fonts_uses_resolves_no_face() {
    for input in [
        format!("{}---\n{}", locale("p"), manifest("../../etc/passwd")),
        format!("{}---\n{}", locale("p"), manifest("/etc/passwd")),
        format!("{}---\nnot: [a manifest", locale("p")),
        "id: xx\n".to_string(),
        "fonts: [".to_string(),
    ] {
        assert_eq!(pack_paths(&input), 0, "{input}");
    }
}

#[test]
#[should_panic(expected = "outside its pack")]
fn a_file_with_a_parent_segment_panics() {
    assert_confined("fonts/../../f.ttf");
}

#[test]
fn agreeing_resolvers_pass() {
    let faces = [face("f")];
    assert_resolvers_agree(Ok(&faces), Ok((&faces, true)));
    assert_resolvers_agree(Err(()), Ok((&faces, false)));
    assert_resolvers_agree(Err(()), Err(()));
}

#[test]
#[should_panic(expected = "the resolvers disagree")]
fn resolvers_returning_different_faces_panic() {
    assert_resolvers_agree(Ok(&[face("f")]), Ok((&[face("g")], true)));
}

#[test]
#[should_panic(expected = "with a pack missing")]
fn a_strict_success_with_a_missing_pack_panics() {
    assert_resolvers_agree(Ok(&[]), Ok((&[], false)));
}

#[test]
#[should_panic(expected = "with no pack missing")]
fn a_strict_failure_with_no_pack_missing_panics() {
    assert_resolvers_agree(Err(()), Ok((&[], true)));
}

#[test]
#[should_panic(expected = "refused what the strict one accepted")]
fn a_subset_failure_after_a_strict_success_panics() {
    assert_resolvers_agree(Ok(&[]), Err(()));
}

#[test]
fn a_pack_id_the_check_accepts_is_one_path_segment() {
    assert!(valid_pack_id("ja-JP"));
    assert!(valid_pack_id("noto-sans_jp"));
    assert_one_path_segment("noto-sans_jp");
    // The first line `ja-JP` is checked as a pack id. `LangPack::from_yaml_str`
    // refuses the whole input (a bare line before a mapping), so no face
    // resolves.
    assert_eq!(pack_paths("ja-JP\nid: xx\n"), 0);
}

#[test]
#[should_panic(expected = "is not one path segment")]
fn a_parent_directory_id_panics() {
    assert_one_path_segment("..");
}

#[test]
#[should_panic(expected = "holds a path separator")]
fn an_id_with_a_windows_separator_panics() {
    assert_one_path_segment(r"..\etc");
}
