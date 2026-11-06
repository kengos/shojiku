//! The `formatter_pack_paths` harness: a locale pack's `fonts.uses` and an
//! injected manifest through both bytes-first resolvers, and the one-path-
//! segment rule for pack and locale ids.

use crate::{
    FaceBytes, InjectedPack, LangPack, PackManifest, resolve_face_bytes, resolve_face_bytes_subset,
    valid_pack_id,
};
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::Path;

#[cfg(test)]
mod tests;

/// Resolves one locale pack and one font-pack manifest through both
/// bytes-first resolvers, and returns how many faces the strict resolver
/// returned.
///
/// `input` is the locale pack's YAML, a line holding only `---`, then the
/// manifest's YAML. The manifest is injected under the first `fonts.uses`
/// id, with one byte of font data for every `file` it declares, so a face
/// is refused only by a resolver check and never for missing bytes. The
/// first line of the locale pack is also checked as a pack id.
///
/// # Panics
///
/// Panics when [`assert_confined`] fails for a face the strict resolver
/// returned, when the strict and the subset resolver disagree (see
/// [`assert_resolvers_agree`]), or when [`assert_one_path_segment`] fails
/// for an id `valid_pack_id` accepts.
pub fn pack_paths(input: &str) -> usize {
    let (locale, manifest) = input.split_once("\n---\n").unwrap_or((input, ""));
    let candidate = locale.lines().next().unwrap_or_default();
    if valid_pack_id(candidate) {
        assert_one_path_segment(candidate);
    }
    let Ok(pack) = LangPack::from_yaml_str(locale) else {
        return 0;
    };
    let Some(first) = pack.font_pack_ids().first() else {
        return 0;
    };
    let declared = PackManifest::from_yaml(manifest)
        .map(|parsed| parsed.faces)
        .unwrap_or_default();
    let files: BTreeMap<String, Vec<u8>> = declared
        .iter()
        .map(|face| (face.file.clone(), vec![0]))
        .collect();
    let injected = || {
        vec![InjectedPack {
            id: first.clone(),
            manifest: manifest.to_string(),
            files: files.clone(),
        }]
    };
    let strict = resolve_face_bytes(&pack, injected());
    let subset = resolve_face_bytes_subset(&pack, injected());
    if let Ok(faces) = &strict {
        for face in faces {
            // The resolvers keep the FIRST declaration of an id (and check
            // every declaration before choosing), so the first declaration
            // with the returned id is the one the face came from.
            let decl = declared.iter().find(|decl| decl.id == face.id);
            assert!(decl.is_some(), "face `{}` has no declaration", face.id);
            assert_confined(decl.map_or("", |decl| decl.file.as_str()));
        }
    }
    assert_resolvers_agree(
        strict.as_deref().map_err(|_| ()),
        subset
            .as_ref()
            .map(|s| (s.faces.as_slice(), s.missing.is_empty()))
            .map_err(|_| ()),
    );
    strict.map_or(0, |faces| faces.len())
}

/// Asserts that a manifest `file` is relative and has no `..` segment —
/// the rule the resolvers apply before they look a file up, decided here by
/// splitting the text on `/` rather than through `std::path`.
///
/// # Panics
///
/// Panics when `file` starts with `/` or has a segment equal to `..`.
fn assert_confined(file: &str) {
    assert!(
        !file.starts_with('/') && !file.split('/').any(|segment| segment == ".."),
        "a face resolved from a file outside its pack: {file:?}"
    );
}

/// The strict resolver succeeds exactly when the subset resolver succeeds
/// with no missing pack, and then both return the same faces in the same
/// order; the subset resolver never refuses what the strict one accepted.
///
/// `subset` is the subset resolver's faces and whether its `missing` list
/// is empty.
///
/// # Panics
///
/// Panics when any of those statements is false.
fn assert_resolvers_agree(
    strict: Result<&[FaceBytes], ()>,
    subset: Result<(&[FaceBytes], bool), ()>,
) {
    match (strict, subset) {
        (Ok(strict), Ok((subset, complete))) => {
            assert!(
                complete,
                "the strict resolver succeeded with a pack missing"
            );
            assert_eq!(
                identities(strict),
                identities(subset),
                "the resolvers disagree"
            );
        }
        (Err(()), Ok((_, complete))) => {
            assert!(!complete, "the strict resolver failed with no pack missing");
        }
        (Ok(_), Err(())) => panic!("the subset resolver refused what the strict one accepted"),
        (Err(()), Err(())) => {}
    }
}

/// Each face's id and digest, in order.
fn identities(faces: &[FaceBytes]) -> Vec<(&str, &str)> {
    faces
        .iter()
        .map(|face| (face.id.as_str(), face.sha256.as_str()))
        .collect()
}

/// Asserts that `id`, joined onto a directory either bare or with a `.yml`
/// extension, names an entry directly inside that directory — what a pack
/// id or a locale id must guarantee before a host builds a path from it.
/// The `std::path` checks follow the platform the harness runs on, so `id`
/// is also required to hold no `/`, `\` or `:`, which a Windows host would
/// read as a separator or a drive prefix.
///
/// # Panics
///
/// Panics when `id` holds `/`, `\` or `:`, when either joined path's parent
/// is not the directory, or when the bare join's last component is not
/// `id` itself.
pub fn assert_one_path_segment(id: &str) {
    assert!(
        !id.contains(['/', '\\', ':']),
        "{id:?} holds a path separator"
    );
    let dir = Path::new("/packs");
    let bare = dir.join(id);
    assert_eq!(bare.parent(), Some(dir), "{id:?} is not one path segment");
    assert_eq!(
        bare.file_name(),
        Some(OsStr::new(id)),
        "{id:?} is not one path segment"
    );
    let file = dir.join(format!("{id}.yml"));
    assert_eq!(
        file.parent(),
        Some(dir),
        "{id:?}.yml is not one path segment"
    );
}
