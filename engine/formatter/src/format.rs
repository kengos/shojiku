//! `format(value, type, locale, options) -> string`
//!
//! The single formatting entry point used by the layout engine: the
//! effective format resolves through the precedence chain — placement
//! `format:` ← definitions `Field.format` ← the template's per-type
//! default ← the pack default — and degradations (unknown variant /
//! currency / unit) come back as a [`FormatWarning`] beside the text,
//! never as a failure: rendering proceeds on the default form.

mod datetime;
mod money;
mod number;
mod text;

use crate::lang::LangPack;
use datetime::{parse_datetime, parse_simple_date, render_datetime_pattern};
use number::format_number;
use serde_json::Value;
use shojiku_core::{FieldSpec, FieldType, FormatDefaults, FormatRef, NamedFormat};
use std::collections::BTreeMap;
use thiserror::Error;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Debug, Error)]
pub enum FormatError {
    #[error("value is not a number")]
    NotANumber,
    #[error("value `{0}` is not a valid datetime (RFC 3339 expected)")]
    InvalidDatetime(String),
    #[error("value `{0}` is not a valid date (yyyy-mm-dd expected)")]
    InvalidDate(String),
}

/// A degradation notice: the value rendered on its fallback form and the
/// caller should surface a diagnostic. Names are truncated at
/// construction so hostile input never echoes unbounded.
#[derive(Debug, Clone, PartialEq, Error)]
pub enum FormatWarning {
    #[error("format variant `{0}` is not defined; using the default")]
    UnknownVariant(String),
    #[error("currency code `{0}` has no display data; using the code as its symbol")]
    UnknownCurrency(String),
    #[error("unit key `{0}` is not in the locale pack; rendering the key verbatim")]
    UnknownUnit(String),
    #[error("an inline pattern only applies to date/datetime; using the default")]
    IgnoredPattern,
}

/// A formatted value plus at most one degradation notice.
#[derive(Debug, Clone, PartialEq)]
pub struct Formatted {
    pub text: String,
    pub warning: Option<FormatWarning>,
}

impl Formatted {
    fn clean(text: String) -> Self {
        Formatted {
            text,
            warning: None,
        }
    }
}

/// The template's format layer, passed by the layout engine.
#[derive(Debug, Clone, Copy, Default)]
pub struct FormatContext<'a> {
    /// `defaults.formats` — per-type defaults.
    pub defaults: Option<&'a FormatDefaults>,
    /// The `formats:` named registry.
    pub named: Option<&'a BTreeMap<String, NamedFormat>>,
    /// `defaults.currency` — the document currency code, the middle of
    /// the currency fallback chain (`Field.currency` → this → the pack's
    /// `currencyDefault`).
    pub currency: Option<&'a str>,
}

/// The resolved format pick for one value.
enum Pick<'a> {
    Name(&'a str),
    Pattern(&'a str),
}

/// Precedence: placement ← field default ← template per-type
/// default. `None` = the pack default.
fn effective<'a>(
    variant: Option<&'a str>,
    spec: Option<&'a FieldSpec>,
    ctx: &FormatContext<'a>,
    field_type: FieldType,
) -> Option<Pick<'a>> {
    if let Some(v) = variant {
        return Some(Pick::Name(v));
    }
    if let Some(f) = spec.and_then(|s| s.format.as_deref()) {
        return Some(Pick::Name(f));
    }
    let defaults = ctx.defaults?;
    let fr = match field_type {
        FieldType::Date => defaults.date.as_ref(),
        FieldType::Datetime => defaults.datetime.as_ref(),
        FieldType::Number => defaults.number.as_ref(),
        FieldType::Currency => defaults.currency.as_ref(),
        FieldType::Percentage => defaults.percentage.as_ref(),
        FieldType::Quantity => defaults.quantity.as_ref(),
        // Strings, booleans, and images have no default format layer.
        FieldType::String | FieldType::Boolean | FieldType::Image => None,
    }?;
    Some(match fr {
        FormatRef::Name(n) => Pick::Name(n),
        FormatRef::Inline(i) => Pick::Pattern(&i.pattern),
    })
}

