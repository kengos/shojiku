//! The `formatter_pattern` harness: a date/datetime pattern rendered by
//! `format_value` against a ja-JP pack with an overlaid era and name table.

use crate::{FormatContext, LangPack, format_value};
use serde_json::Value;
use shojiku_core::{FieldSpec, FieldType, NamedFormat, NamedFormatKind};
use std::collections::BTreeMap;

#[cfg(test)]
mod tests;

/// The registry name the pattern is registered under.
const NAME: &str = "fuzz";

/// Characters the longest numeric token can render: an `i32` with its sign.
const LONGEST_NUMBER: usize = 11;

/// Renders one date value with one pattern, as both a date and a datetime,
/// and returns how many of the two renders succeeded.
///
/// The first line of `input` is the value (`yyyy-mm-dd` or RFC 3339), the
/// second the pattern, and any further lines a locale-pack overlay
/// deep-merged onto the builtin ja-JP pack (its `eras`, `eraYearOne` and
/// name tables are the hostile part). An overlay the pack parser refuses
/// ends the run. The pattern is registered in the `formats:` registry under
/// one name and picked by that name, and `format_value` consults the
/// registry before the pack's own pattern tables, so the rendered text comes
/// from the fuzzed pattern alone.
///
/// # Panics
///
/// Panics when `LangPack::era_for` returns an era year below 1 for the
/// value's `yyyy-mm-dd` prefix, or when [`assert_rendered_length`] fails for
/// a rendered text.
pub fn date_pattern(input: &str) -> usize {
    let mut lines = input.splitn(3, '\n');
    let value = lines.next().unwrap_or_default();
    let pattern = lines.next().unwrap_or_default();
    let overlay = lines.next().filter(|text| !text.trim().is_empty());
    let Ok(Some(pack)) = LangPack::builtin("ja-JP", overlay) else {
        return 0;
    };
    if let Some((year, month, day)) = calendar_date(value)
        && let Some((_, era_year)) = pack.era_for(year, month, day)
    {
        assert!(
            era_year >= 1,
            "era year {era_year} for {year}-{month}-{day}"
        );
    }
    let mut rendered = 0;
    for (field_type, kind) in [
        (FieldType::Date, NamedFormatKind::Date),
        (FieldType::Datetime, NamedFormatKind::Datetime),
    ] {
        let named = BTreeMap::from([(
            NAME.to_string(),
            NamedFormat {
                kind,
                pattern: pattern.to_string(),
            },
        )]);
        let ctx = FormatContext {
            named: Some(&named),
            ..FormatContext::default()
        };
        let spec = field_spec(field_type);
        let value = Value::String(value.to_string());
        if let Ok(formatted) = format_value(&value, Some(&spec), Some(NAME), ctx, &pack) {
            assert_rendered_length(&formatted.text, pattern, &pack);
            rendered += 1;
        }
    }
    rendered
}

/// Asserts that `text`, rendered from `pattern`, has at most as many
/// characters as `pattern` times the longest text one pattern token can
/// render under `pack`. Each pattern character either starts a token or is
/// copied once, so a longer text means a token rendered more than any name
/// table or number allows.
///
/// # Panics
///
/// Panics when `text` is longer than that bound.
fn assert_rendered_length(text: &str, pattern: &str, pack: &LangPack) {
    let chars = text.chars().count();
    let bound = pattern.chars().count() * longest_token(pack);
    assert!(chars <= bound, "{chars} characters rendered, bound {bound}");
}

/// The `yyyy-mm-dd` prefix of `value` as numbers, when it has that shape.
fn calendar_date(value: &str) -> Option<(i32, u8, u8)> {
    let mut parts = value.get(..10)?.split('-');
    let year = parts.next()?.parse().ok()?;
    let month = parts.next()?.parse().ok()?;
    let day = parts.next()?.parse().ok()?;
    Some((year, month, day))
}

/// The most characters one pattern token can render under `pack`: the
/// longest entry of every name table a token reads (month and weekday
/// names, day periods, era names and abbreviations, `eraYearOne`), or
/// [`LONGEST_NUMBER`], whichever is larger. A weekday with no name in the
/// pack renders its English name, which is shorter than [`LONGEST_NUMBER`].
/// No time-zone name is counted, because the pattern token set
/// (`PATTERN_TOKENS`) has no time-zone token.
fn longest_token(pack: &LangPack) -> usize {
    let names = pack
        .months_short
        .iter()
        .chain(&pack.months_long)
        .chain(&pack.weekdays_short)
        .chain(&pack.weekdays_long)
        .chain(&pack.day_periods)
        .chain(pack.era_year_one.iter())
        .chain(pack.eras.iter().map(|era| &era.name))
        .chain(pack.eras.iter().filter_map(|era| era.abbr.as_ref()));
    names
        .map(|name| name.chars().count())
        .fold(LONGEST_NUMBER, usize::max)
}

/// A field of `field_type` with nothing else declared.
fn field_spec(field_type: FieldType) -> FieldSpec {
    FieldSpec {
        field_type,
        currency: None,
        precision: None,
        unit: None,
        format: None,
        formats: Vec::new(),
        placeholder: None,
        enum_labels: Vec::new(),
        enum_values: Vec::new(),
    }
}
