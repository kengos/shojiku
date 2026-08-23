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

#[test]
fn lang_pack_errors_bound_their_echoed_path_and_parse_detail() {
    // A locale pack is untrusted input like any other document: its file
    // path comes from a host-supplied search dir and its parse failure
    // quotes pack content.
    let hostile = format!("\u{1b}[2J\u{7}{}", "l".repeat(10_000));
    let io = LangPackError::Io {
        path: shojiku_diagnostics::Echo::from(&hostile),
        source: std::io::Error::new(std::io::ErrorKind::NotFound, "nope"),
    };
    let parse = LangPackError::from(
        serde_yaml::from_str::<LangPack>(&format!("id: \"{}\"\n  bad", "y".repeat(500)))
            .unwrap_err(),
    );
    for err in [io, parse] {
        let message = err.to_string();
        assert!(
            !message.chars().any(char::is_control),
            "control character survived: {message:?}"
        );
        assert!(
            message.chars().count() < shojiku_diagnostics::MAX_ECHO + 200,
            "unbounded locale-pack error ({} chars)",
            message.chars().count()
        );
    }
}

#[test]
fn an_oversize_locale_pack_is_refused_before_the_parse() {
    // The fourth door, and the one in another crate — it reads the bound
    // from `shojiku_core` rather than carrying a second copy of the number.
    let oversize = format!(
        "id: [unterminated\n{}",
        "#".repeat(shojiku_core::MAX_INPUT_BYTES)
    );
    let err = LangPack::from_yaml_str(&oversize).expect_err("must refuse");
    // `matches!` rather than a let-else: the else arm's `panic!` is a line
    // no passing test can reach, and the 100%-lines gate counts test code
    // too. (This one happens to fit on one line today, which hides the
    // problem until rustfmt splits it.)
    assert!(
        matches!(
            err,
            LangPackError::TooLarge { bytes, limit }
                if bytes == oversize.len() && limit == shojiku_core::MAX_INPUT_BYTES
        ),
        "got: {err:?}"
    );
    // The refusal quotes none of the pack.
    assert!(!err.to_string().contains("unterminated"));
}

#[test]
fn a_locale_pack_at_the_cap_is_still_parsed() {
    let doc = "id: en\n";
    let pack = format!(
        "{doc}{}",
        "#".repeat(shojiku_core::MAX_INPUT_BYTES - doc.len())
    );
    assert_eq!(pack.len(), shojiku_core::MAX_INPUT_BYTES);
    assert_eq!(LangPack::from_yaml_str(&pack).expect("parse").id, "en");
}

#[test]
fn an_oversize_builtin_overlay_is_refused() {
    // The overlay arm of `LangPack::builtin` does NOT go through
    // `from_yaml_str`, and for a builtin id it is the arm every host takes —
    // so a cap only on the other path would guard the rarer case. Reachable
    // straight from a browser host via `set_locale(id, overlay)`.
    let overlay = format!("id: ja-JP\n{}", "#".repeat(shojiku_core::MAX_INPUT_BYTES));
    let err = LangPack::builtin("ja-JP", Some(&overlay)).expect_err("must refuse");
    assert!(
        matches!(err, LangPackError::TooLarge { .. }),
        "got: {err:?}"
    );
    // Positive control: a small overlay on the same id still merges, so the
    // refusal above is the cap and not a broken builtin lookup.
    let ok = LangPack::builtin("ja-JP", Some("currencyDefault: USD\n"))
        .expect("a small overlay merges")
        .expect("ja-JP is a builtin");
    assert_eq!(ok.currency_default.as_deref(), Some("USD"));
}

#[test]
fn an_oversize_font_pack_manifest_is_refused() {
    // The manifest wire this change also fuzzes. `from_yaml` is the public
    // door; the three other sites carry the same bound with their own error
    // types (filesystem resolution, injected packs, and the wasm session).
    let doc = "version: 1\nlicense: OFL-1.1\nfaces: []\n";
    let manifest = format!("{doc}{}", "#".repeat(shojiku_core::MAX_INPUT_BYTES));
    let err = PackManifest::from_yaml(&manifest).expect_err("must refuse");
    assert!(err.to_string().contains("input cap"), "got: {err}");
    // Positive control: at the cap it still parses, so the refusal above is
    // the bound and not a manifest the type could never accept.
    let at_cap = format!(
        "{doc}{}",
        "#".repeat(shojiku_core::MAX_INPUT_BYTES - doc.len())
    );
    assert_eq!(at_cap.len(), shojiku_core::MAX_INPUT_BYTES);
    assert_eq!(
        PackManifest::from_yaml(&at_cap).expect("parses").license,
        "OFL-1.1"
    );
}
