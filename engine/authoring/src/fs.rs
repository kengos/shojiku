//! Filesystem pack discovery — the shared half of locale/font loading for
//! the FS hosts (CLI, MCP server). Search-dir precedence, overlay-file
//! lookup, and the id guard → overlay-read → [`load_pack`] composition live
//! here so both hosts agree; bytes-injecting hosts (WASM) build the crate
//! with `default-features = false` and never compile this module.

use crate::locale::{load_pack, valid_locale_id, LocaleError, MAX_LOCALE_ID};
use shojiku_diagnostics::Echo;
use shojiku_formatter::{LangPack, LangPackError};
use std::path::PathBuf;
use thiserror::Error;

/// Filesystem pack loading failure. Message text is the contract both
/// hosts print/echo, so it lives here rather than per host.
#[derive(Debug, Error)]
pub enum FsPackError {
    #[error("locale id `{0}` contains invalid characters (allowed: letters, digits, `-`, `_`)")]
    InvalidLocale(Echo),
    #[error("failed to read {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("locale `{locale}` not found: not a builtin locale ({builtins}) and no `{locale}.yml` (lowercased) in the locale dirs ({dirs})")]
    LocaleNotFound {
        locale: String,
        /// The builtin locale ids, comma-separated.
        builtins: String,
        /// The searched locale dirs, comma-separated.
        dirs: String,
    },
    #[error(transparent)]
    Pack(#[from] LangPackError),
}

/// Font pack search dirs, highest priority first:
/// explicit flags (repeatable) > `$SHOJIKU_FONT_DIR` > `./packs/fonts`.
pub fn resolve_font_dirs(explicit: &[PathBuf]) -> Vec<PathBuf> {
    search_dirs(explicit, "SHOJIKU_FONT_DIR", "packs/fonts")
}

/// The font dir a NEW pack is created in: the highest-priority entry of
/// the font search list, so a pack `shojiku font add` writes is the one a
/// later render finds first.
///
/// Resolved directly rather than as `resolve_font_dirs(..).first()`,
/// which would leave an empty-list arm no input can produce. The two are
/// pinned equal by a test instead, so the precedence cannot drift apart.
pub fn primary_font_dir(explicit: &[PathBuf]) -> PathBuf {
    if let Some(dir) = explicit.first() {
        return dir.clone();
    }
    if let Ok(dir) = std::env::var("SHOJIKU_FONT_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from("packs/fonts")
}

/// Locale pack search dirs, highest priority first:
/// explicit flags (repeatable) > `$SHOJIKU_LOCALE_DIR` > `./packs/locale`.
pub fn resolve_locale_dir(explicit: &[PathBuf]) -> Vec<PathBuf> {
    search_dirs(explicit, "SHOJIKU_LOCALE_DIR", "packs/locale")
}

/// Additive search list: explicit flags (in order), then the env override,
/// then the repo-relative default. Non-existent entries are skipped later.
fn search_dirs(explicit: &[PathBuf], env: &str, default: &str) -> Vec<PathBuf> {
    let mut dirs = explicit.to_vec();
    if let Ok(d) = std::env::var(env) {
        dirs.push(PathBuf::from(d));
    }
    dirs.push(PathBuf::from(default));
    dirs
}

/// Finds `<id>.yml` (lowercased) in the first locale dir that has it.
/// `None` is not an error: builtin locales need no file.
pub fn find_locale_file(locale: &str, locale_dirs: &[PathBuf]) -> Option<PathBuf> {
    let name = format!("{}.yml", locale.to_lowercase());
    locale_dirs
        .iter()
        .map(|dir| dir.join(&name))
        .find(|f| f.is_file())
}

/// Loads the locale pack for `locale`: guards the id (it becomes a file
/// name), finds any `<id>.yml` overlay, and hands its content to
/// [`load_pack`], which merges over the builtin or parses a standalone
/// pack. The not-found result becomes the dir-listing error.
pub fn load_locale_pack(locale: &str, locale_dirs: &[PathBuf]) -> Result<LangPack, FsPackError> {
    if !valid_locale_id(locale) {
        // The id's own domain cap: past MAX_LOCALE_ID the value is
        // invalid by definition, so there is nothing useful to echo.
        return Err(FsPackError::InvalidLocale(Echo::clipped_to(
            locale,
            MAX_LOCALE_ID,
        )));
    }
    let overlay = find_locale_file(locale, locale_dirs)
        .map(|path| {
            std::fs::read_to_string(&path).map_err(|source| FsPackError::Io { path, source })
        })
        .transpose()?;
    match load_pack(locale, overlay.as_deref()) {
        Ok(pack) => Ok(pack),
        Err(LocaleError::NotFound(_)) => Err(FsPackError::LocaleNotFound {
            locale: locale.to_string(),
            builtins: shojiku_formatter::BUILTIN_LOCALE_IDS.join(", "),
            dirs: locale_dirs
                .iter()
                .map(|d| d.display().to_string())
                .collect::<Vec<_>>()
                .join(", "),
        }),
        Err(LocaleError::Pack(err)) => Err(err.into()),
    }
}

#[cfg(test)]
mod tests;
