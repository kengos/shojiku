#!/usr/bin/env python3
"""Regenerate the locale packs from CLDR (authoring-time only).

Fetches the bounded locale chrome tables — number separators, currency
symbols/names/fractions, month/weekday/dayPeriod names, Japanese era
names + start dates — from the pinned cldr-json release and emits two
sets of files in the same format:

- `engine/formatter/src/lang/builtin/<id>.yml` (CONFIG) — the BUILTIN
  packs, compiled into the engine via `include_str!` and usable with no
  file on disk, plus the shared `currency-fractions.yml` (the CLDR
  currencyData fractions table).
- `packs/locale/<id>.yml` (PACK_CONFIG) — shipped locale packs the
  hosts load from disk (`--locale-dir` / `$SHOJIKU_LOCALE_DIR`) or a
  host injects as a string. A locale with no builtin has no merge base,
  so its file is a WHOLE pack — same emitter, same shape.

New locales are packs, not engine code (the locale-data boundary):
adding one is a PACK_CONFIG entry plus its font packs, never a change
under `engine/`.

CI never runs this script and the render path stays network-free.

Values CLDR does not own (date pattern variants in the engine's
CLDR-subset token grammar, semantic units, the fonts block, deliberate
symbol/name overrides) live in the curated CONFIG/PACK_CONFIG below, so
this script is the single source of truth for a locale pack.

Usage: python3 scripts/gen-locale-builtins.py
"""

import json
import urllib.request
from pathlib import Path

CLDR_VERSION = "48.2.0"
BASE = (
    "https://raw.githubusercontent.com/unicode-org/cldr-json/"
    f"{CLDR_VERSION}/cldr-json/"
)
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "engine/formatter/src/lang/builtin"
PACK_OUT_DIR = ROOT / "packs/locale"

# Modern Japanese eras: CLDR japanese-calendar era indices (Meiji onward),
# with curated romaji abbreviations for the compact `GG` token (R7.4.1).
JAPANESE_MODERN_ERAS = ["232", "233", "234", "235", "236"]
JAPANESE_ERA_ABBRS = {"明治": "M", "大正": "T", "昭和": "S", "平成": "H", "令和": "R"}

# Every pack embeds the same currency set — the locale roadmap targets'
# currencies + EUR. One list for builtins and shipped packs alike, so a
# document can name any of these codes whatever locale it renders under
# (INR rides the set because India is a roadmap target, not because a
# locale here defaults to it).
CURRENCIES = [
    "JPY", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "PHP", "VND", "IDR",
    "MYR", "XOF", "PLN", "HUF", "TRY", "BRL", "MXN", "KES", "TWD", "CNY",
    "THB", "SAR", "AED", "JOD", "INR",
]

