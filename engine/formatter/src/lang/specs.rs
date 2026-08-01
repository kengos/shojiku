//! Pack value specs: number separators, per-code currency display, and
//! semantic-unit display (plural categories + layout strings).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberSpec {
    #[serde(default = "default_group_separator")]
    pub group_separator: String,
    #[serde(default = "default_decimal_separator")]
    pub decimal_separator: String,
    /// Digits in the FIRST (rightmost) group. 3 nearly everywhere.
    #[serde(default = "default_group_size")]
    pub group_size: u32,
    /// Digits per repeating group LEFT of the first one. Absent = same as
    /// [`Self::group_size`] (uniform grouping); Indian locales set 2 against
    /// a `group_size` of 3, giving `1,23,45,678` (CLDR `#,##,##0`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secondary_group_size: Option<u32>,
}

fn default_group_separator() -> String {
    ",".to_string()
}

fn default_decimal_separator() -> String {
    ".".to_string()
}

fn default_group_size() -> u32 {
    3
}

impl Default for NumberSpec {
    fn default() -> Self {
        Self {
            group_separator: default_group_separator(),
            decimal_separator: default_decimal_separator(),
            group_size: default_group_size(),
            secondary_group_size: None,
        }
    }
}

/// One currency's display data. The three named variants render
/// as: `default` = the bare grouped amount, `symbol` = `symbolFormat`
/// with `{symbol}`, `name` = `nameFormat` with `{name}` (the CLDR
/// displayName, e.g. JPY → `円`). Precision comes from the shared CLDR
/// fractions table unless overridden here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencySpec {
    pub symbol: String,
    /// CLDR displayName (ja: `円`/`米ドル`; en: yen/US dollars).
    #[serde(default)]
    pub name: Option<String>,
    /// Decimal places; unset falls back to the CLDR fractions table.
    #[serde(default)]
    pub precision: Option<u32>,
    /// Layout of the `symbol` variant (CLDR currency pattern position).
    #[serde(default = "default_symbol_format")]
    pub symbol_format: String,
    /// Layout of the `name` variant.
    #[serde(default = "default_name_format")]
    pub name_format: String,
}

fn default_symbol_format() -> String {
    "{symbol}{amount}".to_string()
}

fn default_name_format() -> String {
    "{amount} {name}".to_string()
}

/// One semantic unit key's display: CLDR plural categories (v1: `one`
/// optional + `other` required — ja uses `other` only) plus an optional
/// per-key layout overriding the pack-level `unitFormat`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitSpec {
    #[serde(default)]
    pub one: Option<String>,
    pub other: String,
    /// Per-key layout (`"{amount}{unit}"`); unset uses the pack default.
    #[serde(default)]
    pub format: Option<String>,
}

impl UnitSpec {
    /// The unit word for an amount (CLDR plural pick, v1: `one` iff the
    /// amount is exactly 1, else `other`).
    pub fn word(&self, amount: f64) -> &str {
        if amount == 1.0 {
            self.one.as_deref().unwrap_or(&self.other)
        } else {
            &self.other
        }
    }
}
