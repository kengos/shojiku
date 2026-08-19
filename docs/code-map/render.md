# Code map — engine/render-pdf, engine/render-png

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Companion: [layout.md](layout.md) — both backends draw the layout tree
> (`tree.rs`, the ONLY layout↔renderer contract), and this file uses its
> vocabulary (`RunView`, `LayoutItem`, `Dash`, `DocumentMetadata`)
> without redefining it.

Postures stated once: renderers never re-measure, re-format or re-shape —
shaping happened once in the layout font layer (`shape_run`); a renderer
draws the decided glyph ids/advances/offsets. The two backends paint the
SAME tree and mirror each other's conventions (`box_path`, `dash_of`,
`rotate_cw90`'s sign, `scale_about`) so a fix in one is checked against
the other. Clip groups are depth-capped and fail closed in both.

## engine/render-pdf/src (krilla; the Render stage's PDF)

- `lib.rs` — `render_pdf(layout, fonts, assets)`; font embedding (krilla
  subsets automatically); **`metadata_of`**: tree `DocumentMetadata` →
  krilla `Metadata`, written to BOTH `/Info` and the XMP packet, plus the
  catalog `/Lang` from `language`. `creation_date`/`document_id`/
  `creator`/`producer` are never set — that is what keeps two renders
  byte-identical.
- `annot.rs` — per-line/run/image-box krilla link annotations, added
  after the surface closes; clip recursion + fail-closed degenerate-rect
  guards.
- `draw.rs` — the krilla draw calls. **`box_path`** picks the plain rect
  or the layout-built rounded path so a box's fill, stroke and clip
  follow one curve; **`dash_of`** maps a tree `Dash` to a krilla
  `StrokeDash`, rejecting non-positive/non-finite intervals (tiny-skia
  would answer those by dropping the whole stroke). Raster images via
  krilla's `raster-images` feature (pure codecs — no ttf-parser); SVG +
  form-mark paths (`LayoutItem::Path`) played back via `svg_path`, marks
  stroked with `round_stroke`; clip groups via `push_clip_path`/`pop`.
- `paint.rs` — **`svg_fill`**: `SvgPaint` → krilla `Fill`, solid +
  linear/radial gradients.
- `tests/invisible.rs` — HALF the measurement `header.visuallyHidden` stands
  on. These probes render a plain `text` item at `style.opacity: 0` and never a
  table: they pin that text at paint alpha 0 still reaches the content stream
  as EXTRACTABLE text (`BT`/`Tf`/`TJ`), that krilla expresses the alpha as an
  ExtGState `ca 0` an opaque render does not carry, and that the operator COUNT
  matches an opaque render. The OTHER half — that a hidden header's label
  actually resolves to alpha 0 — is `layout/tests/e2e/table/hidden_header.rs`;
  the feature is proven by the two together, not by either alone. krilla
  exposes no text rendering mode, so alpha is the mechanism; these tests are
  why that is a fact rather than an inference. Inflates the streams with the
  `flate2` dev-dependency, admitting only PAGE CONTENT streams — krilla writes
  font programs under a dictionary identical to a content stream's, and an
  sfnt subset can carry the literal bytes `BT`/`Tf`/`TJ`, so "it inflated" is
  not a sufficient test and the positive controls would pass on font data.
- `text.rs` — glyph drawing per `RunView` (plain implicit run or rich
  span runs): fallback-chain glyphs grouped into per-face segments, per-
  run fill/stroke/skew/decoration; `map_glyphs`/`em_advance`/
  `italic_skew`.
- `text/vertical.rs` — takes over when `block.vertical` is set:
  `arrange_vertical` per column (plain column in the block style; rich
  column iterating per-span `TextRun`s at their own down-offsets),
  upright glyphs centered + stacked down, `mixed` Latin rotated 90° cw
  via `rotate_cw90`; rebuilds each column's `RunOptions` (spacing, block
  trim, column-head flag, tate-chu-yoko `text_combine`), scales a
  compressed combined glyph about its pen origin (`scale_about`), and
  draws per-column/per-run SIDE decoration bands at the layout-resolved
  offset. The PNG backend mirrors all of this.

## engine/render-png/src (tiny-skia; the Preview stage's raster)

- `lib.rs` — `render_png` + **`render_raw`** (encode-free per-page
  **`RawPage`** `{ width_px, height_px, rgba }`, un-premultiplied RGBA a
  WASM canvas paints via `ImageData`); both share **`RenderRun`** — the
  ONE validate/cap home, whose `rasterize` consumes pages ONE AT A TIME
  so peak memory stays one canvas. Single-page primitives
  **`render_png_page`/`render_raw_page`** (`page: usize`, 0-based,
  bounds-checked via `page_at` → `RenderPngError::PageOutOfRange`) are
  byte-identical to that page of the all-pages fns. Canvas caps live
  here. A uniform `scale` (px/pt) is the only transform.
- `paint.rs` — the tiny-skia `Painter`. `box_path`/`dash_of` mirror the
  PDF backend's (same rounded path, same solid fallback for an unusable
  dash pattern); `draw_path` plays back `LayoutItem::Path` via the shared
  `build_path` with round caps/joins; clip groups are an intersected
  `Mask` threaded through every draw call.
- `paint/text.rs` — per-`RunView` glyph-outline fills
  (`FontFace::glyph_path`), synthetic bold/italic + decoration per run.
- `paint/text/vertical.rs` — **`draw_text_vertical`**: the vertical-
  writing column path, sharing `rotate_cw90`'s sign and `scale_about`
  with the PDF backend, incl. the rebuilt `RunOptions` and the side
  decoration bands.
- `paint/gradient.rs` — **`svg_paint`**: `SvgPaint` → tiny-skia `Paint`,
  solid + linear/radial gradient shaders.
- `paint/image.rs` — raster embed (via `shojiku_image::decode_raster`)
  and SVG replayed as paths.
