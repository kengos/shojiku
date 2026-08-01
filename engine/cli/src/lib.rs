//! Implementation of the `shojiku` CLI commands.
//!
//! `main.rs` stays thin; everything testable lives here.

use clap::{Args, Parser, Subcommand, ValueEnum};
use shojiku_image::{AssetMode, AssetPolicy};
use std::path::{Path, PathBuf};

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
    /// Check a signed PDF against a trust anchor and print the report as
    /// JSON. Exits non-zero when the document does not verify.
    Verify(VerifyArgs),
    /// Print this engine's version and machine-readable capability list
    /// as JSON (for GUI/SDK feature gating; needs no inputs).
    Capabilities,
}

#[derive(Debug, Args)]
pub struct VerifyArgs {
    /// Path to the signed PDF to check.
    #[arg(long)]
    pub input: PathBuf,
    /// Path to a PEM file holding one or more certificates to trust
    /// (repeatable). Required, and deliberately so: verification never
    /// consults the machine's trust store, because a verdict that depended
    /// on ambient machine state would silently widen who can vouch for a
    /// document. Whose signatures count is the caller's decision.
    #[arg(long, value_name = "PEM", required = true)]
    pub anchor: Vec<PathBuf>,
    #[command(flatten)]
    pub report: ReportArg,
}

/// The `--report` flag, flattened into every command whose outcome an SDK
/// consumes (`render` / `sign` / `verify` — the operations the SDK
/// lifecycle contract binds; `validate`/`inspect`/`preview` are the
/// authoring surface's and are deliberately not bound).
#[derive(Debug, Args, Default)]
pub struct ReportArg {
    /// Write a machine-readable JSON report of this operation here: what
    /// it produced, the engine's diagnostics (on success as well as
    /// failure), and — when it failed — whether the caller or the
    /// document was at fault. For SDKs and scripts; stdout, stderr and
    /// the exit code are unchanged with or without it.
    #[arg(long, value_name = "PATH")]
    pub report: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct SignArgs {
    /// Path to the PDF to sign — a document this engine rendered.
    #[arg(long)]
    pub input: PathBuf,
    /// Path to the signing key: a PKCS#8 PEM file, encrypted or not.
    /// Convert a legacy OpenSSL key once with `openssl pkcs8 -topk8`.
    #[arg(long)]
    pub key: PathBuf,
    /// Path to the signer's X.509 certificate, as PEM.
    #[arg(long)]
    pub cert: PathBuf,
    /// Output PDF path, or `-` for stdout.
    #[arg(long)]
    pub output: String,
    /// Read the key's passphrase from this environment variable instead of
    /// prompting. There is deliberately no flag that takes the passphrase
    /// itself: `argv` is readable by other processes and lands in shell
    /// history.
    #[arg(long, value_name = "VARIABLE")]
    pub passphrase_env: Option<String>,
    #[command(flatten)]
    pub report: ReportArg,
}

#[derive(Debug, Args)]
pub struct ValidateArgs {
    /// Path to definitions.yml (optional but recommended).
    #[arg(long)]
    pub definitions: Option<PathBuf>,
    /// Path to templates.yml.
    #[arg(long)]
    pub templates: PathBuf,
    /// Path to params.json/yml (optional).
    #[arg(long)]
    pub params: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct RenderishArgs {
    #[arg(long)]
    pub definitions: Option<PathBuf>,
    #[arg(long)]
    pub templates: PathBuf,
    #[arg(long)]
    pub params: PathBuf,
    /// Locale id, e.g. `ja-JP` (builtin: ja-JP, en-US; a bare language
    /// tag like `ja` selects its unique builtin). Defaults to the
    /// template `defaults.locale`, then ja-JP. A `packs/locale/<id>.yml`
    /// file overlays the builtin per key.
    #[arg(long)]
    pub lang: Option<String>,
    /// Font pack search dir (repeatable, earlier wins). Adds to
    /// $SHOJIKU_FONT_DIR then ./packs/fonts.
    #[arg(long)]
    pub font_dir: Vec<PathBuf>,
    /// Locale pack search dir (repeatable, earlier wins). Adds to
    /// $SHOJIKU_LOCALE_DIR then ./packs/locale.
    #[arg(long)]
    pub locale_dir: Vec<PathBuf>,
    /// Never fetch fonts. A face whose file is missing locally and is not
    /// already cached fails instead of downloading. Rendering itself is
    /// offline either way — only cache-filling is affected.
    #[arg(long)]
    pub offline: bool,
    /// Extra host a pinned font may be fetched from, e.g. an internal
    /// mirror (repeatable). Adds to the built-in allowlist.
    #[arg(long = "font-fetch-allow", value_name = "HOST")]
    pub font_fetch_allow: Vec<String>,
    /// Directory bundled image assets resolve against. Defaults to the
    /// template file's directory.
    #[arg(long)]
    pub assets_dir: Option<PathBuf>,
    /// Asset policy mode for params-supplied images.
    #[arg(long, value_enum, default_value_t = AssetModeArg::Open)]
    pub asset_mode: AssetModeArg,
    /// Item ids allowed to receive inline dynamic images even under
    /// `bundled-only` (repeatable).
    #[arg(long = "allow-dynamic-image")]
    pub allow_dynamic_image: Vec<String>,
    /// Item ids denied any dynamic image content even under `open`
    /// (repeatable).
    #[arg(long = "deny-dynamic-image")]
    pub deny_dynamic_image: Vec<String>,
}

/// CLI mirror of [`AssetMode`] (kept separate so shojiku-image stays free
/// of clap).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum AssetModeArg {
    /// Params may carry inline image content unless an item is denied.
    #[default]
    Open,
    /// Params may only select bundled assets; inline content needs an
    /// explicit per-item allow.
    BundledOnly,
}

impl From<AssetModeArg> for AssetMode {
    fn from(mode: AssetModeArg) -> Self {
        match mode {
            AssetModeArg::Open => AssetMode::Open,
            AssetModeArg::BundledOnly => AssetMode::BundledOnly,
        }
    }
}

impl RenderishArgs {
    /// Builds the asset policy from the CLI flags.
    fn asset_policy(&self) -> AssetPolicy {
        AssetPolicy {
            mode: self.asset_mode.into(),
            dynamic_allow: self.allow_dynamic_image.clone(),
            dynamic_deny: self.deny_dynamic_image.clone(),
            ..AssetPolicy::default()
        }
    }

