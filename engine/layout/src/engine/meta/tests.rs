//! Unit tests for the metadata gate: what a hostile value does to the
//! `/Info` dictionary and — the sharper edge — to the XMP packet.

use super::{check_meta_language, check_meta_text, MetaReject, MAX_META_LANGUAGE, MAX_META_TEXT};
use shojiku_diagnostics::DiagnosticCode as Code;

#[test]
fn ordinary_values_pass_and_trim() {
    assert_eq!(
        check_meta_text("2026年1月分 請求書"),
        Ok("2026年1月分 請求書")
    );
    assert_eq!(check_meta_text("  spaced  "), Ok("spaced"));
    // Blank is not an error — it is "nothing authored here".
    assert_eq!(check_meta_text(""), Ok(""));
    assert_eq!(check_meta_text("  \t "), Ok(""));
}

#[test]
fn xml_metacharacters_survive_the_text_gate() {
    // They are escaped where they land (`xmp-writer` escapes ordinary
    // values, `TextStr` encodes the /Info string), so rejecting them would
    // lose legitimate content — `Q&A <2026>` is a real title.
    assert_eq!(check_meta_text("Q&A <2026> \"x\""), Ok("Q&A <2026> \"x\""));
}

#[test]
fn control_characters_are_rejected() {
    assert_eq!(check_meta_text("tit\u{0}le"), Err(MetaReject::Control));
    // An interior newline is a reject, not something trimming hides.
    assert_eq!(check_meta_text("two\nlines"), Err(MetaReject::Control));
}

#[test]
fn oversized_values_are_rejected_at_the_admitted_maximum() {
    let at_cap = "a".repeat(MAX_META_TEXT);
    assert_eq!(check_meta_text(&at_cap), Ok(at_cap.as_str()));
    let over = "a".repeat(MAX_META_TEXT + 1);
    assert_eq!(
        check_meta_text(&over),
        Err(MetaReject::TooLong { max: MAX_META_TEXT })
    );
}

#[test]
fn language_takes_only_tag_characters() {
    for tag in ["ja", "ja-JP", "zh-Hant-TW", "en-US"] {
        assert_eq!(check_meta_language(tag), Ok(tag), "{tag}");
    }
    assert_eq!(check_meta_language("  ja-JP "), Ok("ja-JP"));
}

#[test]
fn a_language_that_could_break_the_xmp_packet_is_rejected() {
    // `xmp-writer` writes a LangId RAW (unlike every other value, which it
    // escapes), so these are the values that would close the element and
    // inject markup into the metadata packet.
    for hostile in [
        "ja\"><rdf:li>x",
        "ja<script>",
        "ja&amp;",
        "ja JP",
        "日本語",
        "ja\u{0}",
    ] {
        assert_eq!(
            check_meta_language(hostile),
            Err(MetaReject::Charset),
            "{hostile}"
        );
    }
}

#[test]
fn an_oversized_language_is_rejected_before_the_charset_check() {
    let over = "a".repeat(MAX_META_LANGUAGE + 1);
    assert_eq!(
        check_meta_language(&over),
        Err(MetaReject::TooLong {
            max: MAX_META_LANGUAGE
        })
    );
    let at_cap = "a".repeat(MAX_META_LANGUAGE);
    assert_eq!(check_meta_language(&at_cap), Ok(at_cap.as_str()));
}

#[test]
fn every_reject_raises_its_own_code() {
    // One code per reason, so the whole sentence is translatable — an
    // English reason inside a translated template would reach a Japanese
    // reader half-rendered.
    let diag = MetaReject::TooLong { max: 2048 }.diagnostic();
    assert_eq!(diag.code, Code::DocumentMetadataTooLong);
    // The cap rides the diagnostic, so the message can name the real one
    // (2048 for text, 64 for a language tag).
    assert_eq!(
        diag.args.get("max"),
        Some(&shojiku_diagnostics::ArgValue::Num(2048.0))
    );
    assert_eq!(
        MetaReject::Control.diagnostic().code,
        Code::DocumentMetadataControlChars
    );
    assert_eq!(
        MetaReject::Charset.diagnostic().code,
        Code::InvalidDocumentLanguage
    );
}
