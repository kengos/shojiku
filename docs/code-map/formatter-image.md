# Code map — engine/formatter, engine/image

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.

Postures stated once: formatting degrades, never fails — every bad input
becomes a `FormatWarning`, echoed names clipped. Packs are UNTRUSTED
data: every numeric knob a pack supplies is range-checked at use. Spec
detail (the pattern-token inventory, currency variants, grouping rules,
the manifest wire's key list) lives in `docs/engine/`
([data-binding.md](../engine/data-binding.md),
[fonts.md](../engine/fonts.md)) — this map carries only who owns what.

## engine/formatter/src (display strings)

- `lib.rs` — crate root: locale-aware value formatting.
- `format.rs` — **format dispatch root**: `format_value(value, spec,
  variant, FormatContext, pack) → Formatted { text, warning }`.
  Precedence chain placement ← `Field.format` ← template
  `defaults.formats[type]` ← pack default via `effective()`/`Pick`; a
  placement variant naming a TYPE overrides the type — EXCEPT on a
  date/datetime field, where a name the pack or the `formats:` registry
  declares is a VARIANT and wins (`dated::declares`); a `symbol`/`name`
  pick on a Number coerces it to Currency keeping the variant
  (placement-pick-only, `format.currency.coerce`). `FormatContext`
  carries the template's `FormatDefaults` + `formats:` registry +
  `currency` doc-default code.
- `format/dated.rs` — everything that depends on the dated TABLES:
  `tables()` (a datetime reads `datetimeFormats` then `dateFormats`, a
  date reads `dateFormats`, each with the engine's own fallback pattern),
  `render()` (inline pattern → registry → tables → default+warning), and
  `declares()` — the guard the dispatch consults before the type-override
  check. `declares` and `render` must AGREE: it returns true for exactly
  the names `render` finds a pattern for, or the override steals a pick
  the renderer was ready to honour. That was the defect (`format: date`
  on a datetime field re-typed the value instead of reaching the pack's
  `datetimeFormats.date`, visible only in ja-JP, where the two patterns
  differ).
- `format/datetime.rs` — date/datetime parse + the CLDR-subset pattern
  renderer. The token inventory is APPEND-ONLY (the list is published in
  data-binding.md) and is now exported as `shojiku_formatter::PATTERN_TOKENS`
  — `shojiku_authoring` walks it to prove every token DISCRIMINATES the two
  exemplars `drops_time` compares, so a token added later that renders alike
  for both (fractional seconds, a zone token while the pair shares an offset)
  reds instead of silently going unmeasured; `'…'` quoting with `''` escape (unterminated
  degrades); name tables and the era tokens resolve through the pack.
  Token matching is `starts_with_token` over the char slice — never a
  fresh `String` per iteration, which made the renderer O(n²) in pattern
  length on a path a TEMPLATE reaches (patterns are unbounded up to the
  template size cap, and the caller is on the RENDER path).
- `format/money.rs` — the three currency variants (bare | `symbol` |
  `name`); precision chain field → pack → the compiled CLDR fractions
  table. `format_quantity` = semantic key → plural word + `unitFormat`
  layout.
- `format/number.rs` — grouping/precision-clamp/trim shared by every
  numeric type; `group_integer` is generic over
  (`groupSize`, `secondaryGroupSize`) and treats 0/absurd sizes as "no
  grouping" (packs are untrusted).
- `format/text.rs` — the text arm: String/Boolean/Image display +
  the `enum` display-label lookup over `FieldSpec.enum_labels` (label by
  default, `value` pick → raw, other picks → label + UnknownVariant; a
  label-less field keeps its historical silent-ignore). `display_string`
  lives here.
- `lang.rs` — **`LangPack`** wire: month/weekday/dayPeriod name tables,
  `unit_format`/`percent_format` layouts, `eras: Vec<EraSpec>` +
  `era_year_one` + `era_for()`; locale-fonts accessors
  `font_pack_ids()`/`default_font()`/`font_fallback()`. **every pack door
  refuses an oversize input unread** on the core bound
  (`shojiku_core::MAX_INPUT_BYTES`, read rather than re-declared) through
  the shared `ensure_pack_size` — `LangPackError::TooLarge`. That is
  `from_yaml_str` AND the builtin OVERLAY arm, which does not go through it
  and is the arm every host takes for a builtin id (`ja-JP` is the default,
  reachable from a browser via `set_locale`). A pack is host-supplied data,
  so it is parsed under the same posture as a template.
- `lang/specs.rs` — pack value specs: **`NumberSpec`** (separators +
  group sizes; the Indian `#,##,##0` rule is pack DATA, not code),
  **`CurrencySpec`** (symbol/name + formats + optional precision),
  **`UnitSpec`** (`one?`/`other`/`format?` + the plural `word()` pick).
- `lang/builtin.rs` — builtin locale packs: CLDR-generated YAML under
  `lang/builtin/*.yml` (regen `scripts/gen-locale-builtins.py` —
  authoring-time fetch, pinned CLDR version) embedded via
  `include_str!`; `BUILTIN_LOCALE_IDS` = ja-JP/en-US.
  **`LangPack::builtin(id, overlay)`**: case-insensitive +
  unique-language-prefix id match; per-key YAML deep merge (maps
  recurse, scalars/sequences REPLACE). A `packs/locale/<id>.yml` is an
  overlay for a builtin, a whole pack otherwise. Also
  `currency_fraction_digits` over the compiled
  `builtin/currency-fractions.yml` (the full CLDR table, engine-wide).
- `lang/era.rs` — `EraSpec`/`EraDate`: strict `yyyy-mm-dd` wire + the
  date→era lookup.
- `lang/fonts.rs` — pack-manifest + locale-fonts wire.
  **`PackManifest`** (`packs/fonts/<pack>/manifest.yml`; camelCase,
  `deny_unknown`) — the manifest wire is bounded at ALL FOUR of its parse
  sites, not just the public one: `from_yaml`, filesystem pack resolution
  (`packs.rs`), the injected bytes-first path (`packs/bytes.rs`) and the
  wasm session's own re-parse (`add_font_pack` takes the string from JS).
  Each reports the refusal in its own error type — with
  **`to_yaml`/`from_yaml`** kept BESIDE the wire
  type so a generator (`shojiku font add`) round-trips through the same
  pair the resolver parses with (`to_yaml` infallible by construction —
  only shapes serde_yaml cannot refuse). **`FontFaceDecl`** (`id`/`file`/
  `sha256` + variant keys + optional `url` — a fetch HINT for the
  host-side `shojiku-fetch`; `sha256` stays the guarantee).
  **`LocaleFonts`** (`uses: [pack-id]` + `default` + `fallback`,
  references only; `uses` is `deserialize_with`-guarded).
  **`FaceSpec`** = a resolved face + path + variant keys + sha256 +
  embedding-attest + optional `url` + owning `pack` id (the last two
  carry the fetch hint and a user-facing name to `shojiku-fetch`).
- `lang/fonts/pack_id.rs` — what a pack id may be: `valid_pack_id` = one
  path segment (the id becomes a directory name AND a fetch-URL segment
  on hosts) + the `deserialize_uses` hook that makes a hostile `uses`
  entry a locale-pack PARSE error — so `font_pack_ids()` can never hand
  one out.
- `lang/packs.rs` — **`resolve_face_specs`** +
  **`resolve_face_specs_with`** (same walk plus `extra` pack ids a HOST
  added outside the locale — the CLI's `--font-pack` — chained FIRST so
  a user face id shadows a bundled one on the first-id-wins dedupe;
  each `extra` re-checked by `check_pack_id` exactly as a parsed entry
  is). Finds each `uses` pack's manifest across the font search dirs
  (first dir wins; each dir CANONICALIZED, absent dirs skipped; a pack
  dir that is itself a symlink → `PackError::PackTraversal`).
- `lang/packs/confine.rs` — the confinement rules shared by both
  resolvers: `check_pack_id` (serde is bypassable — `uses` is a public
  field, so the resolver re-checks) → `InvalidPackId`; `confine` = the
  LEXICAL face-path check (`..`/absolute → `Traversal`), the only one
  the no-filesystem bytes path can make; `contained` = the FILESYSTEM
  check (symlinks followed, canonical path must stay under the pack
  dir; an ABSENT face is deliberately fine — a pinned pack travels
  without bytes; a dangling link is `Io`). The residual read-time race
  is benign: the loader sha256-verifies the bytes it actually read.
- `lang/packs/bytes.rs` — **`resolve_face_bytes`** (strict: every
  `uses` pack required → `NotFound`) + **`resolve_face_bytes_subset`** →
  `SubsetFaces { faces, missing }` (the browser-preview lenient path —
  only ABSENCE of a `uses` pack is tolerated, reported by id) over one
  shared walk, so both resolve face-for-face. **`InjectedPack`**/
  **`FaceBytes`**: the bytes-first mirror — host-injected manifest
  strings + face bytes keyed by manifest `file`, same
  check/confine/dedupe as the filesystem path, sha256 downstream.

## engine/image/src (image assets)

- `lib.rs` — crate root: image assets for the render pipeline.
- `error.rs` — **`ImageError`** (traversal/IO/injected-missing/policy/
  decode); `prepare_assets` converts to diagnostics — errors for
  template assets and policy violations, warnings for params-supplied
  content, so a render degrades instead of panicking.
- `geom.rs` — **`PathCmd`**: the backend-neutral vector-path currency
  shared by SVG assets, font glyph outlines, form marks, and both
  renderers; `Serialize` so it rides `tree::PathShape`; crate-root
  re-export.
- `source.rs` — classify a raw source string: bundled path / data URI /
  inline SVG / remote URL.
- `policy.rs` — `AssetPolicy`: open|bundled-only + per-item allow/deny +
  caps.
- `raster.rs` — magic-byte sniff + header-only dimension checks.
- `decode.rs` — `decode_raster`: encoded bytes → straight-alpha RGBA8
  (png/zune-jpeg/gif/image-webp) for pixel backends.
- `store.rs` — `AssetStore` (FontStore-style). `Asset::intrinsic_size` =
  raster pixel rect or SVG `viewBox`; **`Asset::clips_to_viewport`** =
  "can this asset paint outside the rect the fit math gave it" — true
  only for SVG, which is why layout clips every SVG image to its
  content box whatever the `fit`.
- `svg.rs` — subset SVG parser root: `SvgLimits`/`SvgTree`/`parse_svg`;
  `SvgPath.fill` is an **`SvgPaint`** = solid OR gradient. resvg/usvg
  are banned (MPL + ttf-parser).
- `svg/style.rs` — affine transforms + inheritable presentation attrs;
  `PaintRef` = solid | `url(#id)` gradient ref; `parse_color`.
- `svg/walk.rs` — the element walk: group/shape traversal with node and
  depth caps, per-path bbox + gradient-fill resolution.
- `svg/path.rs` — `d=` parsing into transformed cubics, arc flattening,
  smooth-command reflection.
- `svg/paint.rs` — **`SvgPaint`**/`LinearGradient`/`RadialGradient`/
  `GradientStop`/`SpreadMode`: gradient stops in a local space + a
  `local→viewBox` affine; stop normalization + `MAX_GRADIENT_STOPS`.
- `svg/gradient.rs` — `<linearGradient>`/`<radialGradient>` collection +
  `url(#id)` resolution: `gradientUnits` user/objectBoundingBox via path
  bbox, `gradientTransform`, `spreadMethod`, one-level `href` stop
  inheritance with a cycle guard, focal point.
- `svg/gradient/parse.rs` — per-element + `<stop>` attribute/`style=`
  parsing.
- `prepare.rs` — `prepare_assets` root: the template+params walk. The
  top-level `image_items` walk also descends into every per-element cell
  (repeat/repeat_flow cells AND a table column's `cell:`) via the
  `in_cell` flag, collecting images whose source is SHARED across
  elements — a static `src:`, or a `data:` binding at `scope: document`
  (one `dyn:<key>` asset, uncounted against the per-element cap).
  **`is_element_scoped(image)`** is the ONE predicate the shared and
  per-element walks split on, so neither can both-claim or both-skip an
  item.
- `prepare/cells.rs` — scoped per-element cell assets: `type: image`
  table columns AND `data:`-bound `image` items inside a per-element
  cell, each loading one asset per element as `cell_asset_key` =
  `dyn:<array>[<i>].<key>`, policy id = the column/image `id`, one
  shared `MAX_CELL_IMAGE_ASSETS` `Cap` across both walks. A
  `scope: document` image COLUMN instead loads ONCE off top-level
  params under `dyn:<key>`, uncounted, matching the id layout asks for.
- `prepare/cells/walk.rs` — the collection walks: **`body_tables`**
  finds tables in the flow body AND nested in containers (a bounded
  table's image columns bind per row exactly like a flow table's, so
  the walk mirrors validate's recursion); `element_cell_images` finds
  the ELEMENT-scoped `data:`-bound cell images, skipping the
  document-scoped ones the shared walk owns.
- `prepare/load.rs` — static (template `src:`) and dynamic
  (params-bound) loading incl. the shared `dynamic_value` tail.
- `prepare/bundled.rs` — **`AssetsRoot`** None | Dir(FS) |
  Injected(host bytes map): the ONE bundled-byte loader both roots
  share (`confined_key` traversal check + byte cap), so an injected
  WASM host and the CLI reject the same `../`/absolute path and cap
  identically. `prepare_assets` = FS entry, `prepare_assets_injected` =
  bytes entry, both delegating to one walk.
