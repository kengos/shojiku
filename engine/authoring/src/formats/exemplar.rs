//! The fixed exemplar values a format sample is rendered against, and the
//! `FieldSpec`s that carry them.
//!
//! These are ENGINE constants, never caller-supplied. Two reasons, and the
//! second is the one that shapes the numbers: a picker's samples must be
//! identical for the same template on every machine (the determinism the
//! whole preview path rests on), and each value has to DISCRIMINATE the
//! variants of its own type. A sample that reads the same across the cases
//! it is meant to explain silently under-describes the pick — a locale
//! panel once demoed digit grouping with `1,234.5`, which groups
//! identically under every rule the packs declare.

use serde_json::{json, Value};
use shojiku_core::{FieldSpec, FieldType};

/// The dated exemplar, `2026-11-03T14:05:00+09:00`.
///
/// Chosen so every date token produces a distinct, recognisable string:
/// the year sits inside an era (令和8年, so the era tokens differ from
/// `yyyy`), the month has a name (`MMM`/`MMMM`), the day is a Tuesday
/// (`E`/`EEEE`), and the time is past noon — without which `HH` and `hh`
/// render the same text and the 12-hour tokens look broken.
pub(super) const DATED: &str = "2026-11-03T14:05:00+09:00";

/// Eight significant digits, so uniform three-digit grouping
/// (`12,345,678.9`) and the CLDR lakh/crore sizes (`1,23,45,678.9`)
/// render differently.
pub(super) const NUMBER: f64 = 12_345_678.9;

/// Grouped digits plus a fraction, so a zero-decimal currency (JPY rounds
/// to `¥1,234,568`) and a two-decimal one (`$1,234,567.89`) are visibly
/// different — precision is part of what a currency variant decides.
pub(super) const CURRENCY: f64 = 1_234_567.89;

/// A FRACTION. The percentage formatter scales by 100, so this renders
/// `12.34%`; passing `12.34` would render `1,234%` and teach the wrong
/// wire to anyone reading the sample.
pub(super) const PERCENTAGE: f64 = 0.1234;

/// Quantities are plural-aware and one value cannot show both arms, so the
/// quantity row samples the `one` case and the `other` case.
pub(super) const QUANTITY: [f64; 2] = [1.0, 12_345.0];

/// The semantic unit key the quantity exemplar declares. Every shipped
/// pack carries it, and the display words live in the pack — never here
/// (the i18n boundary).
const UNIT: &str = "item";

/// The exemplar value(s) for a type. Every type but `quantity` samples one
/// value; see [`QUANTITY`].
pub(super) fn values(field_type: FieldType) -> Vec<Value> {
    match field_type {
        FieldType::Date | FieldType::Datetime => vec![json!(DATED)],
        FieldType::Number => vec![json!(NUMBER)],
        FieldType::Currency => vec![json!(CURRENCY)],
        FieldType::Percentage => vec![json!(PERCENTAGE)],
        FieldType::Quantity => QUANTITY.iter().map(|n| json!(n)).collect(),
        // No format layer applies to these, so the catalog never asks.
        FieldType::String | FieldType::Boolean | FieldType::Image => Vec::new(),
    }
}

/// The `FieldSpec` the exemplar is formatted through.
///
/// It declares only what the TYPE needs — the unit key for a quantity —
/// and deliberately leaves `currency`, `precision` and `format` unset, so
/// the sample resolves through the same document chain a real binding
/// would (`defaults.currency`, the pack's fractions table, the template's
/// per-type default). A spec that pinned them would render a sample no
/// placement in the document could reproduce.
pub(super) fn spec(field_type: FieldType) -> FieldSpec {
    FieldSpec {
        field_type,
        currency: None,
        precision: None,
        unit: match field_type {
            FieldType::Quantity => Some(UNIT.to_string()),
            _ => None,
        },
        format: None,
        formats: Vec::new(),
        placeholder: None,
        enum_labels: Vec::new(),
        enum_values: Vec::new(),
    }
}
