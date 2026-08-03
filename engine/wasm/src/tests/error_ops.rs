//! Host-side tests for the wasm-surface error registry: every variant's
//! stable `code`, its typed `args`, and the hostile-detail sanitization
//! that keeps a control-char-laden pack message from riding the args raw.

use crate::error::WasmError;
use shojiku_diagnostics::{ArgValue, MAX_MESSAGE};

#[test]
fn every_variant_maps_to_its_stable_code() {
    let cases: [(WasmError, &str); 9] = [
        (WasmError::LocaleNotSet, "locale_not_set"),
        (WasmError::FontsNotLoaded, "fonts_not_loaded"),
        (WasmError::Locale("x".into()), "locale_error"),
        (WasmError::UnknownFontPack("p".into()), "unknown_font_pack"),
        (WasmError::Fonts("x".into()), "font_error"),
        (WasmError::BadScale(-1.0), "bad_scale"),
        (WasmError::Render("x".into()), "render_error"),
        (
            WasmError::PageOutOfRange { page: 3, total: 2 },
            "page_out_of_range",
        ),
        (
            WasmError::TooManyRawPages { total: 99, cap: 20 },
            "too_many_raw_pages",
        ),
    ];
    for (err, code) in cases {
        assert_eq!(err.code(), code);
    }
}

#[test]
fn variants_without_detail_carry_no_args() {
    assert!(WasmError::LocaleNotSet.args().is_empty());
    assert!(WasmError::FontsNotLoaded.args().is_empty());
}

#[test]
fn scalar_args_are_typed_by_key() {
    assert_eq!(
        WasmError::PageOutOfRange { page: 3, total: 2 }.args(),
        vec![
            ("page", ArgValue::from(3usize)),
            ("total", ArgValue::from(2usize)),
        ]
    );
    assert_eq!(
        WasmError::TooManyRawPages { total: 99, cap: 20 }.args(),
        vec![
            ("total", ArgValue::from(99usize)),
            ("cap", ArgValue::from(20usize)),
        ]
    );
    assert_eq!(
        WasmError::BadScale(-1.5).args(),
        vec![("scale", ArgValue::from(-1.5))]
    );
    assert_eq!(
        WasmError::UnknownFontPack("noto".into()).args(),
        vec![("pack", ArgValue::text("noto"))]
    );
}

#[test]
fn detail_args_are_sanitized_through_argvalue() {
    // A control character in a locale/font/render detail must be stripped:
    // the arg rides `ArgValue::text`, not a raw `String`, so a hostile pack
    // message cannot inject terminal/log control sequences downstream.
    let hostile = "bad\u{7}\u{1b}msg";
    for err in [
        WasmError::Locale(hostile.into()),
        WasmError::Fonts(hostile.into()),
        WasmError::Render(hostile.into()),
    ] {
        let args = err.args();
        assert_eq!(args, vec![("detail", ArgValue::text(hostile))]);
        let ArgValue::Str(sanitized) = &args[0].1 else {
            panic!("detail must be a string arg");
        };
        assert!(!sanitized.chars().any(char::is_control));
    }
}

#[test]
fn the_thrown_message_is_bounded_while_code_and_args_stay_intact() {
    // The other half of the wasm error contract. `args` were already
    // sanitized; the MESSAGE — which is what a Designer actually shows a
    // user — was echoed raw, so a hostile locale/font/render detail could
    // both run unbounded and carry terminal/log control sequences.
    let hostile = format!("\u{1b}[2J\u{7}{}", "x".repeat(10_000));
    for err in [
        WasmError::Locale(hostile.clone()),
        WasmError::Fonts(hostile.clone()),
        WasmError::Render(hostile.clone()),
        WasmError::UnknownFontPack(hostile.clone()),
    ] {
        let code = err.code();
        let args = err.args();
        let thrown = shojiku_diagnostics::sanitize(&err.to_string(), MAX_MESSAGE);
        assert!(
            thrown.chars().count() <= MAX_MESSAGE,
            "{code}: unbounded thrown message ({} chars)",
            thrown.chars().count()
        );
        assert!(
            !thrown.chars().any(char::is_control),
            "{code}: control character in the thrown message"
        );
        // The code and the arg keys are the append-only contract and must
        // not shift because the message got a bound.
        assert!(!code.is_empty());
        assert!(!args.is_empty());
    }
}
