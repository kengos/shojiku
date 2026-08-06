//! The failure classification the `--report` sidecar publishes.
//!
//! One case per `CliError` variant, deliberately: `class` and `kind` are
//! an append-only contract that seven SDKs branch on, so the table below
//! is where a reviewer reads the whole vocabulary at once and where a new
//! variant is forced to declare itself.

use super::*;
use shojiku_diagnostics::{Diagnostic, DiagnosticCode};

fn io_error() -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::NotFound, "no such file")
}

/// Every variant, its level, and its machine-readable kind.
#[test]
fn every_variant_declares_its_class_and_kind() {
    let cases: Vec<(CliError, FailureClass, &str)> = vec![
        (
            CliError::Io {
                path: "t.yml".into(),
                source: io_error(),
            },
            FailureClass::Document,
            "io",
        ),
        (
            CliError::Font(shojiku_layout::FontError::NoFonts("ja-JP".into())),
            FailureClass::Document,
            "font",
        ),
        (
            CliError::Fetch(shojiku_fetch::FetchError::MissingNoUrl {
                pack: "biz-ud".into(),
                id: "regular".into(),
                path: "biz-ud.ttf".into(),
            }),
            FailureClass::Document,
            "fetch",
        ),
        (
            CliError::Render(shojiku_render_pdf::RenderError::NoPages),
            FailureClass::Document,
            "pdf",
        ),
        (
            CliError::RenderPng(shojiku_render_png::RenderPngError::NoPages),
            FailureClass::Document,
            "raster",
        ),
        (
            CliError::Signing(shojiku_signing::SigningError::NotAPdf),
            FailureClass::Document,
            "signing",
        ),
        (
            CliError::Key(shojiku_signing::KeyError::NotPem),
            FailureClass::Document,
            "key",
        ),
        (
            CliError::PageOutOfRange { page: 9, total: 2 },
            FailureClass::Usage,
            "out_of_range",
        ),
        (
            CliError::OutputPatternRequired("out.png".to_string()),
            FailureClass::Usage,
            "output_pattern",
        ),
        (
            CliError::ValidationFailed {
                diagnostics: Diagnostics::new(),
            },
            FailureClass::Document,
            "document",
        ),
        (
            CliError::VerificationFailed,
            FailureClass::Document,
            "signature",
        ),
        (
            CliError::Output {
                path: "out.pdf".to_string(),
                source: io_error(),
            },
            FailureClass::Usage,
            "output",
        ),
        (
            CliError::Passphrase(io_error()),
            FailureClass::Document,
            "passphrase",
        ),
        (
            CliError::PassphraseVariableUnset {
                variable: "SHOJIKU_PASSPHRASE".to_string(),
            },
            FailureClass::Usage,
            "passphrase_variable",
        ),
        (
            // `font add` failures are the caller's: which file, which ids,
            // whether to attest an embedding licence.
            CliError::FontPack(crate::FontPackError::NotAFont {
                path: "MyFont.otf".into(),
            }),
            FailureClass::Usage,
            "font_pack",
        ),
    ];
    for (error, class, kind) in cases {
        assert_eq!(error.class(), class, "class of {error}");
        assert_eq!(error.kind(), kind, "kind of {error}");
    }
}

/// The `#[from]` variants, which cannot be built without their source
/// error, get the same treatment through real errors from the crates that
/// produce them — so the table above plus this test names every variant.
#[test]
fn wrapped_engine_errors_classify_as_document_failures() {
    let core: CliError = shojiku_core::parse_template("- not a template")
        .expect_err("a sequence is not a template")
        .into();
    assert_eq!(core.class(), FailureClass::Document);
    assert_eq!(core.kind(), "parse");

    let serialize: CliError = serde_json::from_str::<serde_json::Value>("{")
        .expect_err("truncated json")
        .into();
    assert_eq!(serialize.class(), FailureClass::Usage);
    assert_eq!(serialize.kind(), "serialize");

    let dirs = [std::path::PathBuf::from("/nonexistent")];
    let pack: CliError = shojiku_authoring::fs::load_locale_pack("no-such-locale", &dirs)
        .expect_err("an uninstalled pack")
        .into();
    assert_eq!(pack.class(), FailureClass::Document);
    assert_eq!(pack.kind(), "pack");

    let anchors: CliError = shojiku_verify::TrustAnchors::from_pem(b"not a certificate")
        .expect_err("not PEM")
        .into();
    assert_eq!(anchors.class(), FailureClass::Document);
    assert_eq!(anchors.kind(), "verify");
}

/// Only the document-refusal variant explains itself with diagnostics —
/// mirroring the capi, where a host-side cause carries none.
#[test]
fn diagnostics_ride_the_document_refusal_and_nothing_else() {
    let mut diagnostics = Diagnostics::new();
    diagnostics.push(Diagnostic::new(DiagnosticCode::ImageSourceMissing));
    let refused = CliError::ValidationFailed { diagnostics };
    assert_eq!(refused.diagnostics().expect("carried").items.len(), 1);

    let host = CliError::Io {
        path: "t.yml".into(),
        source: io_error(),
    };
    assert!(
        host.diagnostics().is_none(),
        "a host-side cause must not present an empty list as an explanation"
    );
}