    /// Assets directory: `--assets-dir` > the template's directory.
    fn assets_root(&self) -> PathBuf {
        if let Some(dir) = &self.assets_dir {
            return dir.clone();
        }
        let parent = self.templates.parent().unwrap_or(Path::new("."));
        if parent.as_os_str().is_empty() {
            PathBuf::from(".")
        } else {
            parent.to_path_buf()
        }
    }
}

#[derive(Debug, Args)]
pub struct RenderArgs {
    #[command(flatten)]
    pub common: RenderishArgs,
    /// Output PDF path, or `-` for stdout.
    #[arg(long)]
    pub output: String,
    #[command(flatten)]
    pub report: ReportArg,
}

#[derive(Debug, Args)]
pub struct PreviewArgs {
    #[command(flatten)]
    pub common: RenderishArgs,
    /// Output PNG path. A `{page}` placeholder is substituted per page and
    /// is required when more than one page is written.
    #[arg(long)]
    pub output: String,
    /// Output pixels per layout point (2.0 ≈ 144 dpi).
    #[arg(long, default_value_t = 2.0)]
    pub scale: f64,
    /// Render only this 1-based page (default: every page).
    #[arg(long)]
    pub page: Option<usize>,
}

mod commands;
mod error;
mod report;
mod sign;
#[cfg(test)]
mod tests;
mod verify;

pub use commands::{
    report_diagnostics, resolve_preview_output, run_inspect, run_preview, run_render, run_validate,
    write_output, Rendered,
};
pub use error::{CliError, FailureClass};
pub use report::Report;

impl ReportArg {
    /// The path `--report` named, if any.
    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        self.report.as_deref()
    }
}
pub use sign::run_sign;
pub use verify::run_verify;
// The capability list + `capabilities` command live in the shared authoring
// layer, so every surface (CLI / WASM / MCP) advertises one key set.
// Re-exported here so `main.rs` and downstream callers are unchanged.
pub use shojiku_authoring::{run_capabilities, CAPABILITIES};
