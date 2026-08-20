---
reference:
  group: root
  order: 4
  keys: [defaults, formats]
  shapes: [TemplateDefaults, FormatDefaults, FormatRef, InlineFormat, NamedFormat, NamedFormatKind]
  summary: "Document-wide presentation defaults and the named format registry — the CSS `:root` analog."
---

# Template defaults & the format registry

Document-wide presentation defaults — the CSS-`:root` analog. Elements
just bind their key; how a date/currency LOOKS is decided once here, so
changing the default changes every placement that didn't override it.

## `defaults:`

```yaml
defaults:
  locale: ja-JP                                  # selects the locale pack
  currency: JPY                                  # document currency code
  style: { fontSize: 12, fontFamily: biz-udp-gothic }
  formats:
    date: wareki                                 # variant name
    datetime: { pattern: "yyyy-MM-dd(E) HH:mm" } # inline pattern
    currency: symbol                             # ¥9,000 everywhere
```

| Key | Meaning |
| --- | --- |
| `locale` | Document locale id (BCP 47, e.g. `ja-JP`). The CLI's fallback for picking the locale pack when `--lang` is absent (`--lang` > `defaults.locale` > `ja-JP`). Drives dates, currency display, grouping separators, and units. |
| `currency` | Document currency **code** (ISO 4217, e.g. `JPY`). The middle of the currency fallback chain: the field's `currency:` → `defaults.currency` → the pack's `currencyDefault` → `JPY`. Lets currency bindings stay a bare `{key}` with no per-field code. |
| `style` | The cascade **root style**. Inherited properties ([style.md](style.md)) flow into every item; the `rem` root follows this style's computed `fontSize` (engine default 10pt when unset — see [length.md](length.md)). |
| `formats` | Per-type format defaults: `date` / `datetime` / `number` / `currency` / `percentage` / `quantity`, each a variant-name string **or** an inline `{ pattern: … }` map. Unknown type keys are parse errors. |

> `locale` and `currency` were top-level `definitions.yml` keys in
> earlier engines; they now live here, the single home for document
> presentation defaults. `definitions.yml` no longer carries them — a
> stale copy left behind is a located parse error (the definitions wire
> rejects unknown keys), so remove them when migrating.

Inline patterns use the [pattern grammar](data-binding.md) and apply to
`date`/`datetime` only — on other types validate warns
(`format_pattern_ignored`) and the default form renders.

## `formats:` — the named registry

Reusable named format definitions, parallel to `styles:`:

```yaml
formats:
  stamp: { type: date, pattern: "yyyy.MM.dd" }
```

Placements (and `defaults.formats`) reference entries by name:
`data: { key: issued_on, format: stamp }`. v1 entry kinds: `date` |
`datetime`. Field-type names (`currency`, …) are reserved
(`reserved_format_name`); the registry is capped at 256 entries
(`too_many_formats`).

## Precedence

Low → high: pack default ← `defaults.formats.<type>` ← definitions
the field's `displayFormat:` ← placement `format:`. Details and the diagnostics table:
[data-binding.md](data-binding.md).

## Round-trip

Everything here is `Option`+skip: an untouched template serializes
without `defaults`/`formats`, names stay bare strings, inline maps stay
maps.

Capability keys: `template.defaults`, `template.defaults.document`
(locale + currency), `template.formats`.

## Discovering what a type can be set to

The variant names differ per locale pack, and a document's own `formats:`
entries add to them — so the set is not something an author can be
expected to know. `shojiku formats` answers it for a given
(template, locale) pair: every pickable spelling per field type, where it
comes from (`builtin` / `pack` / `registry`), and **what it actually
renders**, against fixed exemplar values the engine owns.
`--probe <type>:<pattern>` previews a pattern the document does not
contain yet.

Types with no named variants at all (`number`, `percentage`, `quantity`
in v1) come back marked `fixed`, carrying only `default` — an editor shows
what they render and offers no control, because any other pick would only
warn.

The samples are the engine's own formatter output, so a tool that shows
them cannot drift from the page. Capability key: `format.catalog`.

## Limitations

- A `formats:` entry that shadows a builtin variant name is ignored
  (`reserved_format_name`), and the registry is capped at 256 entries
  (`too_many_formats`).
- Inline `{ pattern }` defaults apply to `date`/`datetime` only; on another
  type the default form renders (`format_pattern_ignored`).
- A variant name that exists in no pack renders the default form
  (`unknown_format_variant`).
- Defaults are PRESENTATION only. They never supply data, and a missing
  bound value is still a missing value (`missing_data`).

## See also

- [data-binding.md](data-binding.md) — formats, tokens, precedence
- [style.md](style.md) — the cascade the root style heads
- [length.md](length.md) — the rem root
