---
reference:
  group: definitions
  order: 1
  keys: [root, "property#types-and-format"]
  shapes: [Definitions, Schema, SchemaType, EnumEntry, LabeledEnumValue, FormatVariant]
  summary: "The data dictionary: the engineer-to-author seam that enriches validation and formatting."
---

# `definitions.yml` — the data dictionary

Definitions describe the data a template binds: the engineer↔author
seam. They are **not required at render time** — they enrich `validate`
(do bound keys exist? do the params match the declared shapes? is this
display variant declared?) and tell the formatter a field's type without
guessing from the JSON value.

The wire is an **OpenAPI-style schema isomorphic to the params JSON**:
the same nesting, so an AI can derive it directly from a DB schema or an
existing OpenAPI spec — and the Designer can generate sample params from
it. The engine advertises this shape as the `definitions.schema`
capability key.

## Syntax

```yaml
version: "0.2.0"          # optional
type: object              # required — the root is always an object
required: [receipt]       # optional: required top-level keys
properties:
  receipt:                # a top-level OBJECT property = a field group
    type: object
    title: 領収書          # optional display name (Designer palette)
    description: …        # optional
    required: [number]    # required child keys
    properties:
      number:
        type: string
        title: 領収書番号
        minLength: 1      # string constraints: length in CHARACTERS
        maxLength: 20
        example: R-2026-0707-001   # Designer/AI sample value
      issued_at:
        type: string
        format: date-time # data-semantic hint (see `format` below)
        displayFormat: ja # optional field-default DISPLAY variant
        displayFormats:   # optional declared variants (GUI picker)
          - id: default
            label: 標準
          - id: ja
            label: 日本語表記
        placeholder: "　" # optional; drawn when a binding to this field
                          # resolves to a blank value (absent/null/"") —
                          # see data-binding.md § Blank-form placeholder
      status:
        type: string
        enum:                      # declared value set; a member is a
          - draft                  #   bare value, or a { value, label }
          - { value: sent, label: 送付済み }  # pair — the label is what a
                                   #   text placement PRINTS for the value
  amount:
    type: object
    properties:
      total_in_tax:
        type: number
        format: currency  # semantic types are `type` + `format` pairs
        currency: JPY     # optional per-field currency code
        precision: 0      # optional decimal places
        minimum: 0        # numeric range constraints
        recommendedStyle: { textAlign: right }   # optional, GUI hint
  items:                  # a `type: array` property = a table/repeat/
    type: array           # repeat_flow/list data source
    title: 明細
    minItems: 1           # optional row-count constraints
    items:
      type: object
      title: 明細行        # row display name
      required: [name]
      properties:
        name:
          type: string
        quantity:
          type: integer
          format: quantity
          unit: item      # SEMANTIC unit key; display words live in the
                          # locale pack (adding a locale never edits this)
```

NOTE: the document `locale` and `currency` are NOT here — they live in
the template's `defaults:` block (see [defaults.md](defaults.md)).
definitions.yml is the engineer↔author schema seam; presentation
defaults belong with the other presentation defaults.

## Types and `format`

The base `type` vocabulary is JSON Schema's:
`string` | `number` | `integer` | `boolean` | `object` | `array`.

`format` is an **open vocabulary** of data-semantic hints. Known values
refine how the engine formats the field; unknown values (e.g.
`person-name`, `email`, `postal-code`) are generation hints for the
Designer/AI sample-data tooling and leave the base type untouched —
they never warn.

| `type` | `format` | engine field type |
| --- | --- | --- |
| `string` | — / unknown | string (verbatim) |
| `string` | `date-time` | datetime |
| `string` | `date` | date |
| `string` | `image` | image reference (bundled path, `data:` URI, or inline SVG — the Designer can offer an upload widget) |
| `number` / `integer` | — / unknown | number |
| `number` / `integer` | `currency` | currency (`currency:`/`precision:` refine it) |
| `number` / `integer` | `percentage` | percentage (the value is the FRACTION: `0.1` → `10%`) |
| `number` / `integer` | `quantity` | quantity (`unit:` refines it) |
| `boolean` | — | boolean (`checkbox`/`ellipse` presence bindings) |

A KNOWN semantic format on a base type it does not apply to
(`format: currency` on a string) keeps the base type and warns
`definitions_format_ignored` — a declared-schema mistake, unlike an
unknown hint. The same names work as type overrides in `{key:type}`
interpolation ([data-binding.md](data-binding.md)), spelled in the
engine's field-type vocabulary (`datetime`, `currency`, …).

## Enum display labels

An `enum` member may be authored as a `{ value, label }` pair beside
the bare form (the two mix freely in one list):

```yaml
status:
  type: string
  enum:
    - { value: shipped, label: 出荷済み }
    - { value: backorder, label: 入荷待ち }
    - hold                # a bare member renders its value verbatim
```

Params keep carrying the machine value (`"backorder"`); every text
placement of the field — a text item, a table column, a list entry, a
QR code's content — prints the declared label instead, and
`format: value` (or `{key:value}` in an interpolation) prints the
machine value ([data-binding.md](data-binding.md)). This replaces
host-side display ternaries: the value set and its display words live
in ONE declaration, so they cannot drift apart, and a status word never
enters the params contract.

