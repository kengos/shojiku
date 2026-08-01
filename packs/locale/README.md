# Locale packs

Each `<id>.yml` here is a **locale pack**: the date patterns, number
separators, currency display, unit words, era tables and font references
one locale renders with. Hosts find them via `--locale-dir` /
`$SHOJIKU_LOCALE_DIR` (default `./packs/locale`); a browser/WASM host
fetches the file and passes its text to `setLocale`.

Shipped packs:

| File | Locale | Currency | Fonts |
| --- | --- | --- | --- |
| `zh-tw.yml` | 繁體中文（臺灣） | TWD | noto-sans-tc |
| `zh-cn.yml` | 简体中文（中国） | CNY | noto-sans-sc |
| `hi-in.yml` | हिन्दी（भारत） | INR | noto-sans-devanagari + noto-sans |
| `fil-ph.yml` | Filipino (Pilipinas) | PHP | noto-sans |

They are **@generated** — add or change a locale in `PACK_CONFIG` in
[`scripts/gen-locale-builtins.py`](../../scripts/gen-locale-builtins.py)
and rerun it (authoring-time CLDR fetch, pinned version; the render path
stays network-free). Goldens live in
`engine/formatter/tests/shipped_packs/`.

## Whole pack vs overlay

`ja-JP` and `en-US` are **built into the engine** as CLDR-generated data
— no file here is needed to render with `--lang ja-JP` / `--lang en-US`
(or the bare tags `ja` / `en`). Those builtin sources live in
`engine/formatter/src/lang/builtin/` and come from the same script's
`CONFIG`.

So a file here means one of two things, decided by whether the id has a
builtin:

- **No builtin** (every pack in the table above): the file is the
  **whole pack** and carries every table the locale needs. This is the
  normal route — a new locale is a pack, never engine code.
- **Has a builtin** (`ja-jp.yml` / `en-us.yml` — neither is shipped):
  the file is an **overlay**, deep-merged over the builtin per key —
  mappings merge recursively, scalars and sequences replace — so it only
  needs the keys it changes.

```yaml
# packs/locale/ja-jp.yml — override one currency symbol, add a variant.
currency:
  JPY:
    symbol: "円"
dateFormats:
  stamp: "yyyyMMdd"
```

Era formatting (和暦): the builtin ja-JP pack carries the modern era
table and `wareki` date/datetime variants (`format: wareki` →
`令和7年4月1日`). Patterns use `G` (era name) and `y` (era year, year 1
renders as `eraYearOne`, ja: `元`) alongside the Gregorian `yyyy`.

## Known gap

`hi-IN` renders `1,234,567` where CLDR groups the Indian way
(`12,34,567`): `NumberSpec` carries separators only and the engine groups
in fixed 3s. A golden pins the current behavior so the pack gets updated
when grouping becomes expressible.
