# `type: page_number`

Draws the current page number. **Band-only** (header/footer): the page
count is known only at assembly, and bands are the per-page surface. In
a body or container it warns (`page_number_in_body` /
`page_number_in_container`) and is skipped.

## Syntax

```yaml
sections:
  footer:
    repeat: every_page
    items:
      - type: page_number
        # Bands share the margin-box origin (top-left) with the body —
        # there is no footer-local origin, so a footer needs a y near
        # the bottom: A4 + default margin 25 → margin box is 791.89pt
        # tall, and y: 780 leaves 12pt for the line.
        box: { x: 0, y: 780, w: "100%", h: 12 }
        format: "{page} / {pages}"      # the default
        style: { fontSize: 8, textAlign: center }
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | string | `"{page} / {pages}"` | `{page}` = current page (1-based), `{pages}` = total. Other text passes through (`- {page} -`, `p.{page}`). |
| `box` / `style` / `styleNames` | | | Usual text forms ([style.md](style.md)). |

Combine with the band's `repeat` mode (`every_page` /
`except_first_page` / …) to control which pages show it.

Capability key: `page_number`.

## See also

- [template.md](template.md) — bands and their `repeat` modes
