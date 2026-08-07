# Locale Data Policy (builtin packs + `packs/locale/` packs)

Locale chrome for one locale is **data plus minimal default-formatting
logic** — not business logic and not a general-purpose plugin. It lives
in two layers:

```text
engine/formatter/src/lang/builtin/<id>.yml   # CLDR-generated, checked in,
                                             # compiled into the engine
                                             # (ja-JP + en-US only)
packs/locale/<id>.yml                        # a shipped locale pack: the
                                             # WHOLE pack for a locale with
                                             # no builtin, a per-key overlay
                                             # for one that has it
scripts/gen-locale-builtins.py               # the codegen for BOTH (CONFIG →
                                             # builtins, PACK_CONFIG → packs;
                                             # authoring-time CLDR fetch,
                                             # never runs in CI)
```

**A new locale is a pack, not engine code.** The two builtins exist so
the engine renders ja/en with no file on disk; every other locale ships
as `packs/locale/<id>.yml` and is loaded by the host (`--locale-dir` /
`$SHOJIKU_LOCALE_DIR`, or a string a WASM host injects). Growing
`BUILTIN_LOCALE_IDS` is a deliberate exception, not the default route —
it puts locale data inside the engine binary and needs a reason.

## Responsibilities

Locale data supplies defaults for:
- locale metadata (direction, writing mode)
- date/datetime default and named format variants (the CLDR-subset
  pattern grammar: quoting, month/weekday names, 12-hour clock, the
  `G`/`GG`/`y` era set; the token inventory is **append-only** —
  [data-binding.md](../engine/data-binding.md))
- month/weekday/dayPeriod name tables
- number formatting (group/decimal separators) + the `percentFormat`
  layout
- currency display per code (symbol, CLDR displayName, the
  `symbolFormat`/`nameFormat` layouts, optional precision override) +
  `currencyDefault`; the CLDR **fractions table** (code → digits) is
  compiled in once (`lang/builtin/currency-fractions.yml`), so even
  unlisted codes keep correct precision
- semantic **unit words** (`units.item: { one?, other }` — CLDR plural
  categories, v1: one/other) + the `unitFormat` layout; definitions
  carry only the semantic KEY
- era tables (`eras` with optional `abbr` + `eraYearOne`) — bounded,
  CLDR-driven calendar data (wareki is locale chrome, **not** a plugin:
  the engine renders it data-driven, nothing locale-specific is
  hardcoded)
- font-pack references (`fonts: uses/default/fallback` — faces by id;
  the files stay in `packs/fonts/`, see
  [architecture.md](../architecture.md) Cross-cutting principles for the
  font architecture)

Example shape (an overlay carries only the keys it changes):

```yaml
id: ja-JP
direction: ltr
writingMode: horizontal-tb
currencyDefault: JPY
dateFormats:
  default: "yyyy/MM/dd(E)"
  wareki: "Gy年M月d日"
number:
  groupSeparator: ","
  decimalSeparator: "."
currency:
  JPY:
    symbol: "¥"
    name: "円"
    symbolFormat: "{symbol}{amount}"
    nameFormat: "{amount}{name}"
eras:
  - { name: 令和, abbr: R, start: "2019-05-01" }
eraYearOne: "元"
units:
  item:
    other: 点
unitFormat: "{amount}{unit}"
```

## Calendar boundary

The era model covers exactly the **year-relabeling calendars**: same
Gregorian months/days, different year naming — wareki (ja), Minguo
(zh-TW), Dangi (ko), Thai Buddhist Era (one era starting year -542,
shipped in `th-TH`). These stay
pure locale data: adding one is a generator entry, and the engine
already knows how. The Thai era did cost one function — the era-start
parser split on `-`, so a year before 1 could not be authored at all —
and that was the last of it; a BC start is now ordinary wire.
**Month/day-recomputing calendars** (Hijri, Hebrew, Persian, Ethiopic,
Chinese lunisolar) are arithmetic, not data — when demand appears they
ride `icu_calendar` (ICU4X, deny.toml-clean) behind a **Cargo feature**,
selected per format variant by a `calendar:` key on the variant's
object form. Never a plugin (calendar chrome is bounded CLDR data and
must stay deterministic); not built until an ar/he/fa locale is
actually requested.

## Rounding boundary

`format!("{:.p}")` rounds half-even. Rounding-mode policy (half-up/floor on invoice
totals) is a **business rule** — plugins/params territory, never the
formatter.

## Boundary

- Locale data is not where business/domain-specific formatting rules go
  (invoice tax formatting, country-specific address formatting). Those
  are `plugins/format-*` — see [plugins.md](plugins.md). The dividing
  line: bounded, CLDR-derivable chrome is locale data; open-ended
  business rules are plugins.
- Locale data contains no UI components and no engine layout code. It is
  consumed by `engine/formatter` and by the GUI for labels/samples.
- Formatting *patterns* stay referenced via `format:` names where
  possible, but the template's central format blocks
  (`defaults.formats` / the `formats:` registry —
  [defaults.md](../engine/defaults.md)) may carry inline patterns, and
  composed presentation text (a literal 円/個 beside a
  `{key:number}`) is legitimate template content. What must NOT happen:
  per-placement pattern strings (they live only in the central blocks)
  and locale-conditional template logic.
- The render path stays network-free: CLDR is fetched only by the
  codegen script at authoring time, and the generated YAML is checked
  in.

## Adding a new locale — checklist

1. Add the locale to **`PACK_CONFIG`** in
   `scripts/gen-locale-builtins.py` (CLDR-sourced values + curated date
   patterns/units/fonts) and rerun it; commit the generated
   `packs/locale/<id>.yml`. No engine change — that is the point.
   (Only a deliberate new BUILTIN goes in `CONFIG` instead, and then the
   id must also be appended to `BUILTIN_LOCALE_IDS` in
   `engine/formatter/src/lang/builtin.rs` — a test pins the two lists
   equal.)
2. Provide default and the named variants for date, datetime, number,
   and currency formatting.
3. Add formatted-output golden tests — a locale without them is not
   mergeable. A shipped pack's goldens live in
   `engine/formatter/tests/shipped_packs/` (they load the real
   `packs/locale/` file); the builtins' live in
   `engine/formatter/src/format/tests/`.
4. Every font the locale's `fonts:` block references must exist as a
   pack under `packs/fonts/` (the goldens assert the block is present;
   a missing pack degrades every glyph to `missing_glyph` at render).
5. If the locale is to surface in the Designer, a preset declares it
   (`examples/<bucket>/<name>/preset.yml`) — see [gui.md](gui.md); the app fetches
   the pack from the assembled `locale/` tree and passes it to
   `setLocale`.

## Mandatory lint/test gates

Locale data is consumed by the Rust `engine/formatter` crate, so it
inherits the Rust gates from [engine.md](engine.md) (`make rust`, tests,
100% workspace coverage — see [../guidelines.md](../guidelines.md)),
plus:

- Every builtin YAML parses and its `id` matches its list entry (pinned
  by the formatter's builtin tests).
- Golden tests of formatted sample values per locale (date, datetime,
  currency, quantity, percentage).
- Overlay-merge behavior is covered by the formatter's builtin tests;
  changes to the merge semantics need tests in the same change.
