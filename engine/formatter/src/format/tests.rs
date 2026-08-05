//! Formatter tests: golden outputs per type/variant/locale, the pattern
//! grammar, and the format-precedence chain.

mod coerce;
mod dates;
mod defaults;
mod grammar;
mod grouping;
mod numbers;

use super::*;
use serde_json::json;
use serde_json::Value;

/// A small hand-written ja pack for edge-case tests; the locale goldens
/// use the real builtins via [`builtin_ja`]/[`builtin_en`].
pub(super) fn ja_pack() -> LangPack {
    LangPack::from_yaml_str(
        r#"
id: ja-JP
currencyDefault: JPY
dateFormats:
  default: "yyyy/MM/dd(E)"
  long: "yyyy年M月d日(E)"
  wareki: "Gy年M月d日"
datetimeFormats:
  default: "yyyy/MM/dd(E) HH:mm"
  ja: "yyyy年M月d日(E) HH:mm"
  wareki: "Gy年M月d日 HH:mm"
weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"]
eras:
  - { name: 明治, start: "1868-10-23" }
  - { name: 大正, start: "1912-07-30" }
  - { name: 昭和, start: "1926-12-25" }
  - { name: 平成, abbr: H, start: "1989-01-08" }
  - { name: 令和, abbr: R, start: "2019-05-01" }
eraYearOne: "元"
number:
  groupSeparator: ","
  decimalSeparator: "."
currency:
  JPY:
    symbol: "¥"
    name: "円"
    precision: 0
    symbolFormat: "{symbol}{amount}"
    nameFormat: "{amount}{name}"
  USD:
    symbol: "$"
    precision: 2
units:
  item:
    other: 点
unitFormat: "{amount}{unit}"
"#,
    )
    .expect("pack")
}

pub(super) fn builtin_ja() -> LangPack {
    LangPack::builtin("ja-JP", None)
        .expect("parse")
        .expect("exists")
}

pub(super) fn builtin_en() -> LangPack {
    LangPack::builtin("en-US", None)
        .expect("parse")
        .expect("exists")
}

pub(super) fn spec(field_type: FieldType) -> FieldSpec {
    FieldSpec {
        field_type,
        currency: None,
        precision: None,
        unit: None,
        format: None,
        formats: vec![],
        placeholder: None,
        enum_labels: vec![],
        enum_values: vec![],
    }
}

/// Formats with no template layer, asserting no degradation warning.
pub(super) fn fmt(
    value: &Value,
    spec: Option<&FieldSpec>,
    variant: Option<&str>,
    pack: &LangPack,
) -> String {
    let out = format_value(value, spec, variant, FormatContext::default(), pack).expect("format");
    assert_eq!(out.warning, None, "unexpected warning for {value}");
    out.text
}

/// Formats with no template layer, returning text + warning.
pub(super) fn fmt_warn(
    value: &Value,
    spec: Option<&FieldSpec>,
    variant: Option<&str>,
    pack: &LangPack,
) -> Formatted {
    format_value(value, spec, variant, FormatContext::default(), pack).expect("format")
}

#[test]
fn an_image_field_renders_its_reference_verbatim() {
    // An `image` field bound to a text item draws the raw reference string
    // (a path / data URI), like a plain string — no format layer applies.
    let pack = ja_pack();
    let out = fmt(
        &json!("logo.png"),
        Some(&spec(FieldType::Image)),
        None,
        &pack,
    );
    assert_eq!(out, "logo.png");
}

#[test]
fn a_format_warning_keeps_its_tighter_domain_cap_and_gains_the_control_strip() {
    // Currency/variant/unit names clip at 32, not the workspace default of
    // 200: a currency code is three characters, so there is nothing useful
    // past that. Delegating to the shared guard kept the cap and added the
    // control-character strip this site never had.
    let hostile = format!("\u{1b}[31m\u{7}{}", "c".repeat(500));
    let clipped = crate::format::money::clip(&hostile);
    assert!(!clipped.chars().any(char::is_control));
    assert_eq!(clipped.chars().count(), 33, "32 chars plus the marker");
    assert!(clipped.ends_with('…'));

    // A short, well-formed code is untouched and unmarked.
    assert_eq!(crate::format::money::clip("JPY"), "JPY");
}
