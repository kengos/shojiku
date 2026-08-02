//! Locale-id resolution and pack loading from an overlay STRING (not a
//! path). The charset guard, the builtin+overlay deep-merge, and the
//! standalone-pack fallback live here so every surface agrees; filesystem
//! discovery of the overlay file stays in `shojiku-cli`.

use shojiku_formatter::{LangPack, LangPackError};
use thiserror::Error;

/// Longest accepted locale id. BCP 47 tags stay well under this; the id is
/// echoed on the invalid-id error, so the cap also bounds that echo.
const MAX_LOCALE_ID: usize = 64;

#[derive(Debug, Error)]
pub enum LocaleError {
    /// Not a builtin locale and the caller supplied no overlay/standalone
    /// pack content. The CLI maps this to its dir-listing not-found error.
    #[error("locale `{0}` is not a builtin and no pack content was provided")]
    NotFound(String),
    #[error(transparent)]
    Pack(#[from] LangPackError),
}

/// Resolves the locale id: explicit (`--lang`) > the template
/// `defaults.locale` > `ja-JP`.
pub fn resolve_locale_id(explicit: Option<&str>, template_locale: Option<&str>) -> String {
    explicit.or(template_locale).unwrap_or("ja-JP").to_string()
}

/// Locale ids double as file names on the filesystem path, so they must stay
/// inside the BCP 47 tag charset (and bounded). This is the ONE home for the
/// check; the CLI calls it before building a path from an id. `load_pack`
/// itself never touches the filesystem, so it does not need the guard — a
/// hostile id only reaches a name lookup (no match) or a whole-pack parse.
pub fn valid_locale_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_LOCALE_ID
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Builds the [`LangPack`] for `locale`: a builtin (with `overlay` deep-merged
/// per key when present), or a standalone pack parsed from `overlay` for a
/// non-builtin locale. The caller supplies the overlay content (from a file,
/// an injected string, …); this never touches the filesystem.
pub fn load_pack(locale: &str, overlay: Option<&str>) -> Result<LangPack, LocaleError> {
    if let Some(pack) = LangPack::builtin(locale, overlay)? {
        return Ok(pack);
    }
    match overlay {
        Some(content) => Ok(LangPack::from_yaml_str(content)?),
        None => Err(LocaleError::NotFound(locale.to_string())),
    }
}

#[cfg(test)]
mod tests;
