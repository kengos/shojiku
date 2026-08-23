//! Locale packs: builtin (CLDR-generated, compiled in) + the
//! `packs/locale/<id>.yml` per-key overlay, era tables, and font-pack
//! resolution.

mod builtin;
mod era;
mod fonts;
mod packs;
mod specs;
#[cfg(test)]
mod tests;

pub use builtin::{currency_fraction_digits, BUILTIN_LOCALE_IDS};
pub use era::{EraDate, EraSpec};
pub use fonts::{valid_pack_id, FaceSpec, FontFaceDecl, LocaleFonts, PackManifest, MAX_PACK_ID};
pub use packs::{
    resolve_face_bytes, resolve_face_bytes_subset, resolve_face_specs, resolve_face_specs_with,
    FaceBytes, InjectedPack, PackError, SubsetFaces,
};
pub use specs::{CurrencySpec, NumberSpec, UnitSpec};

use serde::{Deserialize, Serialize};
use shojiku_diagnostics::Echo;
use std::collections::BTreeMap;
use std::path::Path;
use thiserror::Error;

/// Locale-pack loading failures. Paths and the serde message are echoes of
/// untrusted pack content, so they take the bounded type; the I/O source is
/// OS text and stays as it is.
#[derive(Debug, Error)]
pub enum LangPackError {
    #[error("failed to read locale pack file {path}: {source}")]
    Io { path: Echo, source: std::io::Error },
    #[error("failed to parse locale pack: {0}")]
    Parse(Echo),
    /// Refused unread for its size, on the same bound the core wire doors
    /// use. A pack is data a host supplies, and every pack door goes
    /// through `ensure_pack_size` — the locale pack, the builtin overlay,
    /// and all four font-pack manifest sites.
    #[error("locale pack is {bytes} bytes, over the {limit}-byte input cap")]
    TooLarge { bytes: usize, limit: usize },
}

impl From<serde_yaml::Error> for LangPackError {
    fn from(err: serde_yaml::Error) -> Self {
        LangPackError::Parse(Echo::from(err.to_string()))
    }
}

/// One locale's defaults, loaded from `locale.yml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LangPack {
    pub id: String,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub writing_mode: Option<String>,
    #[serde(default)]
    pub currency_default: Option<String>,
    #[serde(default)]
    pub date_formats: BTreeMap<String, String>,
    #[serde(default)]
    pub datetime_formats: BTreeMap<String, String>,
    #[serde(default = "default_weekdays")]
    pub weekdays_short: Vec<String>,
    /// Full weekday names (`EEEE`); empty falls back to the short form.
    #[serde(default)]
    pub weekdays_long: Vec<String>,
    /// Abbreviated month names (`MMM`), January first; empty renders the
    /// month number.
    #[serde(default)]
    pub months_short: Vec<String>,
    /// Full month names (`MMMM`); empty falls back to the short form.
    #[serde(default)]
    pub months_long: Vec<String>,
    /// `[am, pm]` display strings for the `a` token; empty renders AM/PM.
    #[serde(default)]
    pub day_periods: Vec<String>,
    #[serde(default)]
    pub number: NumberSpec,
    #[serde(default)]
    pub currency: BTreeMap<String, CurrencySpec>,
    /// Era table for era-based date formatting (wareki); empty = no eras.
    #[serde(default)]
    pub eras: Vec<EraSpec>,
    /// Display form of era year 1 (ja: `元`); `None` renders `1`.
    #[serde(default)]
    pub era_year_one: Option<String>,
    /// Semantic unit key → display words.
    #[serde(default)]
    pub units: BTreeMap<String, UnitSpec>,
    /// Layout of a quantity (`"{amount}{unit}"` ja, `"{amount} {unit}"`
    /// en); per-key `UnitSpec.format` overrides it.
    #[serde(default = "default_unit_format")]
    pub unit_format: String,
    /// Layout of a percentage (`"{amount}%"`).
    #[serde(default = "default_percent_format")]
    pub percent_format: String,
    #[serde(default)]
    pub fonts: Option<LocaleFonts>,
}

fn default_weekdays() -> Vec<String> {
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

fn default_unit_format() -> String {
    "{amount} {unit}".to_string()
}

fn default_percent_format() -> String {
    "{amount}%".to_string()
}

/// Refuses host-supplied pack text over `shojiku_core::MAX_INPUT_BYTES`,
/// unread. Shared by every pack door — the locale pack, the builtin
/// OVERLAY, and the font-pack manifest — so the bound is read from one
/// place rather than compared at four call sites that can drift apart.
pub(crate) fn ensure_pack_size(input: &str) -> Result<(), LangPackError> {
    if input.len() > shojiku_core::MAX_INPUT_BYTES {
        return Err(LangPackError::TooLarge {
            bytes: input.len(),
            limit: shojiku_core::MAX_INPUT_BYTES,
        });
    }
    Ok(())
}

impl LangPack {
    /// Parses a pack from YAML content (without a base directory).
    ///
    /// Refuses an oversize input unread, on the same bound the core wire
    /// doors use (`shojiku_core::MAX_INPUT_BYTES`) — a pack arrives from a
    /// host the same way a template does.
    pub fn from_yaml_str(input: &str) -> Result<Self, LangPackError> {
        ensure_pack_size(input)?;
        Ok(serde_yaml::from_str(input)?)
    }

    /// Loads a locale pack from `<file>` (`packs/locale/<id>.yml`).
    pub fn load(file: &Path) -> Result<Self, LangPackError> {
        let content = std::fs::read_to_string(file).map_err(|source| LangPackError::Io {
            path: Echo::from(file),
            source,
        })?;
        Self::from_yaml_str(&content)
    }

    /// The font pack ids this locale uses (`fonts.uses`), in order.
    /// Empty when the pack declares no fonts.
    pub fn font_pack_ids(&self) -> &[String] {
        self.fonts.as_ref().map_or(&[], |f| &f.uses)
    }

    /// The default font face id, if the pack declares fonts.
    pub fn default_font(&self) -> Option<&str> {
        self.fonts.as_ref().map(|f| f.default.as_str())
    }

    /// The locale fallback chain: face/family ids tried in order for
    /// glyphs the primary face cannot map. Empty when unset.
    pub fn font_fallback(&self) -> &[String] {
        self.fonts.as_ref().map_or(&[], |f| &f.fallback)
    }

    /// Unit display spec for a semantic unit key (e.g. `item`).
    pub fn unit(&self, key: &str) -> Option<&UnitSpec> {
        self.units.get(key)
    }

    /// The era containing the given Gregorian day plus its 1-based era
    /// year; `None` when no era covers the date.
    pub fn era_for(&self, year: i32, month: u8, day: u8) -> Option<(&EraSpec, i32)> {
        era::era_for(&self.eras, EraDate { year, month, day })
    }
}
