//! Unit tests for the id rules — every hostile branch reached by a direct
//! call, without building a broken pack on disk to provoke it.

use super::*;
use shojiku_formatter::MAX_PACK_ID;

#[test]
fn ordinary_ids_pass() {
    for id in ["my-font", "MyFont_2", "a", &"x".repeat(MAX_PACK_ID)] {
        assert!(check_id(id, IdKind::Family).is_ok(), "rejected `{id}`");
    }
}

#[test]
fn path_shaped_ids_are_refused() {
    // The pack id becomes a directory name, so each of these would name a
    // location outside the font dir.
    for id in ["..", "../evil", "/abs", "a/b", "a\\b", "."] {
        let err = check_id(id, IdKind::Pack).unwrap_err();
        assert!(
            matches!(err, FontPackError::InvalidId { flag, .. } if flag == "--pack"),
            "accepted `{id}`"
        );
    }
}

#[test]
fn an_id_one_char_past_the_maximum_is_refused() {
    let too_long = "x".repeat(MAX_PACK_ID + 1);
    assert!(check_id(&too_long, IdKind::Face).is_err());
}

#[test]
fn an_empty_id_is_refused() {
    assert!(check_id("", IdKind::Family).is_err());
}

#[test]
fn control_and_bidi_characters_are_refused_and_not_echoed_raw() {
    // Both defeat a terminal that quotes the value back: a control byte
    // repaints it, and a bidi override reorders what the reader sees.
    for id in ["my\u{1b}[31mfont", "my\u{202e}tnof"] {
        let err = check_id(id, IdKind::Family).unwrap_err();
        let shown = err.to_string();
        assert!(!shown.contains('\u{1b}'), "echoed a control byte: {shown}");
        assert!(!shown.contains('\u{202e}'), "echoed a bidi override");
    }
}

#[test]
fn the_message_names_the_flag_that_carried_the_id() {
    assert_eq!(IdKind::Family.flag(), "--family");
    assert_eq!(IdKind::Pack.flag(), "--pack");
    assert_eq!(IdKind::Face.flag(), "--face-id");
    let err = check_id("!", IdKind::Face).unwrap_err();
    assert!(err.to_string().contains("--face-id"), "{err}");
}

#[test]
fn face_id_defaults_to_the_family_plus_a_variant_suffix() {
    use shojiku_core::{FontStyle, FontWeight};
    let (normal, bold) = (FontWeight::Normal, FontWeight::Bold);
    let (upright, italic) = (FontStyle::Normal, FontStyle::Italic);
    assert_eq!(default_face_id("lato", normal, upright), "lato");
    assert_eq!(default_face_id("lato", bold, upright), "lato-bold");
    assert_eq!(default_face_id("lato", normal, italic), "lato-italic");
    assert_eq!(default_face_id("lato", bold, italic), "lato-bold-italic");
}

#[test]
fn a_face_file_keeps_the_source_name() {
    let name = face_file_name(std::path::Path::new("/tmp/x/MyFont-Bold.otf")).expect("name");
    assert_eq!(name, "MyFont-Bold.otf");
}

#[test]
fn traversal_and_hidden_file_names_are_refused() {
    for path in [
        "/tmp/..",
        "/tmp/.hidden.ttf",
        "/tmp/a b.ttf",
        "/tmp/x;rm.ttf",
    ] {
        assert!(
            face_file_name(std::path::Path::new(path)).is_err(),
            "accepted `{path}`"
        );
    }
}

#[test]
fn a_path_with_no_file_name_is_refused() {
    assert!(face_file_name(std::path::Path::new("/")).is_err());
}

#[test]
fn an_over_long_file_name_is_refused() {
    let long = format!("/tmp/{}.ttf", "x".repeat(MAX_FACE_FILE_NAME));
    assert!(face_file_name(std::path::Path::new(&long)).is_err());
}
