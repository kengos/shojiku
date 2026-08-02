# `link:` — hyperlinks

A clickable URL on a text item, an image item, or a rich-text span,
emitted as a PDF link annotation over the item's drawn geometry. PNG
previews ignore links (they have no visual form and no annotation
surface).

## Syntax

```yaml
- type: text
  text: ご注文の確認はこちら
  link: { url: "https://example.com/orders/{order.code}" }

- type: image
  box: { w: 60, h: 24 }
  src: logo.svg
  link: { url: "https://example.com" }

- type: text
  spans:
    - text: "詳しくは"
    - text: 利用規約
      link: { url: "https://example.com/terms" }
      style: { textDecoration: underline, color: "#0a58ca" }
    - text: をご覧ください
```

Always the object form `link: { url: … }` — a bare string is a parse
error, and unknown keys inside `link` are rejected (typo safety). The
object form reserves room for internal destinations later.

## Behavior

- `url` takes `{key:format}` interpolation exactly like static text,
  resolved against the current data scope — inside a `repeat` cell /
  `repeat_flow` card it resolves per element, so every ticket can carry
  its own URL.
- **Activation area**: text links annotate one rect per wrapped line
  (per run for spans); image links annotate the draw box. A block-level
  `link` on a `spans` item reaches every span; a span's own `link`
  overrides it for that span's runs.
- Links survive pagination (each fragment of a long flow text stays
  clickable) and `textOverflow: clip` / `overflow: hidden` (the visible
  part annotates; note the annotation rect itself is not pixel-clipped).
- **URL gate** (resolved value, params are untrusted): only `http:` /
  `https:` / `mailto:` / `tel:` schemes, no control characters, at most
  2048 bytes. Anything else warns and drops the link — the document
  still renders, without the annotation.
- Styling is the author's job: links are not auto-underlined or
  recolored (use `textDecoration: underline` etc.).

## Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `unsupported_link_scheme` | warning | scheme outside http/https/mailto/tel, or control characters; link dropped |
| `link_url_too_long` | warning | resolved URL over 2048 bytes; link dropped |
| `empty_link_url` | warning | resolved URL empty/whitespace; link dropped |
| `unknown_data_key` / `missing_data` | error / warning | `{key}` in the URL fails the usual binding checks |

Capability key: `link.url`.

## See also

- [text.md](text.md) / [image.md](image.md) — the carrying items
- [data-binding.md](data-binding.md) — `{key:format}` interpolation
- [diagnostics.md](diagnostics.md) — codes by stage