CONFIG = {
    "ja-JP": {
        "cldr": "ja",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "JPY",
        # CLDR ja uses full-width ￥ (U+FFE5); receipts and the engine's
        # goldens use the half-width sign, so pin it explicitly.
        "currencySymbolOverrides": {"JPY": "¥"},
        # Receipt-form suffixes beat the CLDR display names (日本円/米ドル).
        "currencyNameOverrides": {"JPY": "円"},
        "weekdayWidth": "abbreviated",
        "dateFormats": {
            "default": "yyyy/MM/dd(E)",
            "long": "yyyy年M月d日(E)",
            "compact": "yyyy/MM/dd",
            "wareki": "Gy年M月d日",
            "wareki-compact": "GGy.M.d",
        },
        "datetimeFormats": {
            "default": "yyyy/MM/dd(E) HH:mm",
            "long": "yyyy年M月d日(E) HH:mm",
            "ja": "yyyy年M月d日(E) HH:mm",
            "date": "yyyy年M月d日(E)",
            "wareki": "Gy年M月d日 HH:mm",
        },
        "eras": "japanese",
        "eraYearOne": "元",
        "units": {"item": {"other": "点"}},
        "unitFormat": "{amount}{unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount}{name}",
        "fontsComment": (
            "# Font packs this locale loads (packs/fonts/<pack>/): biz-ud =\n"
            "# BIZ UD gothic (OFL), ipamj-mincho = IPAmj明朝 (IPA License)\n"
            "# for the rare-name tail, noto-sans-mono = code/monospace (OFL).\n"
            "# References only — the files stay in packs/fonts/."
        ),
        "fonts": {
            "uses": ["biz-ud", "ipamj-mincho", "noto-sans-mono"],
            "default": "biz-udp-gothic",
            "fallback": ["ipamj-mincho"],
        },
    },
    "en-US": {
        "cldr": "en",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "USD",
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        # Real CLDR skeleton shapes (the pre-v2 grammar forced the
        # dumbed-down numeric forms).
        "dateFormats": {
            "default": "MMM d, y",
            "long": "EEEE, MMMM d, y",
            "compact": "MM/dd/yyyy",
        },
        "datetimeFormats": {
            "default": "MMM d, y, h:mm a",
            "long": "EEEE, MMMM d, y, h:mm a",
            "date": "MMM d, y",
        },
        "eras": None,
        "eraYearOne": None,
        "units": {"item": {"one": "item", "other": "items"}},
        "unitFormat": "{amount} {unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Noto Sans (OFL): a real Latin family with a real italic. No\n"
            "# CJK fallback on purpose — it would eagerly load the ~47MB\n"
            "# IPAmj明朝 for Latin receipts."
        ),
        "fonts": {
            "uses": ["noto-sans", "noto-sans-mono"],
            "default": "noto-sans",
        },
    },
}


