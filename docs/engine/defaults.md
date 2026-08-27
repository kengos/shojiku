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
expected to know. The engine answers it for a given (template, locale)
pair: every pickable spelling per field type, where it comes from
(`builtin` / `pack` / `registry`), and **what it actually renders**,
against fixed exemplar values the engine owns. A probe previews a pattern
the document does not contain yet.

All three hosts ask the same question: the `shojiku formats` command
(`--probe <type>:<pattern>`), the `format_catalog` MCP tool
(`probes: [{ fieldType, pattern }]`), and the wasm binding the Designer's
format picker reads.

Types with no named variants at all (`number`, `percentage`, `quantity`
in v1) come back marked `fixed`, carrying only `default` — an editor shows
what they render and offers no VARIANT control, because naming a variant on
one warns and renders the plain form.

A type name is not a variant, so `fixed` does not mean "nothing may be
picked here". `format: currency` on a number is a type OVERRIDE — the value
renders as that type instead — and so is the `symbol`/`name` money pick
described above; neither warns. On a DATE or DATETIME field the override
yields to a name the locale pack or the `formats:` registry declares, so
`format: date` there is the pack's own `datetimeFormats.date` variant
rather than a re-typing. They are absent from the NUMBER row because
this catalog lists a type's variants, and those two are variants of
`currency`, where the catalog does list them.

The samples are the engine's own formatter output, so a tool that shows
them cannot drift from the page. A datetime variant that renders no time —
a date-table name resolved on a datetime slot, or a datetime pattern with
no time tokens — is marked `dropsTime`, measured the same way (the engine
renders it at two times of day and compares) rather than listed by
spelling. Capability keys: `format.catalog` for the query itself, and
`format.catalog.dropsTime` for that field — an older engine answers the
query without it, so a consumer that needs the mark gates on the second
key rather than rejecting the whole catalog.

## Limitations

- A `formats:` entry named after a FIELD TYPE — `currency`, `date` and the
  rest of the nine — is an error (`reserved_format_name`). The refusal is
  now CONSERVATIVE rather than forced: it was justified by such a name
  being a type override in dispatch, so the entry could never be reached,
  and on a date/datetime field that is no longer true — a declared name
  beats the override there, registry entries included. It stays refused
  because the name would still be unreachable on every OTHER type, and a
  registry entry that works on two types and silently re-types the value
  on the rest is worse than one that is refused outright. The
  registry is capped at 256 entries (`too_many_formats`).
- An entry that shadows a locale-pack VARIANT name is the opposite case — it is
  honoured, and wins over the pack's own variant of that name on a
  `date`/`datetime` field.
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
