//! Unit tests for the pack wire (parse, defaults, file loading).

use super::*;

const SAMPLE: &str = r#"
id: ja-JP
currencyDefault: JPY
dateFormats:
  default: "yyyy/MM/dd(E)"
datetimeFormats:
  default: "yyyy/MM/dd(E) HH:mm"
  ja: "yyyy年M月d日(E) HH:mm"
weekdaysShort: ["日", "月", "火", "水", "木", "金", "土"]
monthsShort: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
number:
  groupSeparator: ","
  decimalSeparator: "."
currency:
  JPY:
    symbol: "¥"
    name: "円"
    symbolFormat: "{symbol}{amount}"
    nameFormat: "{amount}{name}"
units:
  item:
    other: 点
unitFormat: "{amount}{unit}"
fonts:
  uses: [biz-ud]
  default: biz-udp-gothic
  fallback: [ipamj-mincho]
"#;

#[test]
fn parses_sample_pack() {
    let pack = LangPack::from_yaml_str(SAMPLE).expect("parse");
    assert_eq!(pack.id, "ja-JP");
    assert_eq!(pack.currency_default.as_deref(), Some("JPY"));
    assert_eq!(pack.weekdays_short[0], "日");
    assert_eq!(pack.months_short[11], "12月");
    let jpy = pack.currency.get("JPY").unwrap();
    assert_eq!(jpy.symbol, "¥");
    assert_eq!(jpy.name.as_deref(), Some("円"));
    assert_eq!(jpy.precision, None);
    assert_eq!(pack.unit("item").unwrap().other, "点");
    assert_eq!(pack.unit_format, "{amount}{unit}");
    assert_eq!(pack.default_font(), Some("biz-udp-gothic"));
    assert_eq!(pack.font_pack_ids(), ["biz-ud"]);
    assert_eq!(pack.font_fallback(), ["ipamj-mincho"]);
}

#[test]
fn defaults_are_sensible() {
    let pack = LangPack::from_yaml_str("id: xx-XX").expect("parse");
    assert_eq!(pack.number.group_separator, ",");
    assert_eq!(pack.weekdays_short.len(), 7);
    assert!(pack.weekdays_long.is_empty());
    assert!(pack.months_short.is_empty());
    assert!(pack.day_periods.is_empty());
    assert_eq!(pack.unit_format, "{amount} {unit}");
    assert_eq!(pack.percent_format, "{amount}%");
    assert!(pack.fonts.is_none());
    assert!(pack.font_pack_ids().is_empty());
    assert!(pack.font_fallback().is_empty());
    assert!(pack.default_font().is_none());
    assert!(pack.unit("item").is_none());
}

#[test]
fn unit_spec_picks_the_plural_word() {
    let unit = UnitSpec {
        one: Some("item".into()),
        other: "items".into(),
        format: None,
    };
    assert_eq!(unit.word(1.0), "item");
    assert_eq!(unit.word(2.0), "items");
    assert_eq!(unit.word(0.0), "items");
    let ja = UnitSpec {
        one: None,
        other: "点".into(),
        format: None,
    };
    assert_eq!(ja.word(1.0), "点");
}

#[test]
fn loads_a_locale_overlay_file() {
    let file = std::env::temp_dir().join(format!("shojiku-lang-load-{}.yml", std::process::id()));
    std::fs::write(&file, "id: xx-XX\n").expect("write temp locale");
    let pack = LangPack::load(&file).expect("load locale file");
    assert_eq!(pack.id, "xx-XX");
    std::fs::remove_file(&file).ok();
}

#[test]
fn missing_locale_file_is_io_error() {
    let result = LangPack::load(Path::new("/no/such/locale.yml"));
    assert!(matches!(result, Err(LangPackError::Io { .. })));
}
