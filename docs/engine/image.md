# `type: image`

An image item. The source comes from `src` (template-time: a path under
the assets directory, a `data:` URI, or inline SVG markup) or `data` (a
params-bound value, subject to the host's asset policy) — exactly one
should be set. `box.w`/`box.h` are required to reserve space (layout
never sizes from image pixels).

## Syntax

```yaml
- type: image
  box: { w: 120, h: 40 }
  src: logo.svg                  # path under the assets root (--assets-dir,
                                 # default: the template file's directory)
  # src: "data:image/png;base64,…"
  # src: "<svg …>…</svg>"        # inline SVG
  # data: { key: product.image } # params-bound (policy-gated)
  fit: contain                   # contain | cover | stretch | none
  style: { backgroundColor: "#f2f2f2", borderWidth: 0.5 }
```

## Keys

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | string | | Bundled path, `data:` URI, or inline SVG. A path resolves against the **assets root** — `--assets-dir`, defaulting to **the template file's directory** (so `examples/business/receipt-ja/templates.yml` can say `src: assets/logo.svg`); paths escaping the root are rejected (`asset_traversal`). Remote URLs are recognized and rejected (`remote_asset_unsupported` — the render path has no network I/O, and unlike a font there is no `sha256` pin that would make fetching an image deterministic). |
| `data` | `{ key }` | | Dynamic source from params; the host's asset policy (open vs bundled-only, per-item allow/deny via CLI `--allow/deny-dynamic-image`) gates it. |
| `bindings` | map of name → binding | | Named declarations for the `{name}` interpolations in this item's `link.url` ([data-binding.md](data-binding.md#named-binding-declarations)). |
| `fit` | `contain` \| `cover` \| `stretch` \| `none` | `contain` | CSS `object-fit`, all centered. `contain` preserves aspect ratio inside the box (letterbox); `cover` preserves aspect ratio filling the box and crops the overflow; `stretch` fills the box exactly (distorting); `none` draws at the asset's intrinsic size (raster px at 72dpi / SVG viewBox units). `cover`/`none` clip anything past the content box — and an **SVG clips under every fit** (see below). |
| `box.w` / `box.h` | [Length](length.md) | required | The fit box (inset by padding). |
| `style` / `styleNames` | | | Decoration (`backgroundColor`, `borderWidth`/`borderColor`) plus **`opacity`** (see below); text properties are unused. |
| `link` | `{ url }` | | Hyperlink over the draw box. See [link.md](link.md). |

## The box always holds

An image never paints outside its content box. For a raster that falls
out of the fit math — the pixels are exactly their own rect — so only
`cover`/`none` need the crop. An **SVG** is different: its intrinsic
size is the `viewBox`, but nothing stops a path from being drawn
outside it, so the fitted rect is not the painted rect. The `viewBox`
is the viewport and a viewport clips (the outermost `<svg>` carries
`overflow: hidden`), so every SVG is clipped to the content box under
every fit — `contain` and `stretch` included.

This matters when the asset is not yours: without it, one hostile or
merely sloppy SVG could paint over the whole page. If your own artwork
looks cropped, its shapes extend past the `viewBox` — widen the
`viewBox` rather than expecting the overflow to draw.

## Opacity

`style: { opacity: 0.5 }` applies a whole-image paint alpha (`0..=1`).
Both backends composite the raster or vector image as **one group**, so a
partly-transparent image reads as a single unit (overlapping SVG paths do
not double-blend at their seams). Out-of-range or non-finite values warn
`invalid_opacity` and draw opaque.

## Formats

- **Raster**: PNG, JPEG, GIF, WebP — sniffed by magic bytes, header
  dimensions validated, size-capped by the asset policy.
- **SVG**: a deliberate subset parser (paths, basic shapes, groups,
  affine transforms, presentation attributes; node/depth caps). Text
  inside SVG is not rendered. Unsupported constructs warn
  `svg_unsupported`.
  - **Gradients**: `<linearGradient>` / `<radialGradient>` fills are
    supported — `<stop>` colors/opacity (including via `style="…"`), both
    `gradientUnits` (`userSpaceOnUse` and the `objectBoundingBox` default),
    `gradientTransform`, `spreadMethod` (`pad`/`reflect`/`repeat`), radial
    focal point, and one-level `href`/`xlink:href` stop inheritance (the
    Inkscape/Illustrator stop-holder pattern). Gradient **strokes** are not
    yet drawn (they warn and fall back to the inherited solid stroke); an
    undefined `url(#id)` reference warns and leaves the shape unpainted.
    Both the PDF and PNG backends draw gradients identically.

## In `repeat` / `repeat_flow` cells

Images work inside `repeat` cells, `repeat_flow` cards, and a table
column's `cell:`. A static `src:` is one shared asset drawn once per
element; a `data:` binding is **element-scoped** — its key is a field of
the bound array element and each element loads its own asset
(`dyn:<array>[<i>].<key>`), under the same per-element load cap as table
image columns (`cell_image_assets_capped`).

A `data:` binding with
[`scope: document`](data-binding.md#scope--the-escape-back-to-the-document)
is the third case: the key reads top-level params, so the cell draws ONE
shared asset (`dyn:<key>`, loaded once and uncounted against the
per-element cap) — the shop logo on every ticket, without hard-coding a
`src:` path.
The host asset policy gates dynamic cell images by the image item's `id`.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `image_missing_size` | `box.w`/`box.h` absent |
| `empty_image_item` / `image_source_conflict` | neither / both of `src`+`data` set |
| `missing_asset` / `assets_root_missing` / `asset_traversal` | bundled path problems (absent, no root, escapes the root) |
| `invalid_image_data` / `invalid_image_asset` / `image_source_missing` | undecodable or unresolvable sources |
| `remote_asset_unsupported` | remote URL source; rejected |
| `dynamic_image_denied` | params-bound image blocked by the asset policy |
| `svg_unsupported` | SVG constructs outside the subset |
| `cell_image_assets_capped` | per-element cell images (table columns + repeat cells) exceed the shared load cap; the rest are skipped |
| `invalid_opacity` | out-of-range / non-finite `opacity`; draws opaque |

Capability keys: `image`, `image.fit.cover_none` (the `cover` / `none` fit
modes), `image.svg.gradient` (gradient fills in the SVG subset — gate
gradient previews on it; older engines leave gradient-filled shapes
unpainted with an `svg_unsupported` warning), `image.cells` (images inside
repeat/repeat_flow cells — older engines warn+skip there), and
`image.opacity` (whole-image group alpha; older engines ignore it).

## See also

- [link.md](link.md) — `link: { url }` over the image
- [qr_code.md](qr_code.md) — vector codes with no asset pipeline
