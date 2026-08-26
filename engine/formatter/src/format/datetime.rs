//! Date/datetime parsing and pattern rendering (CLDR-subset tokens incl.
//! The era pair and the quoting/month-name/12-hour additions).

use super::FormatError;
use crate::lang::LangPack;
use serde_json::Value;
use shojiku_diagnostics::Echo;
use time::format_description::well_known::Rfc3339;
use time::{Date, OffsetDateTime, Weekday};

pub(super) fn parse_simple_date(s: &str) -> Option<Date> {
    let mut parts = s.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u8 = parts.next()?.parse().ok()?;
    let day: u8 = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    let month = time::Month::try_from(month).ok()?;
    Date::from_calendar_date(year, month, day).ok()
}

pub(super) fn parse_datetime(value: &Value) -> Result<OffsetDateTime, FormatError> {
    let s = match value {
        Value::String(s) => s.as_str(),
        other => {
            return Err(FormatError::InvalidDatetime(Echo::inline(
                &other.to_string(),
            )));
        }
    };
    if let Ok(odt) = OffsetDateTime::parse(s, &Rfc3339) {
        return Ok(odt);
    }
    if let Some(date) = parse_simple_date(s) {
        return Ok(date.midnight().assume_utc());
    }
    Err(FormatError::InvalidDatetime(Echo::inline(s)))
}

/// The token inventory, longest-match first. **Append-only contract**
/// (docs/engine/data-binding.md): existing tokens never change meaning.
/// `y`/`G`/`GG` are the era set (CLDR japanese-calendar semantics with a
/// Gregorian fallback); `MMM`/`MMMM`/`EEEE`/`a`/`h`/`hh` are the pattern-grammar
/// additions that let real CLDR skeleton patterns hold.
pub const TOKENS: &[&str] = &[
    "yyyy", "y", "MMMM", "MMM", "MM", "M", "dd", "d", "EEEE", "E", "HH", "H", "hh", "h", "mm",
    "ss", "a", "GG", "G",
];

/// Renders a `yyyy/MM/dd(E) HH:mm`-style pattern.
///
/// CLDR quoting: text between `'` quotes is literal (so `'y'` emits `y`),
/// and `''` is a literal apostrophe — both inside and outside quotes. An
/// unterminated quote runs to the end of the pattern (never an error:
/// patterns come from untrusted packs/templates and must degrade).
/// Unquoted non-token characters pass through unchanged, so Japanese
/// pattern text needs no quoting.
pub(super) fn render_datetime_pattern(
    pattern: &str,
    odt: &OffsetDateTime,
    pack: &LangPack,
) -> String {
    let mut out = String::new();
    let chars: Vec<char> = pattern.chars().collect();
    let mut i = 0;
    let mut quoted = false;
    while i < chars.len() {
        if chars[i] == '\'' {
            if chars.get(i + 1) == Some(&'\'') {
                out.push('\'');
                i += 2;
            } else {
                quoted = !quoted;
                i += 1;
            }
            continue;
        }
        if quoted {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let rest = &chars[i..];
        match TOKENS.iter().find(|token| starts_with_token(rest, token)) {
            Some(token) => {
                out.push_str(&render_token(token, odt, pack));
                i += token.len();
            }
            None => {
                out.push(chars[i]);
                i += 1;
            }
        }
    }
    out
}

/// Whether `rest` begins with `token`'s characters.
///
/// Allocation-free on purpose. The previous spelling collected `rest`
/// into a fresh `String` at every position, which made pattern rendering
/// **O(n^2) in pattern length** — and patterns are untrusted
/// (`InlineFormat.pattern` and `NamedFormat.pattern` are plain required
/// strings a template may author at any length, and this path runs at
/// RENDER time, not just at authoring time). Rendering is linear now, so a
/// long pattern costs what a long literal run of template text costs and
/// needs no cap of its own; the caller-supplied patterns that are NOT
/// bounded by the template size cap are bounded where they enter
/// (`shojiku_authoring`'s format-catalog probes).
///
/// [`TOKENS`] is all-ASCII, which is also what lets the caller advance by
/// `token.len()` over a `char` slice.
fn starts_with_token(rest: &[char], token: &str) -> bool {
    let mut rest = rest.iter();
    token.chars().all(|t| rest.next() == Some(&t))
}

pub(super) fn render_token(token: &str, odt: &OffsetDateTime, pack: &LangPack) -> String {
    match token {
        "yyyy" => format!("{:04}", odt.year()),
        "MM" => format!("{:02}", u8::from(odt.month())),
        "M" => format!("{}", u8::from(odt.month())),
        "MMM" => month_name(odt, &pack.months_short, &pack.months_long),
        "MMMM" => month_name(odt, &pack.months_long, &pack.months_short),
        "dd" => format!("{:02}", odt.day()),
        "d" => format!("{}", odt.day()),
        "HH" => format!("{:02}", odt.hour()),
        "H" => format!("{}", odt.hour()),
        "hh" => format!("{:02}", hour12(odt)),
        "h" => format!("{}", hour12(odt)),
        "mm" => format!("{:02}", odt.minute()),
        "ss" => format!("{:02}", odt.second()),
        "a" => day_period(odt, pack),
        "E" => weekday_name(odt.weekday(), &pack.weekdays_short, &pack.weekdays_long),
        "EEEE" => weekday_name(odt.weekday(), &pack.weekdays_long, &pack.weekdays_short),
        "G" => match current_era(odt, pack) {
            Some((era, _)) => era.name.clone(),
            None => String::new(),
        },
        "GG" => match current_era(odt, pack) {
            // Abbreviation with a name fallback: an era without `abbr`
            // must not silently vanish from a compact form.
            Some((era, _)) => era.abbr.clone().unwrap_or_else(|| era.name.clone()),
            None => String::new(),
        },
        "y" => match current_era(odt, pack) {
            Some((_, 1)) => match &pack.era_year_one {
                Some(one) => one.clone(),
                None => "1".to_string(),
            },
            Some((_, year)) => year.to_string(),
            None => odt.year().to_string(),
        },
        _ => token.to_string(),
    }
}

/// 12-hour clock: 0 → 12, 13 → 1.
fn hour12(odt: &OffsetDateTime) -> u8 {
    match odt.hour() % 12 {
        0 => 12,
        h => h,
    }
}

fn day_period(odt: &OffsetDateTime, pack: &LangPack) -> String {
    let index = usize::from(odt.hour() >= 12);
    match pack.day_periods.get(index) {
        Some(p) => p.clone(),
        None => (if index == 0 { "AM" } else { "PM" }).to_string(),
    }
}

/// A month name from the preferred list, falling back to the other list
/// then to the month number — hostile packs may ship short lists.
fn month_name(odt: &OffsetDateTime, preferred: &[String], fallback: &[String]) -> String {
    let index = usize::from(u8::from(odt.month())) - 1;
    preferred
        .get(index)
        .or_else(|| fallback.get(index))
        .cloned()
        .unwrap_or_else(|| format!("{}", u8::from(odt.month())))
}

fn current_era<'a>(
    odt: &OffsetDateTime,
    pack: &'a LangPack,
) -> Option<(&'a crate::lang::EraSpec, i32)> {
    pack.era_for(odt.year(), u8::from(odt.month()), odt.day())
}

/// A weekday name from the preferred list, falling back to the other
/// list then to the English name.
fn weekday_name(weekday: Weekday, preferred: &[String], fallback: &[String]) -> String {
    let index = weekday.number_days_from_sunday() as usize;
    preferred
        .get(index)
        .or_else(|| fallback.get(index))
        .cloned()
        .unwrap_or_else(|| weekday.to_string())
}