# Shipped locale packs (packs/locale/<id>.yml). No builtin backs these,
# so each emitted file is a WHOLE pack. Date patterns are the real CLDR
# skeleton shapes for the locale, transcribed into the engine's
# CLDR-subset token grammar (which has no `B` flexible-day-period token,
# so the CJK `Bh:mm` clock becomes the 24-hour `HH:mm` both markets use).
PACK_CONFIG = {
    "zh-TW": {
        "cldr": "zh-Hant",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "TWD",
        # CLDR is authoritative: in a Taiwanese document `$` IS the local
        # dollar (TWD), exactly as `$` is USD in an American one.
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        "dateFormats": {
            "default": "y年M月d日",
            "long": "y年M月d日 EEEE",
            "compact": "y/M/d",
        },
        "datetimeFormats": {
            "default": "y年M月d日 HH:mm",
            "long": "y年M月d日 EEEE HH:mm",
            "date": "y年M月d日",
        },
        "eras": None,
        "eraYearOne": None,
        # 項 = the generic "item" counter on a Traditional Chinese receipt.
        "units": {"item": {"other": "項"}},
        "unitFormat": "{amount}{unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Noto Sans TC (OFL): Traditional Chinese, and its own Latin\n"
            "# coverage — no Latin fallback needed. noto-sans-mono = code face."
        ),
        "fonts": {
            "uses": ["noto-sans-tc", "noto-sans-mono"],
            "default": "noto-sans-tc",
        },
    },
    "zh-CN": {
        "cldr": "zh-Hans",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "CNY",
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        "dateFormats": {
            "default": "y年M月d日",
            "long": "y年M月d日EEEE",
            "compact": "y/M/d",
        },
        "datetimeFormats": {
            "default": "y年M月d日 HH:mm",
            "long": "y年M月d日EEEE HH:mm",
            "date": "y年M月d日",
        },
        "eras": None,
        "eraYearOne": None,
        "units": {"item": {"other": "项"}},
        "unitFormat": "{amount}{unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Noto Sans SC (OFL): Simplified Chinese, and its own Latin\n"
            "# coverage — no Latin fallback needed. noto-sans-mono = code face."
        ),
        "fonts": {
            "uses": ["noto-sans-sc", "noto-sans-mono"],
            "default": "noto-sans-sc",
        },
    },
    "hi-IN": {
        "cldr": "hi",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "INR",
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        # `compact` deviates from CLDR's `d/M/yy`: the engine's token
        # inventory has no two-digit year, so `yy` matches `y` twice and
        # renders the year doubled. Spelled `y`, it prints the full year.
        "dateFormats": {
            "default": "d MMM y",
            "long": "EEEE, d MMMM y",
            "compact": "d/M/y",
        },
        "datetimeFormats": {
            "default": "d MMM y, h:mm a",
            "long": "EEEE, d MMMM y, h:mm a",
            "date": "d MMM y",
        },
        "eras": None,
        "eraYearOne": None,
        "units": {"item": {"other": "आइटम"}},
        "unitFormat": "{amount} {unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Noto Sans Devanagari (OFL) for Devanagari; noto-sans (OFL)\n"
            "# is the Latin fallback (the Devanagari face is script-only),\n"
            "# noto-sans-mono = code face."
        ),
        "fonts": {
            "uses": ["noto-sans-devanagari", "noto-sans", "noto-sans-mono"],
            "default": "noto-sans-devanagari",
            "fallback": ["noto-sans"],
        },
    },
    "fil-PH": {
        "cldr": "fil",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "PHP",
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        # `compact` deviates from CLDR's `M/d/yy` for the reason given on
        # the hi-IN entry above: there is no two-digit-year token.
        "dateFormats": {
            "default": "MMM d, y",
            "long": "EEEE, MMMM d, y",
            "compact": "M/d/y",
        },
        "datetimeFormats": {
            "default": "MMM d, y, h:mm a",
            "long": "EEEE, MMMM d, y, h:mm a",
            "date": "MMM d, y",
        },
        "eras": None,
        "eraYearOne": None,
        # Filipino marks plural with `mga`, which is dropped after a
        # numeral — so the counted form does not inflect.
        # DECIDED: fil-PH keeps the English "item" while every other pack
        # carries a native word (点 / 項 / 项 / आइटम). Philippine business
        # documents are routinely Taglish, so "2 item" is idiomatic there
        # rather than an untranslated leftover — the fil-PH receipt example
        # surfaced it and this was confirmed, not overlooked.
        "units": {"item": {"other": "item"}},
        "unitFormat": "{amount} {unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Filipino is Latin-script: noto-sans (OFL) covers it, so this\n"
            "# pack adds no font of its own. noto-sans-mono = code face."
        ),
        "fonts": {
            "uses": ["noto-sans", "noto-sans-mono"],
            "default": "noto-sans",
        },
    },
    "th-TH": {
        "cldr": "th",
        "direction": "ltr",
        "writingMode": "horizontal-tb",
        "currencyDefault": "THB",
        "currencySymbolOverrides": {},
        "currencyNameOverrides": {},
        "weekdayWidth": "abbreviated",
        # Thailand dates in the BUDDHIST era, and CLDR agrees: `th` declares
        # the buddhist calendar as its default. So the patterns below are
        # CLDR's own th buddhist ones and `y` renders the era year (2026 ->
        # 2569) through the `eras` table; `gregorian` is the escape hatch,
        # spelled with `yyyy`, which is always the Gregorian year.
        #
        # CLDR writes its full pattern with `G`. Here it is `GG`: this
        # engine's tokens are `G` = era NAME and `GG` = abbreviation, the
        # inverse of CLDR's width convention, and a Thai document prints
        # the abbreviation.
        # `compact` spells the year `y`, not CLDR's `yy` — see the hi-IN
        # entry above; here `y` is the full Buddhist year.
        "dateFormats": {
            "default": "d MMM y",
            "long": "EEEEที่ d MMMM GG y",
            "compact": "d/M/y",
            "gregorian": "d MMM yyyy",
        },
        "datetimeFormats": {
            "default": "d MMM y HH:mm",
            "long": "EEEEที่ d MMMM GG y HH:mm",
            "date": "d MMM y",
            "gregorian": "d MMM yyyy HH:mm",
        },
        "eras": "buddhist",
        "eraYearOne": None,
        # รายการ = the generic "item" counter on a Thai receipt.
        "units": {"item": {"other": "รายการ"}},
        "unitFormat": "{amount} {unit}",
        "percentFormat": "{amount}%",
        "nameFormat": "{amount} {name}",
        "fontsComment": (
            "# Noto Sans Thai (OFL) for Thai; noto-sans (OFL) is the Latin\n"
            "# fallback (the Thai face is script-only), noto-sans-mono =\n"
            "# code face."
        ),
        "fonts": {
            "uses": ["noto-sans-thai", "noto-sans", "noto-sans-mono"],
            "default": "noto-sans-thai",
            "fallback": ["noto-sans"],
        },
    },
}


