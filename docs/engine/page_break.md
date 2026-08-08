---
reference:
  group: item
  keys: [page_break]
  summary: "An explicit break: the next flow item starts on a fresh page."
---

# `type: page_break`

An explicit page break: the next flow item starts on a fresh page. A
bare item — no `box`, no `style`; just the type (and an optional `id`).

## Syntax

```yaml
- { type: text, text: "1ページ目" }
- { type: page_break }
- { type: text, text: "2ページ目" }
```

## Behavior

- **Flow-only**: bands, absolute bodies, and containers/cells warn
  (`page_break_in_band` / `page_break_in_absolute_body` /
  `page_break_in_container`) and skip.
- A break at the top of an **untouched page is a no-op**, so consecutive
  breaks collapse and blank pages are never generated (CSS forced-break
  collapsing).
- The 500-page cap applies as usual.

Capability key: `page_break`.

## Limitations

- Flow bodies only. In a band, an absolute body or a container it is skipped
  (`page_break_in_band`, `page_break_in_absolute_body`,
  `page_break_in_container`).
- No keys beyond `id`: no break-before/after on other items, and no
  conditional break.
- It cannot force a blank page — a break with nothing after it produces no
  page.

## See also

- [flow.md](flow.md) — pagination semantics
- [table.md](table.md) `keepTogether` / [repeat_flow.md](repeat_flow.md) — structure-owned break control
