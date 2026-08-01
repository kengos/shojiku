//! The `sign` command: a rendered PDF in, a signed one out.
//!
//! Two things here are deliberate rather than incidental.
//!
//! The passphrase is never a command-line argument. Anything in `argv` is
//! readable by other processes on the machine and lands in shell history, so
//! the prompt is the default and an environment variable is the documented
//! opt-in for unattended use — weaker (children inherit it, and it shows up in
//! crash dumps), which is why it has to be asked for by name.
//!
//! And nothing asks for a passphrase until the key turns out to need one. The
//! signing crate reports that as its own error, so an unencrypted key signs
//! without a prompt and a script never blocks on a question it cannot answer.

use std::path::{Path, PathBuf};

use shojiku_signing::{sign_document, KeyError, LocalPemSigner, PlaceholderOptions};
use zeroize::Zeroizing;

use crate::{CliError, SignArgs};

#[cfg(test)]
mod tests;

/// Where an encrypted key's passphrase comes from.
///
/// A trait rather than a direct call so the command is testable without a
/// terminal: reading from a real one is the single line that cannot run under
/// a test harness, and it should not drag the rest of the command with it.
pub(crate) trait PassphraseSource {
    /// Reads the named environment variable.
    fn read_variable(&self, name: &str) -> Option<Zeroizing<String>>;

    /// Asks the terminal, without echoing.
    fn prompt(&self) -> Result<Zeroizing<String>, std::io::Error>;
}

/// The real source: the process environment, or the terminal.
pub(crate) struct Terminal;

impl PassphraseSource for Terminal {
    fn read_variable(&self, name: &str) -> Option<Zeroizing<String>> {
        std::env::var(name).ok().map(Zeroizing::new)
    }

    fn prompt(&self) -> Result<Zeroizing<String>, std::io::Error> {
        rpassword::prompt_password("Passphrase for the signing key: ").map(Zeroizing::new)
    }
}

/// Signs a rendered document, returning the signed bytes.
///
/// # Errors
///
/// Returns [`CliError`] when an input cannot be read, when the key or
/// certificate is unusable, or when the document cannot be signed.
pub fn run_sign(args: &SignArgs) -> Result<Vec<u8>, CliError> {
    run_sign_with(args, &Terminal)
}

/// Signs a document, taking any passphrase from `source`.
pub(crate) fn run_sign_with(
    args: &SignArgs,
    source: &dyn PassphraseSource,
) -> Result<Vec<u8>, CliError> {
    let pdf = read(&args.input)?;
    let key = Zeroizing::new(read(&args.key)?);
    let certificate = read(&args.cert)?;
    let signer = load_signer(&key, &certificate, args, source)?;
    // The default window holds every signature this release can produce, with
    // room to spare, so there is no flag to size it: a knob no caller needs is
    // a permanent surface and one more way to get signing wrong.
    let options = PlaceholderOptions::default();
    Ok(sign_document(&pdf, &signer, &options)?)
}

/// Loads the signer, asking for a passphrase only if the key needs one.
fn load_signer(
    key: &[u8],
    certificate: &[u8],
    args: &SignArgs,
    source: &dyn PassphraseSource,
) -> Result<LocalPemSigner, CliError> {
    match LocalPemSigner::new(key, None, certificate) {
        Err(KeyError::PassphraseRequired) => {
            let passphrase = acquire(args, source)?;
            Ok(LocalPemSigner::new(
                key,
                Some(passphrase.as_bytes()),
                certificate,
            )?)
        }
        other => Ok(other?),
    }
}

/// Obtains a passphrase from the named variable, or by asking.
fn acquire(args: &SignArgs, source: &dyn PassphraseSource) -> Result<Zeroizing<String>, CliError> {
    let Some(name) = &args.passphrase_env else {
        return source.prompt().map_err(CliError::Passphrase);
    };
    source
        .read_variable(name)
        .ok_or_else(|| CliError::PassphraseVariableUnset {
            variable: name.clone(),
        })
}

/// Reads a whole input file.
fn read(path: &Path) -> Result<Vec<u8>, CliError> {
    std::fs::read(path).map_err(|source| CliError::Io {
        path: PathBuf::from(path),
        source,
    })
}
