---
reference:
  group: item
  keys: [list]
  summary: "A bounded per-element list: one entry per line, clamped with an overflow line."
---

# `type: list`

A bounded per-element list: renders an array field one entry per line,
clamping at the last fitting entry and ending with an overflow line when
entries were cut. No pagination by design — inside a `repeat` cell the
box is a fixed slot; in a flow an auto-height list simply grows.

## Syntax

```yaml
- type: list
  box: { w: "100%", h: 64 }        # definite h activates the clamp
  data: { key: items }             # array: params key, or element field in a cell
  text: "{name} ×{quantity}"       # per-entry template ({key} against the entry)
  overflowText: "他{count}件"       # default "+{count}"
  style: { fontSize: 8 }
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `{ key }` | required | The array to render — a params key, or inside a `repeat` cell / `repeat_flow` card a field of the bound element (scope-aware). `scope: document` reads the top-level array even from inside a cell — see [data-binding.md](data-binding.md#scope--the-escape-back-to-the-document). |
| `text` | string | unset | Per-entry template with `{key}` interpolation against the entry object. The keys are the fields the array's `items:` schema declares, so a typo warns `unknown_data_key` at validate; each resolves through its declared field spec (display format, `placeholder`, `enum` label). Unset: scalar entries print directly (strings as-is, numbers in plain form — no locale formatting). |
| `bindings` | map of name → binding | unset | Named declarations for the `{name}` interpolations in `text`. They resolve per ENTRY like `text` itself, unless one authors `scope: document` ([data-binding.md](data-binding.md#named-binding-declarations)). |
| `overflowText` | string | `+{count}` | Template for the trailing overflow line; `{count}` = the number of entries that did **not** fit. |
| `box` / `style` / `styleNames` | | | Usual forms; the text properties style every line. |

## Behavior

- One line per entry, never wrapped: an entry wider than the box takes
  the per-entry **ellipsis** (`…`, kinsoku-aware) instead.
- A definite `box.h` clamps at the last fitting entry **minus one** and
  appends the `overflowText` line; auto-height lists grow.
- `MAX_LIST_ENTRIES` (1,000) bounds hostile arrays — capped entries
  still count into `{count}`.
- Under `writingMode: vertical_rl` each entry is a right-to-left COLUMN
  (see [vertical_text.md](vertical_text.md)); tate-chu-yoko
  (`textCombineUpright`) applies per entry, and the definite-`box.h`
  `…` clamp keeps a combined group whole — kept or dropped, never
  split.

## Limitations

- No pagination, by design. The box is a fixed slot: entries past it are cut
  and the overflow line ends the list.
- One line per entry. There is no per-entry style, no nested item, and no
  bullet/numbering key — the entries are the array's own strings.
- The source must be an array property (`not_an_array`); a missing key warns
  (`missing_data`) and an undeclared one (`unknown_data_key`).

## Diagnostics

| Code | Meaning |
| --- | --- |
| `missing_data` / `not_an_array` | array source problems |
| `unknown_data_key` | a `text:` key (or a `bindings:` declaration) that the array's declared element does not carry. Silent when no definitions declare the source, or when its `items:` is absent — an unknown shape claims nothing. |

Capability key: `list`.

## See also

- [table.md](table.md) — paginating columnar data
- [repeat.md](repeat.md) — the living use case (`examples/business/shipping-labels-ja`: 2×3 shipping labels with an overflow-count line)
