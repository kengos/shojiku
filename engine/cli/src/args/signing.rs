//! Flags for the commands that sign a document or check a signature.
//!
//! Two shapes live here, and the difference between them is the point of the
//! external pair: `sign` loads a private key into this process, while
//! `sign-prepare` and `sign-complete` never see one. Neither external verb
//! takes `--key` or `--passphrase`, and there is nothing here for one to be
//! added to by accident.

use clap::Args;
use std::path::PathBuf;

use super::ReportArg;

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
pub struct SignPrepareArgs {
    /// Path to the PDF to sign — a document this engine rendered.
    #[arg(long)]
    pub input: PathBuf,
    /// Path to the signer's X.509 certificate, as PEM. Checked here so an
    /// unusable certificate fails before the caller pays for a round trip to
    /// wherever the key lives.
    #[arg(long)]
    pub cert: PathBuf,
    /// Which algorithm the key signs with.
    #[arg(long, value_name = "NAME")]
    pub algorithm: String,
    #[command(flatten)]
    pub report: ReportArg,
}

#[derive(Debug, Args)]
pub struct SignCompleteArgs {
    /// Path to the PDF to sign — the SAME document `sign-prepare` was given.
    /// The pair is stateless, so this command re-derives what the first
    /// prepared rather than taking a handle for it.
    #[arg(long)]
    pub input: PathBuf,
    /// Path to the signer's X.509 certificate, as PEM. The same one.
    #[arg(long)]
    pub cert: PathBuf,
    /// The same algorithm.
    #[arg(long, value_name = "NAME")]
    pub algorithm: String,
    /// Path to a file holding the RAW signature bytes: PKCS#1 v1.5 for
    /// `rsa-pkcs1-sha256`, an ASN.1 DER sequence for `ecdsa-p256-sha256` —
    /// which is what both major cloud key services return. Not base64: the
    /// payload hands it out encoded because JSON cannot carry bytes, and a
    /// file can.
    #[arg(long, value_name = "FILE")]
    pub signature: PathBuf,
    /// Output PDF path, or `-` for stdout.
    #[arg(long)]
    pub output: String,
    #[command(flatten)]
    pub report: ReportArg,
}
