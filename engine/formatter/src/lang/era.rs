//! Era tables (wareki): the `eras:` wire types and the date→era lookup.

use serde::de::Error as DeError;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// One era: display name + the first Gregorian day of the era, plus an
/// optional abbreviation (`令和` → `R`) for the `GG` token so compact
/// rirekisho / business forms (`R7.4.1`) are authorable.
///
/// `start` may precede year 1 (`-542-01-01`, the Buddhist era), which is how
/// a single open-ended era covers every date a document can carry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EraSpec {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub abbr: Option<String>,
    pub start: EraDate,
}

/// A Gregorian calendar day, authored as `"yyyy-mm-dd"`. Ordered so era
/// lookup is a plain comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct EraDate {
    pub year: i32,
    pub month: u8,
    pub day: u8,
}

impl Serialize for EraDate {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!(
            "{:04}-{:02}-{:02}",
            self.year, self.month, self.day
        ))
    }
}

impl<'de> Deserialize<'de> for EraDate {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        match parse_era_date(&s) {
            Some(date) => Ok(date),
            // Truncate the echo: the value comes from untrusted pack input.
            None => Err(D::Error::custom(format!(
                "invalid era start date `{}` (yyyy-mm-dd expected)",
                truncated(&s)
            ))),
        }
    }
}

/// Bounds a pack-supplied date string echoed into a deserialize error. The
/// cap is this module's (an era start date is ten characters); the guard is
/// the workspace's one implementation, which also strips control characters.
fn truncated(s: &str) -> String {
    shojiku_diagnostics::sanitize_marked(s, 32)
}

/// Strict `yyyy-mm-dd` parse; the day must exist on the real calendar.
///
/// A leading `-` is the YEAR's sign, not a field separator: an era can begin
/// before year 1. The Buddhist era does — CLDR writes its start
/// `-542-01-01`, and [`era_for`]'s plain subtraction then yields the
/// Buddhist year (2026 → 2569) with no special case anywhere else.
fn parse_era_date(s: &str) -> Option<EraDate> {
    let (negative, rest) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s),
    };
    let mut parts = rest.split('-');
    let year_field = parts.next()?;
    // `i32::from_str` accepts a leading `+`, which after the strip above would
    // make `-+542-01-01` parse. The wire takes one sign, in one place.
    if year_field.starts_with('+') {
        return None;
    }
    // The sign was consumed above, so this field parses non-negative and the
    // negation cannot reach `i32::MIN`.
    let magnitude: i32 = year_field.parse().ok()?;
    let year = if negative { -magnitude } else { magnitude };
    let month: u8 = parts.next()?.parse().ok()?;
    let day: u8 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let m = time::Month::try_from(month).ok()?;
    time::Date::from_calendar_date(year, m, day).ok()?;
    Some(EraDate { year, month, day })
}

/// The era containing `date` (the one with the latest start not after it)
/// plus the 1-based era year. `None` when the list is empty or the date
/// precedes every era. The list is not assumed sorted.
pub(crate) fn era_for(eras: &[EraSpec], date: EraDate) -> Option<(&EraSpec, i32)> {
    let era = eras
        .iter()
        .filter(|e| e.start <= date)
        .max_by_key(|e| e.start)?;
    Some((era, date.year - era.start.year + 1))
}

#[cfg(test)]
mod tests;