Labels apply to **plain text fields only** (a `string` with no semantic
`format`): every other field type renders through its own formatter (a
date pattern, a currency variant), so a labeled member there warns
`definitions_enum_labels_ignored` and renders unlabeled. A member with
no label falls back to its value silently — partial labeling is
legitimate. An empty-string label is authorable and renders empty (the
VALUE is non-blank, so the blank-form placeholder does not fire).
Membership validation (`params_enum_mismatch`) always matches the
member's VALUE; labels never participate. A labeled member must declare
a scalar `value` (a container value is a parse error), and a mistyped
pair key (`lable:`) is a located parse error like any other unknown
key. Capability key: `definitions.enum.labels`.

## Constraints and params validation

When `validate` receives BOTH definitions and params, it checks the
params tree against the schema — warnings only (rendering proceeds;
blanks are the placeholder feature's domain):

- `required` keys must be present and non-`null` (`params_missing_required`).
- Values must match their declared base type (`params_type_mismatch`;
  `integer` rejects fractional numbers).
- `minimum`/`maximum` bound numbers (`params_out_of_range`);
  `minLength`/`maxLength` bound string length in characters and
  `minItems`/`maxItems` bound array length (`params_length_out_of_range`).
- `enum` membership (`params_enum_mismatch`).
- Params keys not declared anywhere warn `params_unknown_key` (typo
  detection on the data side; the unknown subtree is not entered).

A **blank** value (`null` or `""` — the same predicate the blank-form
placeholder uses) skips every check, whatever the declared type: a
blank-form params variant fills even number fields with `""`. An empty
array is NOT blank and stays subject to `minItems`.

## How templates reference definitions

- A scalar binding `data: { key: receipt.number }` binds the **dotted
  path** through the object properties.
- A `table` / `repeat` / `repeat_flow` / `list` binds an **array
  property's dotted path** (`data: { key: items }`, or `order.lines`
  nested); its columns/cells then bind row-relative field keys (dotted
  through nested row objects).
- A row's own `type: array` child (a `list` inside a repeat cell) is a
  data source in its own right. Its key is bound row-relatively
  (`data: { key: items }` inside the cell), and its `items:` schema
  describes ONE ENTRY — so the list's per-entry `text:` keys are checked
  against it, and those entries carry their declared display formats,
  `placeholder` and `enum` labels exactly as a top-level array's rows do.
  Nesting is not limited to one level.
- A `format:` variant on a binding must appear in that field's
  `displayFormats` list, the template's `formats:` registry, the
  currency variants (`default`/`symbol`/`name` on a currency field;
  `symbol`/`name` also pass on a number field, which they promote to
  currency at render), `value` on a field with enum display labels (the
  label escape), or be a type override — `unknown_format` warns
  otherwise. The field's own `displayFormat:` is its default when the
  placement picks nothing ([precedence](data-binding.md)).

## Limits and typo safety

Unknown keys are **located parse errors**, never silently dropped —
including the retired v1 `groups:` form, which is answered with a
migration hint naming this page. A misspelled `type:` value is likewise
rejected. `pattern` (regex) is reserved and not accepted in this
version — semantic generation hints belong in `format`.

Caps: schemas nest at most 16 levels (`MAX_SCHEMA_DEPTH`), declare at
most 4096 nodes (`MAX_SCHEMA_NODES`), and an `enum` lists at most 256
members (`MAX_ENUM_VALUES`) — labeled or bare.

If a definitions file has **zero properties**, it defines no keys, so
every template binding reports `unknown_data_key`. Validation surfaces
the upstream cause once as `empty_definitions`.

## Limitations

- Definitions are not required to render. They enrich `validate`; a document
  with none still produces the same PDF.
- Params checks REPORT, they do not gate: a type, range, enum, length or
  required violation warns (`params_type_mismatch`, `params_out_of_range`,
  `params_enum_mismatch`, `params_length_out_of_range`,
  `params_missing_required`) and the render continues.
- A semantic `format` on a base type it does not apply to is ignored
  (`definitions_format_ignored`), and labeled `enum` members on a field that
  is not plain text render unlabeled (`definitions_enum_labels_ignored`).
- A file that declares no properties makes every binding read as unknown
  (`empty_definitions`).
- `locale` and `currency` are no longer definitions keys — they live in
  `defaults:`, and a stale copy is a located parse error (`parse_error`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `unknown_data_key` | a template binding's key is not in definitions (validate) |
| `empty_definitions` | definitions was supplied but declares no properties; every binding will read as unknown (validate) |
| `unknown_format` | display variant not declared for the field (validate) |
| `definitions_format_ignored` | a known semantic `format` sits on a base type it does not apply to (validate) |
| `definitions_enum_labels_ignored` | a labeled `enum` member on a field that is not plain text; its values render unlabeled (validate) |
| `params_missing_required` | a `required` key is absent or `null` in params (validate) |
| `params_type_mismatch` | a params value's JSON type differs from the declared type (validate) |
| `params_out_of_range` | a number violates `minimum`/`maximum` (validate) |
| `params_length_out_of_range` | a string violates `minLength`/`maxLength`, or an array `minItems`/`maxItems` (validate) |
| `params_enum_mismatch` | a value is not in the declared `enum` (validate) |
| `params_unknown_key` | a params key is not declared in definitions (validate) |

Params diagnostics carry their location in the `key` arg (`items[1].name`),
never in `path` — the `path` field's grammar is template box paths.

## See also

- [data-binding.md](data-binding.md) — how bindings and formats resolve
- [table.md](table.md) / [repeat.md](repeat.md) / [list.md](list.md) — array-property consumers