def fetch(path):
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return json.load(r)


def quote(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def symbol_format(standard_pattern):
    """Derive the `symbol` variant layout from the CLDR currency pattern
    (`¤#,##0.00` → symbol-first; `#,##0.00 ¤` → amount-first)."""
    positive = standard_pattern.split(";")[0]
    if positive.startswith("¤"):
        sep = " " if positive[1:2] == " " else ""
        return "{symbol}" + sep + "{amount}"
    sep = " " if positive[-2:-1] == " " else ""
    return "{amount}" + sep + "{symbol}"


def group_sizes(decimal_pattern):
    """`(primary, secondary)` digit-group sizes from a CLDR number pattern.

    `#,##0.###` → (3, 3) — uniform, every locale's default. `#,##,##0.###`
    (Indian) → (3, 2): the rightmost group is 3 digits, the repeating groups
    left of it are 2, which is what produces lakh/crore positions. The
    leading skeleton group (`#`, or `¤#` on a currency pattern) is the
    open-ended one and never a size.
    """
    integer_part = decimal_pattern.split(";")[0].split(".")[0]
    groups = integer_part.split(",")
    if len(groups) < 2:
        return (3, 3)  # ungrouped pattern: keep the engine default
    primary = len(groups[-1])
    secondary = len(groups[-2]) if len(groups) >= 3 else primary
    return (primary, secondary)


def currency_name(code, cur, overrides):
    if code in overrides:
        return overrides[code]
    return cur.get("displayName-count-other", cur.get("displayName", code))


def emit(locale_id, cfg, cldr):
    c = cfg["cldr"]
    numbers = cldr[f"numbers/{c}"]["main"][c]["numbers"]
    symbols = numbers["symbols-numberSystem-latn"]
    std_pattern = numbers["currencyFormats-numberSystem-latn"]["standard"]
    currencies = cldr[f"currencies/{c}"]["main"][c]["numbers"]["currencies"]
    greg = cldr[f"gregorian/{c}"]["main"][c]["dates"]["calendars"]["gregorian"]
    days_abbr = greg["days"]["format"][cfg["weekdayWidth"]]
    days_wide = greg["days"]["format"]["wide"]
    months_abbr = greg["months"]["format"]["abbreviated"]
    months_wide = greg["months"]["format"]["wide"]
    periods = greg["dayPeriods"]["format"]["abbreviated"]

    day_keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    lines = [
        f"# @generated by scripts/gen-locale-builtins.py (CLDR {CLDR_VERSION})",
        "# Do not edit by hand; rerun the script to regenerate.",
        f"id: {locale_id}",
        f"direction: {cfg['direction']}",
        f"writingMode: {cfg['writingMode']}",
        f"currencyDefault: {cfg['currencyDefault']}",
        "",
        "dateFormats:",
    ]
    for k, v in cfg["dateFormats"].items():
        lines.append(f"  {k}: {quote(v)}")
    lines.append("")
    lines.append("datetimeFormats:")
    for k, v in cfg["datetimeFormats"].items():
        lines.append(f"  {k}: {quote(v)}")
    lines.append("")
    lines.append(
        f"weekdaysShort: [{', '.join(quote(days_abbr[k]) for k in day_keys)}]"
    )
    lines.append(
        f"weekdaysLong: [{', '.join(quote(days_wide[k]) for k in day_keys)}]"
    )
    month_keys = [str(i) for i in range(1, 13)]
    lines.append(
        f"monthsShort: [{', '.join(quote(months_abbr[k]) for k in month_keys)}]"
    )
    lines.append(
        f"monthsLong: [{', '.join(quote(months_wide[k]) for k in month_keys)}]"
    )
    lines.append(f"dayPeriods: [{quote(periods['am'])}, {quote(periods['pm'])}]")
    lines.append("")
    lines.append("number:")
    lines.append(f"  groupSeparator: {quote(symbols['group'])}")
    lines.append(f"  decimalSeparator: {quote(symbols['decimal'])}")
    # Group sizes ride the DECIMAL pattern (the engine applies one grouping
    # to every numeric type). Emitted only when the locale is not the plain
    # uniform-3 case, and then both sizes together so the rule reads whole.
    primary, secondary = group_sizes(
        numbers["decimalFormats-numberSystem-latn"]["standard"]
    )
    if primary != 3 or secondary != primary:
        lines.append(f"  groupSize: {primary}")
    if secondary != primary:
        lines.append(f"  secondaryGroupSize: {secondary}")
    lines.append("")
    lines.append("currency:")
    sym_fmt = symbol_format(std_pattern)
    for code in CURRENCIES:
        cur = currencies[code]
        # CLDR omits `symbol` when it equals the ISO code (e.g. XOF).
        symbol = cfg["currencySymbolOverrides"].get(code) or cur.get(
            "symbol-alt-narrow", cur.get("symbol", code)
        )
        if symbol == code:
            # A letter-only symbol glued to digits is unreadable
            # (JOD5.000); keep the space in the data like the engine's
            # unknown-code fallback does.
            symbol = code + " "
        name = currency_name(code, cur, cfg["currencyNameOverrides"])
        lines.append(f"  {code}:")
        lines.append(f"    symbol: {quote(symbol)}")
        lines.append(f"    name: {quote(name)}")
        lines.append(f"    symbolFormat: {quote(sym_fmt)}")
        lines.append(f"    nameFormat: {quote(cfg['nameFormat'])}")
    if cfg["eras"] == "japanese":
        era_names = cldr["ja-eras"]["main"]["ja"]["dates"]["calendars"]["japanese"][
            "eras"
        ]["eraAbbr"]
        era_starts = cldr["supplemental-calendar"]["supplemental"]["calendarData"][
            "japanese"
        ]["eras"]
        lines.append("")
        lines.append("# Modern eras (Meiji onward), CLDR japanese calendar data;")
        lines.append("# abbr = curated romaji initials for the compact GG token.")
        lines.append("eras:")
        for idx in JAPANESE_MODERN_ERAS:
            name = era_names[idx]
            abbr = JAPANESE_ERA_ABBRS[name]
            lines.append(
                f"  - {{ name: {quote(name)}, abbr: {quote(abbr)},"
                f" start: {quote(era_starts[idx]['_start'])} }}"
            )
        lines.append(f"eraYearOne: {quote(cfg['eraYearOne'])}")
    elif cfg["eras"] == "buddhist":
        eras = cldr[f"buddhist/{cfg['cldr']}"]["main"][cfg["cldr"]]["dates"][
            "calendars"
        ]["buddhist"]["eras"]
        start = cldr["supplemental-calendar"]["supplemental"]["calendarData"][
            "buddhist"
        ]["eras"]["0"]["_start"]
        lines.append("")
        lines.append("# The Buddhist era, CLDR buddhist calendar data. One")
        lines.append("# open-ended era beginning before year 1, so `y` is the")
        lines.append("# Buddhist year for every date a document can carry and")
        lines.append("# `yyyy` stays the Gregorian one.")
        lines.append("eras:")
        lines.append(
            f"  - {{ name: {quote(eras['eraNames']['0'])},"
            f" abbr: {quote(eras['eraAbbr']['0'])},"
            f" start: {quote(start)} }}"
        )
    lines.append("")
    lines.append("units:")
    for k, spec in cfg["units"].items():
        lines.append(f"  {k}:")
        for field in ["one", "other"]:
            if field in spec:
                lines.append(f"    {field}: {quote(spec[field])}")
    lines.append(f"unitFormat: {quote(cfg['unitFormat'])}")
    lines.append(f"percentFormat: {quote(cfg['percentFormat'])}")
    lines.append("")
    lines.append(cfg["fontsComment"])
    lines.append("fonts:")
    fonts = cfg["fonts"]
    lines.append(f"  uses: [{', '.join(fonts['uses'])}]")
    lines.append(f"  default: {fonts['default']}")
    if "fallback" in fonts:
        lines.append(f"  fallback: [{', '.join(fonts['fallback'])}]")
    return "\n".join(lines) + "\n"


def emit_fractions(cldr):
    """The full CLDR currencyData fractions table (code → digits). Codes
    absent here use the engine's built-in default of 2."""
    fractions = cldr["supplemental-currency"]["supplemental"]["currencyData"][
        "fractions"
    ]
    lines = [
        f"# @generated by scripts/gen-locale-builtins.py (CLDR {CLDR_VERSION})",
        "# CLDR currencyData fractions: ISO code -> decimal digits.",
        "# Codes not listed use 2 (the CLDR DEFAULT).",
    ]
    for code in sorted(fractions):
        if code == "DEFAULT":
            continue
        lines.append(f"{code}: {int(fractions[code]['_digits'])}")
    return "\n".join(lines) + "\n"


def main():
    cldr = {"supplemental-currency": fetch("cldr-core/supplemental/currencyData.json")}
    cldr["supplemental-calendar"] = fetch("cldr-core/supplemental/calendarData.json")
    cldr["ja-eras"] = fetch("cldr-cal-japanese-full/main/ja/ca-japanese.json")
    for cfg in list(CONFIG.values()) + list(PACK_CONFIG.values()):
        c = cfg["cldr"]
        cldr.setdefault(f"numbers/{c}", fetch(f"cldr-numbers-full/main/{c}/numbers.json"))
        cldr.setdefault(
            f"currencies/{c}", fetch(f"cldr-numbers-full/main/{c}/currencies.json")
        )
        cldr.setdefault(
            f"gregorian/{c}", fetch(f"cldr-dates-full/main/{c}/ca-gregorian.json")
        )
        # Month/weekday names are shared with the Gregorian data above; only
        # the era table comes from the buddhist calendar.
        if cfg["eras"] == "buddhist":
            cldr.setdefault(
                f"buddhist/{c}",
                fetch(f"cldr-cal-buddhist-full/main/{c}/ca-buddhist.json"),
            )
    for out_dir, config in ((OUT_DIR, CONFIG), (PACK_OUT_DIR, PACK_CONFIG)):
        out_dir.mkdir(parents=True, exist_ok=True)
        for locale_id, cfg in config.items():
            out = out_dir / f"{locale_id.lower()}.yml"
            out.write_text(emit(locale_id, cfg, cldr), encoding="utf-8")
            print(f"wrote {out}")
    fr = OUT_DIR / "currency-fractions.yml"
    fr.write_text(emit_fractions(cldr), encoding="utf-8")
    print(f"wrote {fr}")


if __name__ == "__main__":
    main()
