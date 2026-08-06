//! Implementation of the `shojiku` CLI commands.
//!
//! `main.rs` stays thin; everything testable lives here.

use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(
    name = "shojiku",
    about = "Shojiku: document lifecycle engine for PDF forms",
    version
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Validate definitions/templates/params and print diagnostics as JSON.
    Validate(ValidateArgs),
    /// Lay out a template and print the layout tree as JSON.
    Inspect(RenderishArgs),
    /// Render a template to PDF.
    Render(RenderArgs),
    /// Render a template to per-page preview PNGs.
    Preview(PreviewArgs),
    /// Sign a rendered PDF, appending an invisible signature.
    Sign(SignArgs),
    /// Reserve a signature window and print what a signature must cover, as
    /// JSON. The first half of signing with a key this process is never
    /// given: sign the reported bytes wherever the key lives, then hand the
    /// signature to `sign-complete`.
    SignPrepare(SignPrepareArgs),
    /// Write a signature produced elsewhere into the document. Takes the same
    /// input, certificate and algorithm `sign-prepare` was given.
    SignComplete(SignCompleteArgs),
    /// Check a signed PDF against a trust anchor and print the report as
    /// JSON. Exits non-zero when the document does not verify.
    Verify(VerifyArgs),
    /// Manage font packs — the fonts a template can name.
    Font {
        #[command(subcommand)]
        command: FontCommand,
    },
    /// Print this engine's version and machine-readable capability list
    /// as JSON (for GUI/SDK feature gating; needs no inputs).
    Capabilities,
}

mod args;
mod commands;
mod error;
mod external;
mod font;
mod report;
mod sign;
#[cfg(test)]
mod tests;
mod verify;

pub use args::{
    AssetModeArg, FontAddArgs, FontCommand, FontStyleArg, FontWeightArg, PreviewArgs, RenderArgs,
    RenderishArgs, ReportArg, SignArgs, SignCompleteArgs, SignPrepareArgs, ValidateArgs,
    VerifyArgs,
};
pub use commands::{
    report_diagnostics, resolve_preview_output, run_inspect, run_preview, run_render, run_validate,
    write_output, Rendered,
};
pub use error::{CliError, FailureClass};
pub use external::{run_sign_complete, run_sign_prepare, Prepared};
pub use font::{run_font_add, AddedFace, FontPackError};
pub use report::Report;
pub use sign::run_sign;
pub use verify::run_verify;
// The capability list + `capabilities` command live in the shared authoring
// layer, so every surface (CLI / WASM / MCP) advertises one key set.
// Re-exported here so `main.rs` and downstream callers are unchanged.
pub use shojiku_authoring::{run_capabilities, CAPABILITIES};
