//! `CliError` and its machine-readable classification.
//!
//! The classification is what the `--report` sidecar publishes, and it is
//! an APPEND-ONLY contract: a `kind` string is what an SDK branches on, so
//! a variant may gain a kind but an existing one never changes meaning.
//! The vocabulary deliberately mirrors `engine/capi`'s
//! (`status/wire.rs`) — five SDKs already map those strings, and the two
//! subprocess SDKs must land on the same mapping rather than a second one.

use serde::Serialize;
use shojiku_diagnostics::Diagnostics;
use std::path::PathBuf;
use thiserror::Error;

/// Which of the two failure levels a `CliError` belongs to.
///
/// The capi carries this split out of band, in its status code: a non-zero
/// status is caller error, and a refused document is status zero with
/// `success` zero. The CLI's out-of-band channel is the exit code, which
/// stays exactly as it was, so the split rides IN band here. Same
/// information, each host's own channel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureClass {
    /// The caller got it wrong — an unwritable output path, a page past
    /// the end. An SDK raises its programmer-misuse exception for these.
    Usage,
    /// Something a DOCUMENT (or its packs, keys or anchors) did. An SDK
    /// returns a failed result for these, never an exception.
    Document,
}

#[derive(Debug, Error)]
pub enum CliError {
    #[error("failed to read {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error(transparent)]
    Core(#[from] shojiku_core::CoreError),
    #[error(transparent)]
    PackFs(#[from] shojiku_authoring::fs::FsPackError),
    #[error(transparent)]
    Font(#[from] shojiku_layout::FontError),
    #[error(transparent)]
    Fetch(#[from] shojiku_fetch::FetchError),
    #[error(transparent)]
    Render(#[from] shojiku_render_pdf::RenderError),
    #[error(transparent)]
    RenderPng(#[from] shojiku_render_png::RenderPngError),
    #[error("page {page} is out of range (document has {total} pages)")]
    PageOutOfRange {
        /// Requested 1-based page.
        page: usize,
        /// Number of pages the document has.
        total: usize,
    },
    #[error("output `{0}` needs a `{{page}}` placeholder for multi-page previews")]
    OutputPatternRequired(String),
    /// A `--probe` value the caller spelled wrong. Echoed back because the
    /// caller wrote it and the mistake is usually visible in it; bounded and
    /// control-stripped by the shared echo guard at the display boundary.
    #[error("`--probe` wants `<type>:<pattern>` with type `date` or `datetime`, got `{0}`")]
    BadProbe(String),
    /// The engine refused the document. The diagnostics were printed to
    /// stderr when it happened and are carried here as well, because
    /// stderr prose cannot express a diagnostic's `code` or its typed
    /// `args` — which is what `--report` hands an SDK. Only this
    /// DOCUMENT-refusal variant carries them, mirroring the capi, whose
    /// `Failure::Document` attaches diagnostics while a host-side cause
    /// (an unusable key, a missing pack) does not.
    #[error("validation failed with errors")]
    ValidationFailed { diagnostics: Diagnostics },
    /// The document was evaluated and did not verify. The report has
    /// already been printed, so this variant only carries the exit status.
    #[error("verification failed")]
    VerificationFailed,
    #[error("failed to serialize output: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("failed to write output {path}: {source}")]
    Output {
        path: String,
        source: std::io::Error,
    },
    #[error(transparent)]
    Signing(#[from] shojiku_signing::SigningError),
    #[error(transparent)]
    Key(#[from] shojiku_signing::KeyError),
    #[error(transparent)]
    Cms(#[from] shojiku_signing::CmsError),
    /// The caller's `--algorithm` is not one this release writes. The string
    /// itself is never echoed — it is the caller's, and the accepted names
    /// are the useful half of the answer.
    #[error("`--algorithm` must be \"rsa-pkcs1-sha256\" or \"ecdsa-p256-sha256\"")]
    Algorithm,
    /// An empty `--signature` file. Writing it would produce a well-formed
    /// container that fails verification — a document that looks signed and
    /// is not, which is the one outcome a signing surface must never produce
    /// quietly.
    #[error("the signature file is empty; there is nothing to write into the document")]
    EmptySignature,
    #[error(transparent)]
    Verify(#[from] shojiku_verify::VerifyError),
    #[error("could not read the passphrase: {0}")]
    Passphrase(std::io::Error),
    #[error("the environment variable `{variable}` is not set")]
    PassphraseVariableUnset {
        /// The variable `--passphrase-env` named.
        variable: String,
    },
    /// `font add` would not write the pack. Its own vocabulary lives in
    /// `crate::font` rather than being spread across variants here: none of
    /// it is reachable from an operation an SDK consumes, since `font add`
    /// carries no `--report`.
    #[error(transparent)]
    FontPack(#[from] crate::font::FontPackError),
}

impl CliError {
    /// Which failure level this is. A document that will not lay out, a
    /// locale pack that is not installed and a key that will not load are
    /// all `Document`: an SDK that raised for those would have broken the
    /// contract, not chosen an idiom.
    #[must_use]
    pub fn class(&self) -> FailureClass {
        match self {
            // The caller chose these: where to write, which page to ask
            // for, how to spell the output pattern.
            CliError::PageOutOfRange { .. }
            | CliError::OutputPatternRequired(_)
            | CliError::BadProbe(_)
            | CliError::Serialize(_)
            | CliError::Output { .. }
            | CliError::PassphraseVariableUnset { .. }
            // The caller chose these too: an algorithm no release writes, and
            // a signature file with nothing in it.
            | CliError::Algorithm
            | CliError::EmptySignature
            // And these: the file to add, the ids to give it, whether to
            // attest an embedding licence.
            | CliError::FontPack(_) => FailureClass::Usage,
            _ => FailureClass::Document,
        }
    }

    /// The diagnostics that EXPLAIN this failure — present only when the
    /// failure is the engine refusing a document. A host-side cause (an
    /// unreadable key, a missing pack) has none, and manufacturing an
    /// empty list as if it were an explanation would be worse than
    /// saying so.
    #[must_use]
    pub fn diagnostics(&self) -> Option<&Diagnostics> {
        match self {
            CliError::ValidationFailed { diagnostics } => Some(diagnostics),
            _ => None,
        }
    }

    /// The stable machine-readable class an SDK branches on. Kinds shared
    /// with the capi keep the capi's spelling.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            CliError::Io { .. } => "io",
            CliError::Core(_) => "parse",
            CliError::PackFs(_) => "pack",
            CliError::Font(_) => "font",
            CliError::Fetch(_) => "fetch",
            CliError::Render(_) => "pdf",
            CliError::RenderPng(_) => "raster",
            CliError::PageOutOfRange { .. } => "out_of_range",
            CliError::OutputPatternRequired(_) => "output_pattern",
            CliError::ValidationFailed { .. } => "document",
            CliError::VerificationFailed => "signature",
            CliError::Serialize(_) => "serialize",
            CliError::Output { .. } => "output",
            CliError::Signing(_) => "signing",
            // The capi's own spelling for an unusable certificate, and for a
            // request it will not act on: the two subprocess SDKs map the same
            // strings the other five already do.
            CliError::Cms(_) => "certificate",
            CliError::Algorithm | CliError::EmptySignature | CliError::BadProbe(_) => {
                "invalid_request"
            }
            CliError::Key(_) => "key",
            CliError::Verify(_) => "verify",
            CliError::Passphrase(_) => "passphrase",
            CliError::PassphraseVariableUnset { .. } => "passphrase_variable",
            CliError::FontPack(_) => "font_pack",
        }
    }
}

#[cfg(test)]
mod tests;
