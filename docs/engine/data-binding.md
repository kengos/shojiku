---
reference:
  group: concept
  order: 2
  keys: [data-binding]
  shapes: [Binding, BindingScope, MarkBinding, EqualsValue]
  summary: "How templates bind runtime params and how the locale pack formats them for display."
---

# Data binding & formatting

Templates bind runtime data (`params.json`/`params.yml`) into items three
ways, and format values for display via the locale pack.

## The three binding forms

**`data:` binding** — a single bound value on `text`, `qr_code`,
`image`, and (as the array source) `table` / `repeat` / `repeat_flow` /
`list`:

```yaml
data: { key: order.code }              # params key, dot-separated
data: { key: amount.total, format: currency }
```

**Interpolation** — inside a static `text:` string on `text` and
`qr_code` items:

```yaml
text: "合計 {amount.total_in_tax:currency} です"
```

`{key}` inserts the value; `{key:format}` applies a format; `{{`
escapes a literal `{`. Keys are `[A-Za-z0-9_.]`, format names
`[A-Za-z0-9_-]`. Malformed expressions (unclosed braces, invalid
characters, empty key) stay as literal text — templates degrade visibly,
never fail. (`{{key}}` in this documentation names the general
interpolation mechanism.)

**Named binding declarations** — an item-local `bindings:` map giving one
`{name}` the full `data:` option set (another key, a scope, a
placeholder, a format):

```yaml
- type: text
  text: "コード: {code} / 合計 {total}"
  bindings:
    code:  { key: order.code, scope: document }
    total: { key: amount.total, format: currency, placeholder: "—" }
```

