---
reference:
  group: item
  keys: [qr_code]
  shapes: [EcLevel]
  summary: "A QR code encoded at layout time into vector modules — static text or a bound value."
---

# `type: qr_code`

A QR code item. Content comes from `text` (static, with `{key}`
interpolation) or `data` (a single bound value) — exactly like a text
item; the engine encodes whatever string it gets (URL / number / opaque
token, no semantics). Encoded at **layout time** into vector module
rectangles, so it needs no asset pipeline and works inside `repeat`
cells with element-scoped bindings — and in flow, absolute, bands, and
containers (flex or absolute placement).

## Syntax

```yaml
- type: qr_code
  box: { w: 60, h: 60 }             # w/h required
  data: { key: url }                # …or text: "https://example.com/{code}"
  errorCorrection: medium           # low | medium | quartile | high
  style: { backgroundColor: "#ffffff" }   # the scannable white backing
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `text` / `data` | | one required | Content, exactly like [text.md](text.md) — scope-aware, so per-element inside cells. |
| `bindings` | map of name → binding | unset | Named declarations for this item's `{name}` interpolations — the option set the bare `{key}` grammar cannot carry, incl. a key outside `[A-Za-z0-9_.]` ([data-binding.md](data-binding.md#named-binding-declarations)). |
| `box.w` / `box.h` | [Length](length.md) | required | The code draws **square** on the smaller content-box side, centered, with the ISO 18004 4-module quiet zone *inside* the box. |
| `errorCorrection` | `low` \| `medium` \| `quartile` \| `high` | `medium` | Tolerated damage ~7/15/25/30%; higher levels need more modules for the same content. |
| `style` / `styleNames` | | | Decoration only: `backgroundColor` paints under the modules (the usual white backing), plus `borderWidth`/`borderColor`. |

## Guards

- The encoded string is the **formatted** value, like any text placement
  — a field with enum display labels encodes its LABEL; bind
  `format: value` to encode the machine value
  ([data-binding.md](data-binding.md#formats)).
- Content is capped at **1 KiB** (`qr_content_too_long`) — params are
  untrusted and modules fan out into tree items.
- Modules smaller than 1 pt draw but warn `qr_module_too_small`
  (scanners may struggle).

## Limitations

- `box.w`/`box.h` are required (`qr_missing_size`).
- Content is capped at 1 KiB; past that the item is skipped
  (`qr_content_too_long`).
- Modules under 1 pt still draw but warn (`qr_module_too_small`) — a scanner
  may not read them.
- QR only. No other symbology, and no barcode types.
- The engine encodes the string it is given and reads no semantics from it:
  a payload's validity is the host's business.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `qr_missing_size` | `box.w`/`box.h` absent |
| `empty_qr_code_item` | neither `text` nor `data` set |
| `qr_content_too_long` | content over 1 KiB; skipped |
| `qr_module_too_small` | modules < 1 pt at the authored size; drawn anyway |

Capability key: `qr_code`.

## See also

- [image.md](image.md) — raster/SVG assets (QR needs none)
- [repeat.md](repeat.md) — per-element codes in n-up cells
