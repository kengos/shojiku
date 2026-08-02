//! Era tables (wareki): the `eras:` wire types and the date→era lookup.

use serde::de::Error as DeError;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// One era: display name + the first Gregorian day of the era, plus an
/// optional abbreviation (`令和` → `R`) for the `GG` token so compact
/// rirekisho / business forms (`R7.4.1`) are authorable.
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

fn truncated(s: &str) -> &str {
    match s.char_indices().nth(32) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

/// Strict `yyyy-mm-dd` parse; the day must exist on the real calendar.
fn parse_era_date(s: &str) -> Option<EraDate> {
    let mut parts = s.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
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