See [Named binding declarations](#named-binding-declarations) below.

## Blank-form placeholder

A binding draws a `placeholder` when its value is **absent, `null`, or
`""`**, instead of leaving the field empty and emitting `missing_data` /
`format_error`. This is the "this field is intentionally blank" signal a
fillable form needs — one template renders both a blank form and a
filled one from two params files.

```yaml
# on the placement (templates.yml):
data: { key: birth_date, format: wareki, placeholder: "　年　月　日" }
```

```yaml
# on the field (definitions.yml) — also covers {key} interpolation:
- key: birth_date
  type: date
  placeholder: "　年　月　日"
```

- **Effective placeholder**: the placement's `data.placeholder` wins;
  otherwise the field's `placeholder` from definitions. An inline
  `{key}` / `{key:format}` interpolation segment carries no placeholder
  of its own, so only the field-level one reaches it.
- **Drawn verbatim**: the placeholder text is never interpolated and
  never formatted — a `{…}` inside it stays literal, and it bypasses the
  type formatter entirely. `placeholder: ""` suppresses the diagnostic
  and draws nothing (a clean blank).
- **Blank ≠ invalid**: only an absent/`null`/`""` value triggers the
  placeholder. A value that is PRESENT but unusable (a `"abc"` date)
  still reports `format_error` — a data bug must not hide behind a
  blank-form placeholder. Whitespace (`" "`), `0`, and `false` are real
  values, not blanks.
- Applies wherever a binding resolves: text `data:`, spans, `qr_code`,
  `char_grid`, table columns (per row), and `list` entry templates (a
  blank entry field draws its field-level placeholder). Images have no
  text placeholder — an absent image key stays `missing_data`.

Capability key: `binding.placeholder`.

### Where `{…}` resolves — not always params

Several other keys reuse the `{…}` spelling with a **different scope**:

| Where | `{…}` resolves against |
| --- | --- |
| `text:` on `text` / `qr_code` | params (or the bound element inside a repeat cell/card) |
| `list.text` | the **array entry** object (`{name}` = entry field) |
| `list.overflowText` | the engine token `{count}` only |
| `page_number.format` | the engine tokens `{page}` / `{pages}` only |

Each surface knows only its own scope: a params key in
`page_number.format` (or `{page}` in a `text:`) is not resolved there.

## Scopes

Bindings resolve against **top-level params** by default. Three
constructs re-scope them to an array element:

- a **table column**'s `data.key` is relative to the row object;
- a **`repeat` cell**'s bindings resolve against the bound element;
- a **`repeat_flow` card**'s bindings likewise.

`validate` checks scoped bindings against the array group in
definitions.

### `scope:` — the escape back to the document

A value that belongs to the whole document rather than the element (a
store name on every ticket, one pickup date across a card list) takes the
explicit escape:

```yaml
- type: text
  data: { key: store_name, scope: document }   # element (default) | document
```

- `element` (the default, and what every template authored before the key
  existed means) reads the **ambient** scope: the bound element inside one
  of the three constructs, top-level params everywhere else.
- `document` reads **top-level params** even inside a construct. Outside
  one the two are identical, and `document` is deliberately **inert**
  there — a sub-template must compose the same way in and out of a
  `repeat`.

The key rides every binding carrier: `text` / `spans` / `qr_code` /
`char_grid` / `image` / a `list`'s array key / a table column's `data:`,
and a form mark's presence binding (`ellipse` / `checkbox` `data:`).
`validate` follows it — a document-scoped key is checked against the
top-level scalars (declared field, format variant, params presence)
instead of the array group, so the escape never opens an unchecked path.

**A bare `{key}` carries no scope.** The `{key:format}` grammar stays
two-part by design, so an UNDECLARED name inside a cell always reads the
ambient scope. To mix scopes on one line, declare the name — that is what
[`bindings:`](#named-binding-declarations) is for:

```yaml
- type: text
  text: "{shop} / {code}"
  bindings:
    shop: { key: store_name, scope: document }   # the document's value
  # `code` is undeclared, so it stays the element's own field
```

([`spans`](text.md) with a `data:` per fragment also works and predates
declarations, but `spans` exists for per-fragment *styling*; reach for it
when the fragments differ in appearance, not merely in scope.)

Capability key: `binding.scope` (older engines parse-reject it).

## Named binding declarations

`bindings:` is an item-local map of interpolation **name** → the same
options a `data:` binding carries. A declared `{name}` resolves through
its declaration; an **undeclared** name keeps its original meaning — the
name *is* the key, read at the ambient scope — so every template written
before this key existed is unaffected.

```yaml
- type: text
  text: "品名: {hinmei} / 合計 {total}"
  bindings:
    hinmei: { key: 品名 }                              # a key the {…} charset cannot spell
    total:  { key: amount.total, format: currency }
```

It solves two things a bare `{key}` cannot express:

- **Keys outside `[A-Za-z0-9_.]`.** `{品名}` is not a valid expression, so
  it prints its own braces on the page — silently, until the
  `interpolation_key_charset` warning. A declaration gives the key an
  ASCII name to be referenced by.
- **Options on an interpolated value**: `scope:` (the escape out of a
  cell), `placeholder:`, `format:`.

Rules:

- **Which items carry it**: `text` (its `spans` included), `qr_code`,
  `char_grid`, `list` (its per-entry `text`), and `image` (its `link.url`
  only). A span has no map of its own — it resolves through the map of
  the item that owns it. The map also covers each item's `link.url`.
- **A declared name and `data.key` are separate namespaces.** A `data:`
  binding already carries every option and never consults the map.
- **An inline `:format` wins** over the declaration's `format`
  (most-specific, like the style cascade). Everything else — the key, the
  scope, the placeholder — comes from the declaration.
- **A `list`'s declarations resolve per ENTRY** like the entry template
  itself, unless one authors `scope: document`.
- Bounded by 256 declarations per item (`too_many_bindings`, advisory —
  every declaration keeps working).

Diagnostics: `unused_binding` (declared, referenced by nothing),
`binding_shadows_key` (the name already resolved and the declaration
redirects it — attaching options to the *same* key is silent),
`invalid_binding_name` (a name outside the reference charset, so nothing
could ever reference it). A declaration whose `key:` does not exist rides
the usual `unknown_data_key`, reported at the declaration.

Capability key: `binding.declarations` (older engines parse-reject it).

## Params

Runtime data owned by the calling application, close to ISO-normalized
values: ISO/RFC 3339 datetimes, `yyyy-mm-dd` dates, plain numbers —
display formatting is the engine's job. Params never supply geometry:
all `x`/`y`/`w`/`h` are template-owned.

## Formats

The `format` variant (or `{key:format}`) selects how a value renders:

- **A field type name** overrides the type entirely: `string`, `number`,
  `currency`, `datetime`, `date`, `quantity`, `percentage`. Type names
  are reserved — a `formats:` registry entry cannot use one.
- **A named variant**: a template `formats:` registry name, a lang-pack
  pattern name (`ja`, `long`, `wareki`), or a currency variant
  (`default` / `symbol` / `name`). Lookup order: registry → pack.
  An unknown variant renders the default form and warns
  (`unknown_format_variant`).
- **`symbol`/`name` on a plain number** promote the value to the
  currency type with that variant (the code rides the
  `defaults.currency` chain), so a money display needs no definitions
  type — the picks work on an untyped params number. This coercion wins
  over a registry entry that happens to be named `symbol`/`name`
  (registry patterns are date patterns and never applied to numbers).
  Capability key: `format.currency.coerce`; older engines warn
  `unknown_format_variant` and render the bare number.
- **`value` on a field with enum display labels** renders the machine
  value instead of the declared label
  ([definitions.md](definitions.md) § Enum display labels). The label
  is the default the moment the field declares one — on every carrier,
  a QR code's encoded content included (a QR has always encoded the
  FORMATTED value). On a field with no labels a `format` pick stays
  inert, as it always has (plain text has no variants of its own);
  on a labeled field an unknown pick warns `unknown_format_variant`
  and renders the label.

### Precedence (the effective format)

Low → high; the highest layer that picks wins:

1. the locale pack's `default` pattern,
2. the template's `defaults.formats.<type>` ([defaults.md](defaults.md)),
3. the field's `displayFormat:` in definitions (per-field default),
4. the placement's `format:` / `{key:format}`.

Patterns themselves may be authored ONLY in the central places — the
template's `defaults`/`formats:` registry and locale packs; placements
and definitions always reference by name (the guard against per-item
format sprawl).

Per type (locale data = the builtin pack for the locale, with an
optional `packs/locale/<id>.yml` per-key overlay — see
[fonts.md](fonts.md)):

| Type | Rendering |
| --- | --- |
| `string` | as-is; a declared enum label replaces the value it labels (`format: value` escapes back) |
| `number` | grouped digits (locale separators); no explicit precision trims trailing zeros (max 2 decimals). A `symbol`/`name` pick promotes the value to `currency` with that variant |
| `currency` | three named variants: `default` = the bare grouped amount (composes with literals), `symbol` = `¥9,000`, `name` = `9,000円`. Precision: the field's `precision:` → the pack's per-code override → the CLDR fractions table (an unlisted code keeps its digits). Code chain: the field's `currency:` → the template `defaults.currency` → pack `currencyDefault` |
| `datetime` | CLDR-subset pattern tokens (below); default `yyyy-MM-dd HH:mm` |
| `date` | same tokens; default `yyyy-MM-dd` |
| `quantity` | number + the unit word for the field's semantic `unit:` key (`item` when unset), plural-aware via the pack (`1 item` / `3 items`); layout from the pack's `unitFormat`. Unknown keys render verbatim + `unknown_unit` |
| `percentage` | value × 100 through the locale separators + the pack's `percentFormat` layout |

There are no business-document formats beyond these — e.g. no dedicated
Japanese qualified-invoice helpers such as per-tax-rate
subtotal rows or registration-number fields. Compose them from the
primitives (a `table` + `currency`/`percentage` fields, plain `text` for
the registration number); business/region-specific formatters are
future `plugins/` territory, never engine features
([agents/plugins.md](../agents/plugins.md)).

A fixed summary block (the subtotal/tax/total rows every invoice needs)
is NOT a table: `table.data` binds an **array** property, while totals
are scalar object fields — and the engine does no arithmetic, so the
computed values arrive pre-summed in params. The idiom is a `container`
of interpolated text lines (the amounts pick a currency variant
in-place):

```yaml
- type: container
  box: { w: 240, h: 60 }              # or a right-aligned flow child
  items:
    - type: text
      box: { x: 0, y: 0, w: "100%", h: 14 }
      text: "小計 {totals.subtotal:symbol}"
      style: { textAlign: right }
    - type: text
      box: { x: 0, y: 15, w: "100%", h: 14 }
      text: "消費税(10%) {totals.tax:symbol}"
      style: { textAlign: right }
    - type: text
      box: { x: 0, y: 32, w: "100%", h: 18 }
      text: "合計(税込) {totals.total:symbol}"
      style: { textAlign: right, fontWeight: bold, fontSize: 13 }
```

(Label + value as separate columns instead: make each line a
`direction: row` child with `justifyContent: space_between` —
[flex.md](flex.md).)

### Pattern tokens (append-only inventory)

`yyyy y MMMM MMM MM M dd d EEEE E HH H hh h mm ss a GG G` — a CLDR
subset. `MMM`/`MMMM` = month names, `EEEE` = full weekday, `h`/`hh` +
`a` = the 12-hour clock with the pack's `dayPeriods`, `G`/`GG`/`y` =
the era set (below). Text between `'` quotes is literal (`'at'`), `''`
is a literal apostrophe; unquoted non-token characters pass through, so
Japanese pattern text needs no quoting. **The inventory is append-only**:
existing tokens never change meaning, new ones only extend it.

### Era formatting (wareki)

`G` renders the era name, `GG` its abbreviation (令和 → `R`, falling
back to the name), and `y` the era year, from the locale's `eras` table
(builtin ja-JP: Meiji through Reiwa). The builtin ja-JP pack ships `wareki`
variants (`令和7年4月1日`) and a `wareki-compact` variant (`R7.4.1`).
Year 1 renders as the pack's `eraYearOne` (ja: `元` → `令和元年`); a
date before every era falls back — `G`/`GG` to empty, `y` to the
Gregorian year. `yyyy` stays the Gregorian year in any pattern.

Without definitions, the type is inferred from the JSON value (RFC 3339
strings become datetimes, `yyyy-mm-dd` strings dates, numbers numbers).

## Definitions (`definitions.yml`)

The data dictionary for the Designer/AI/validation — **not required at
render time**. An OpenAPI-style schema isomorphic to the params JSON
(see [definitions.md](definitions.md)): nested `properties` with
JSON-Schema `type`s, `format` as the data-semantic hint, `title`,
`example`, `displayFormat` (the field's default variant),
`displayFormats` (declared variants for the GUI picker), `currency`,
`precision`, `unit` (a **semantic key** like `item` — display words live
in the locale pack, so adding a locale never edits definitions),
labeled `enum` members (`{ value, label }` — the CALLER's display words,
which are business vocabulary and so live here, not in a locale pack); a
`type: array` property marks a repeating source (tables, repeats).
`validate` cross-checks every template binding against it — unknown
keys, undeclared display variants, missing data — and, when params are
supplied, the params tree against the schema (`required`, types,
ranges, `enum`).

## Limitations

- A `{…}` key outside `[A-Za-z0-9_.]` prints its own braces
  (`interpolation_key_charset`); a `bindings:` declaration is how such a key
  is reached.
- A `bindings:` name outside the reference charset can never be referenced
  (`invalid_binding_name`), and the per-item registry is capped at 256
  (`too_many_bindings`).
- An inline `format: { pattern }` applies to `date`/`datetime` only;
  elsewhere the default form renders (`format_pattern_ignored`).
- A currency with no display data falls back to the code itself
  (`unknown_currency`), and a unit key missing from the pack renders verbatim
  (`unknown_unit`).
- Binding does no arithmetic. Totals, tax and rounding are computed by the
  host and bound as values — there is no expression syntax.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `unknown_data_key` | binding key not in definitions (validate) |
| `unknown_format` | display variant not declared for the field (validate; registry names and the currency variants always pass) |
| `missing_data` | params has no value for a bound key (validate + layout); suppressed when a `placeholder` covers the binding |
| `not_an_array` | a table/repeat/list source key is not an array |
| `format_error` | value cannot render as the requested type (e.g. not a number); a `placeholder` suppresses it for a blank value but NOT for a present-but-invalid one |
| `unknown_format_variant` | a picked variant exists nowhere; the default form rendered (layout, deduped) |
| `unknown_currency` | a code without display data used the code itself as symbol/name (precision stayed correct) |
| `unknown_unit` | a semantic unit key missing from the pack rendered verbatim |
| `format_pattern_ignored` | an inline pattern on a non-dated type; the default form rendered |
| `interpolation_key_charset` | a `{…}` that looks like an intended key but uses characters outside `[A-Za-z0-9_.]`, so it prints its braces; declare a name for it |
| `unused_binding` | a `bindings:` declaration no string in the item references |
| `binding_shadows_key` | a declared name that also resolved at the ambient scope, redirected by the declaration (which wins) |
| `invalid_binding_name` | a declaration name outside the reference charset, so `{name}` could never reach it |
| `too_many_bindings` | more than 256 declarations on one item (advisory; all of them still work) |

Capability keys: `format.wareki`, `format.patterns.cldr`,
`format.currency.variants`, `format.units.semantic`,
`binding.placeholder`, `binding.declarations`.

## See also

- [text.md](text.md) / [qr_code.md](qr_code.md) — interpolation users
- [table.md](table.md) / [repeat.md](repeat.md) / [repeat_flow.md](repeat_flow.md) / [list.md](list.md) — array scopes