/// Formats one params value for display.
///
/// - `spec` comes from definitions when available; without it the type is
///   inferred from the JSON value (RFC 3339 strings become datetimes).
/// - `variant` is the placement's pick: a named format (`wareki`, a
///   `formats:` registry name, a currency variant) or a type override
///   when it names one (`currency`, `percentage`, ...). On a number,
///   `symbol`/`name` coerce to the currency type with that variant.
pub fn format_value(
    value: &Value,
    spec: Option<&FieldSpec>,
    variant: Option<&str>,
    ctx: FormatContext,
    pack: &LangPack,
) -> Result<Formatted, FormatError> {
    if value.is_null() {
        return Ok(Formatted::clean(String::new()));
    }

    let mut field_type = spec
        .map(|s| s.field_type)
        .unwrap_or_else(|| infer_type(value));
    let mut variant = variant;
    if let Some(v) = variant {
        if let Some(overridden) = FieldType::from_name(v) {
            field_type = overridden;
            variant = None;
        }
    }
    // A currency-variant pick on a plain number promotes the value to
    // currency, keeping the variant (the code rides the `defaults.currency`
    // chain) — so a `symbol`/`name` money display needs no definitions.
    if field_type == FieldType::Number && matches!(variant, Some("symbol" | "name")) {
        field_type = FieldType::Currency;
    }
    let pick = effective(variant, spec, &ctx, field_type);

    match field_type {
        // Booleans display as their bare `true`/`false`, and an image
        // reference draws verbatim if bound to text — both like a string.
        FieldType::String | FieldType::Boolean | FieldType::Image => {
            Ok(text::format_text(value, spec, pick))
        }
        FieldType::Number => {
            let n = as_f64(value)?;
            Ok(Formatted {
                text: format_number(n, None, pack),
                warning: no_variant_warning(pick),
            })
        }
        FieldType::Currency => {
            let n = as_f64(value)?;
            Ok(money::format_currency(n, spec, ctx.currency, pick, pack))
        }
        FieldType::Datetime => {
            let odt = parse_datetime(value)?;
            Ok(render_dated(
                pick,
                &odt,
                &ctx,
                pack,
                &[&pack.datetime_formats, &pack.date_formats],
                "yyyy-MM-dd HH:mm",
            ))
        }
        FieldType::Date => {
            let odt = parse_datetime(value)?;
            Ok(render_dated(
                pick,
                &odt,
                &ctx,
                pack,
                &[&pack.date_formats],
                "yyyy-MM-dd",
            ))
        }
        FieldType::Quantity => {
            let n = as_f64(value)?;
            let mut out = money::format_quantity(n, spec, pack);
            out.warning = out.warning.or_else(|| no_variant_warning(pick));
            Ok(out)
        }
        FieldType::Percentage => {
            let n = as_f64(value)?;
            let amount = format_number(n * 100.0, spec.and_then(|s| s.precision), pack);
            Ok(Formatted {
                text: pack.percent_format.replace("{amount}", &amount),
                warning: no_variant_warning(pick),
            })
        }
    }
}

/// number/percentage/quantity have no named variants (v1): any pick
/// other than `default` degrades to the plain form with a warning —
/// silently ignoring an authored pick would be a standing lie.
fn no_variant_warning(pick: Option<Pick>) -> Option<FormatWarning> {
    match pick {
        None | Some(Pick::Name("default")) => None,
        Some(Pick::Name(n)) => Some(FormatWarning::UnknownVariant(money::clip(n))),
        Some(Pick::Pattern(_)) => Some(FormatWarning::IgnoredPattern),
    }
}

/// Renders a date/datetime through the pick: an inline pattern renders
/// directly; a name looks up the `formats:` registry then the pack maps
/// in order; an unknown name degrades to the default with a warning.
fn render_dated(
    pick: Option<Pick>,
    odt: &OffsetDateTime,
    ctx: &FormatContext,
    pack: &LangPack,
    maps: &[&BTreeMap<String, String>],
    engine_default: &str,
) -> Formatted {
    // Eager lookups (cheap map gets): late-bound `||` thunks here become
    // per-binary uncovered instantiations under the 100% coverage gate.
    let default_pattern = maps
        .iter()
        .find_map(|m| m.get("default"))
        .map(String::as_str)
        .unwrap_or(engine_default);
    let (pattern, warning) = match &pick {
        Some(Pick::Pattern(p)) => (*p, None),
        Some(Pick::Name(name)) => {
            // A match, not `.map(...)`: a consumer whose registry lookup
            // always misses would leave the `.map` closure instantiation
            // at 0 under the per-binary 100% coverage gate.
            #[allow(clippy::manual_map)]
            let named = match ctx.named.and_then(|m| m.get(*name)) {
                Some(n) => Some(n.pattern.as_str()),
                None => None,
            };
            let from_pack = maps.iter().find_map(|m| m.get(*name)).map(String::as_str);
            match named.or(from_pack) {
                Some(p) => (p, None),
                None if *name == "default" => (default_pattern, None),
                None => (
                    default_pattern,
                    Some(FormatWarning::UnknownVariant(money::clip(name))),
                ),
            }
        }
        None => (default_pattern, None),
    };
    Formatted {
        text: render_datetime_pattern(pattern, odt, pack),
        warning,
    }
}

fn infer_type(value: &Value) -> FieldType {
    match value {
        Value::Number(_) => FieldType::Number,
        Value::String(s) => {
            if OffsetDateTime::parse(s, &Rfc3339).is_ok() {
                FieldType::Datetime
            } else if parse_simple_date(s).is_some() {
                FieldType::Date
            } else {
                FieldType::String
            }
        }
        _ => FieldType::String,
    }
}

fn as_f64(value: &Value) -> Result<f64, FormatError> {
    value.as_f64().ok_or(FormatError::NotANumber)
}

#[cfg(test)]
mod tests;
