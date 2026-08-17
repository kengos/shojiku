# GUI / Designer Policy (`gui/`)

React + TypeScript. The Designer's job is to produce `templates.yml` /
`definitions.yml` and to preview them — nothing more.

```text
gui/                # pnpm workspace
  designer-core/    # headless document core (pure TS, no React)
  designer/         # the embeddable React component
  designer-app/     # the standalone shell (static site, first shipping form)
```

## Decided requirements (final form / adoption path / MVP)

**Final form — staged (decided).** The Designer is *designed* as an
embeddable component, *first shipped* as a standalone static site, and
the third integration form is the **mounted host** (decided, shipped —
see [designer-mount.md](../designer-mount.md)): the host system serves
the Designer under its own reverse proxy behind its own auth — shojiku
ships zero auth code — with persistence delegated to a host-implemented
JSON contract. A shojiku-hosted SaaS is **off the table** (user
decision); nothing may require restructuring to mount:

- **`designer-core`** — the headless document core: the YAML text held
  as a CST (`eemeli/yaml` Document), **named patch operations** (every
  edit the GUI can make is one), undo/redo, selection state. Pure TS,
  framework-free, fully unit-testable.
- **`designer`** — the embeddable React component (canvas, property
  panel, palette, diagnostics) over `designer-core`. This is what a
  host system embeds so its PMs edit templates in place.
- **`designer-app`** — the standalone shell and the first shipping
  form: a static Cloudflare Pages site with the preset catalog, file
  open/save, and localStorage drafts. It is deliberately just ONE host
  of the component.

**Adoption path (decided): developer-mediated.** Engineers adopt the
engine/SDK and embed or hand off the Designer; non-engineer PMs are the
daily users. Consequences:

- **Round-trip fidelity is an adoption gate**, not polish: the engineer
  reviews the diff. CST-preserving writes, only touched keys change,
  engine-canonical value forms, engine `validate` before save.
- **`definitions.yml` is EDITABLE in the Designer** (the full-screen
  data-item editor — reverses the earlier read-only seam). Each metadata
  edit (display label / type / format / description) and each added field is a
  CST-preserving, root-addressed patch op on the definitions doc,
  re-applied over a base each render (a coalesced op layer), so comments
  and untouched keys survive byte-exact and an added field never desyncs.
  These definition edits have their OWN panel-local undo — a left-rail
  control over snapshots of the coalesced op layer, separate from both the
  sample-data undo ring and the template's undo stack (three distinct undo
  documents; no redo, v1). It lives in the left rail so it is reachable
  with no field selected and stays available on a mounted host where the
  sample is read-only but definitions are not.
  On a mounted host the definitions doc is PROJECT-scoped (one save changes
  what every template in the project validates against); the editor shows a
  left-rail impact-scope hint beside the definition-editing controls,
  app-derived from the definitions-save wire (`definitionsProjectScoped`),
  so the PM sees the fan-out before saving.
  The engine contract is unchanged — definitions stay VALIDATE-time only,
  the render still runs off `params`; "editable" is about authoring, not
  the render path. Presets still bundle template + definitions pairs.
  The workshop-mode carve-out survives on top: standalone with NO engineer
  definitions, the Designer *infers* a definitions stub FROM the sample
  data as the base, which the user then edits (metadata edits ride as the
  op layer, structure re-inferred from params). Field creation stays
  workshop-mode-only for the insert-menu FieldDialog; the data editor's own
  add-field authors a definition op in ANY mode. **Promotion** = a
  workshop doc with ≥1 edit feeds validate (a pristine/empty stub does
  not, avoiding unknown-key noise). Standalone persists edited
  definitions in the local draft + export kit (the effective text AND the
  op layer, so a reopened blank-start session keeps workshop mode); a
  **mounted host** persists
  them through the `PUT projects/{id}/definitions` wire (see
  [designer-mount.md](../designer-mount.md)) — sample data stays
  engineer-owned + read-only there.
- **Sample params are a first-class editable document in standalone**
  (edited in the data-item editor, alongside definitions — the sample-data
  sidebar tab is retired): edits re-render the preview and ride the
  local draft + the export kit (`params.json`, plus a `definitions.yml`
  when edited or workshop-mode-inferred). A string field's value gets a roomy
  textarea (the genkoyoshi body-text case is the point). Generation is
  schema-driven — an `example`/`enum`/type-default walk over the
  definitions, with realistic values from a host-injected value synth
  (the app wires a faker-backed one; the component ships a deterministic
  baseline). Mounted params are read-only (engineer-owned) and never part
  of a save payload.
- **Sample data is a SET of named variants the preview switches between**
  (filled sample / blank form / long data …), so "does this data volume change the page
  break?" is one click. Variants come from the preset manifest
  (`params-<id>.json` files, localized names) and from user-added copies;
  the whole set (active id + variants) rides the local draft and the
  export kit (`params.json` + a `params-<slug>.json` per extra variant).
  The switcher is Designer-local sample state — never written into the
  template, never in the template undo stack. Mounted stays single +
  read-only (no switcher).
- **AI parity:** every Designer capability is a document patch (a
  `designer-core` operation) expressible outside the GUI — the GUI is a
  live *view* of the same document AI/MCP flows edit. No GUI-only
  state ever lands in the produced files.
- **AI copilot (op output):** a toolbar prompt modal whose answer is a
  patch-op list — AI parity exercised in-product. The transport is the
  hook registry's `suggest:ops` provider event
  ([designer-hooks.md](../designer-hooks.md)): a host forwards the
  request (prompt + the GUI-authored op-schema instructions + template /
  effective definitions / selection path / active params) to its own
  LLM; API keys never exist in GUI code or storage, and the engine stays
  AI-free (authoring-time only). The reply's ops are UNTRUSTED: a
  fail-closed shallow sanitizer (op-name allowlist, count cap,
  whole-reply refusal) plus a transactional dry-run on a scratch editor
  gate them, then the proposal is shown in the save/export review pane's
  copilot mode (diff + assistant note, review-before-apply required) and applied
  only on explicit confirm as ONE `applyAll` (one undo step). No
  provider registered → the feature is hidden entirely (the standalone
  site registers none).

**Host-injection points** (the component API surface — first-class from
day one, because the standalone app is just one host): engine transport
(the WASM bundle), persistence hooks (load/save), asset & font sources,
the message catalog (chrome i18n), the preset source, the
**subscriber-style hook registry** (`ShojikuGui.hook(…)` — the shipped
integrator extension surface over an append-only event table:
`init:fonts` / `init:presets` notification events with collecting
contexts, plus the persistence provider events; taxonomy, kinds,
deprecation metadata and guards in
[designer-hooks.md](../designer-hooks.md); the component itself never
reads the registry — hosts compose collected contributions into these
same injection points), the **theme seam**
(a theme = a token set: the `colorScheme` prop picks the built-in
light/dark chrome set, an optional `theme` token-override prop adjusts
it; no theming engine — and the `--sj-*` custom properties are an
INTERNAL value source, not a host-facing contract, since the Designer
ships as an app/own-page mount, never into a host page's DOM), and
`onChange`/`onSave` callbacks handing back YAML text.

**MVP cut:** open into the locale-keyed **preset catalog**
(`Accept-Language` auto-select, user-overridable; Japan → rirekisho /
genkoyoshi horizontal·vertical / receipt, reusing the bundled examples — plus a
per-locale blank preset for zero-based authoring) → **select on
canvas + property-panel editing** (style picker from the `styles`
registry, format-variant name list, box numerics, flow-item reorder,
duplicate, and the menubar's Insert menu placing typed default snippets —
text / rect / QR code, plus a container scaffold picked from an n×m
trace grid (one row → flex row, one column → flex column, 2D → grid;
placeholder text slots; edited afterward through the placement tab's
parent-first layout controls: direction / gap / alignment / ratio / add-slot, and
for a grid the column/row steppers — one batch per change, a content-dropping
shrink confirms first; picking while an untouched placeholder slot is
selected replaces that slot in place, previewed in the picker; a
right-click wrap-in-container — also a keyboard-reachable placement-tab
action — wraps a single item in a new column container) —
into the selected container or after the
selected item; a blank body shows guidance with an insert CTA; a single
selected node can be SAVED as a named **reusable block** — the serialized
node snippet, the same value `insertItem` takes — from a right-click
"save as block…" or the Insert menu, then re-inserted from the menu's
reusable-blocks group via a plain `insertItem` (AI parity), with a manage
dialog for two-step deletion; the library is APP-GLOBAL (cross-document,
host-persisted through the `blocks`/`onBlocksChange` seam — the standalone
app backs it with a single-key localStorage store), distinct from the
per-document draft) plus the
slim toolbar's **selection-context format cluster** (font
family/size, bold/italic, alignment, and a color picker — swatches +
a native custom picker, no hand-typed hex — for the selected text/rect,
and a named-style picker stating each style's document-wide usage count
before it applies; every write reuses the same panel ops) → live
preview (debounced WASM validate/prepare
per edit) → export. **Undo/redo and validate-before-save are
MVP-mandatory**; diagnostics highlight their target on canvas via the
box index `path`s. Absolute drag/resize shipped after the MVP (see
Workspace/toolchain below), and the binding UX followed: the data-key
field picker, palette→canvas drag-to-bind, and interpolation-aware
usage counting (details in § Workspace / toolchain).

**Preset distribution (decided):** the bundled presets (derived at
build time from `examples/<bucket>/<name>/preset.yml`) are the **canonical core
set**, and a **fetched catalog supplements them** for additions beyond
the core — both forms are part of the design, the bundled set is never
replaced by the fetch. The fetch mechanism (catalog source, integrity
verification, browse/fetch UI) is unbuilt.

**Product story (decided):** the AI-agent authoring workflow (MCP/CLI +
the template-author playbook) leads the product story — the README
pitches agents first; the Designer (hosted at
shojiku.kengos.jp/designer) is the second entrance and carries the
non-engineer story.

**Non-goals (v1):** SaaS/accounts, font-upload UI (the user's OWN font
files — distinct from the shipped Google-Fonts catalog picker, which
installs catalog fonts by pinned reference), in-GUI AI review — an AI
CRITIQUING the document (a review/lint pane written by a model; the
decided AI copilot is the opposite direction: the AI proposes ops and
the HUMAN reviews them before apply — the **AI copilot (op output)**
entry above), Workers-side preview. (A definitions editor was a v1 non-goal until the
data-item editor shipped it; field-KEY rename and field delete remain
out of scope.)

**GUI i18n:** chrome strings and diagnostic message templates live in a
per-language catalog (one module per language, each a flat `key → string`
table). The requested locale is a **full BCP 47 tag** (`ja-JP`,
`zh-Hant-TW`, `en-AU`); it resolves to an ordered language chain ending at
English, and rendering walks the chain **per key** so a regional or
partial catalog only carries the keys where it differs. Shipped languages:
en + ja + Traditional/Simplified Chinese full, Hindi + Filipino chrome-only (diagnostics
fall through to English). Diagnostics render from `code` + typed `args`
(the engine never translates); an unknown/hostile tag degrades to English
without throwing. A separate endonym-labeled locale registry seeds each
locale's region-preferred page sizes (consumed by the shipped page-setup
surface via `localeInfo(tag)`).

## Responsibilities

```text
definitions
  -> Field Palette
  -> Canvas selection (+ flow/flex drag reorder; absolute drag/resize)
  -> Property Panel
  -> Template
  -> Preview
  -> Diagnostics
```

- **Field Palette** is generated from `definitions` (grouped, searchable,
  typed, with sample values and "used in template" indicators).
- **Canvas** renders page/section boundaries and previews flow/table
  page-break behavior — it edits the same `templates` model the engine
  consumes, not a private representation that gets translated later. The
  canvas is the *selection/inspection* surface plus direct manipulation
  where the document decides position: order-placed children drag to
  REORDER (flow/flex, shipped), absolutely placed items drag to MOVE
  and resize by handles with grid/guide snapping (shipped), and a
  canvas-local multi-selection (shift-click / rubber-band) drives align
  (edge/center) and equal-gap distribute over the movable subset, each
  one transactional batch (shipped); other edits go through the Property
  Panel as `designer-core` patch ops. Rulers come later.
- **Property Panel** exposes data binding, format selection (type-dependent:
  datetime/currency/quantity variants), style, box, layout mode, page break
  behavior, visibility conditions, and signature field settings.
  It holds the style keys it edits, their enum vocabularies and the engine
  default values as GUI-side data, and those tables are **hand-copied from
  the engine today with no gate asserting the sets match**. The catalog
  artifact now exists (`agents/engine.md` § The key catalog) — what is
  still missing is this side: the tables are to be asserted
  against it rather than maintained beside it. The panel may edit a deliberate SUBSET,
  but every key and value it does carry must be one the parser accepts,
  and a spelling the engine has retired must fail a gate rather than
  survive as a control that writes an unparseable document.
- **Diagnostics** surfaces engine-produced diagnostics (missing data, unknown
  key, unsupported format, overflow, missing font/image, page-break
  warnings, accessibility warnings) — the GUI displays these, it does not
  invent its own separate validation logic that can drift from the engine.
  A diagnostic whose fix is MECHANICAL carries a one-click fix action
  (shipped): a code-keyed registry maps the diagnostic to a LIST of candidate
  resolutions, each an op batch applied as one `applyAll` (one undo step, AI
  parity). One candidate renders as one button; two render as two, side by
  side. A candidate is offered only when it has something concrete to do — no
  dead buttons.
  - **Removals** (the button says only the action, since the message already
    says what goes away): `orientation_ignored`, `ignored_column_key`,
    `grid_key_ignored`, `layout_key_on_leaf`, `table_pagination_key_ignored`,
    `shape_style_ignored`, `ignored_span_style`, and `unused_binding` — the
    one entry whose diagnostic path addresses the DECLARATION rather than the
    node the key hangs off, so the item path is derived.
  - **A choice**: `image_source_conflict` offers two candidates, labelled by
    what SURVIVES (`keep src` / `keep data`), never by what is dropped.
  - **Value rewrites**, where the value is the decision and the button
    therefore NAMES it: the four missing-size codes (`rect_`/`image_`/`qr_`/
    `mark_missing_size`) author the absent dimension(s) only, and
    `flow_item_overflow` / `sheet_overflow` / `child_overflow` shrink `box.w`
    by exactly the reported excess. `flex_row_overflow` is deliberately
    excluded: it reports a ROW's children collectively needing more room, so
    there is no single width to shrink.

## Boundary: GUI never renders PDF itself

Preview always calls the engine — via local CLI, a server preview API, a
WASM build, or a Cloudflare Worker preview. This guarantees GUI preview and
production render are pixel-identical in behavior. If a preview looks wrong
but production render is "actually fine" (or vice versa), that is a bug in
how the GUI is calling the engine, not a reason to add a parallel rendering
path in the GUI.

Preview transport v1 is **browser WASM** (decided, shipped): the Designer
is a static app whose preview renders client-side, so Cloudflare Pages
deploy and standalone use both hold, and the render path stays
network-free after load. The production bindings are `engine/wasm` (crate
`shojiku-wasm`) — the third thin host over `engine/authoring`; the JS
surface is a session object with JSON-string ops (validate / render /
capabilities mirroring the CLI/MCP JSON), bytes-first injected
fonts/assets/locale packs, and a three-part render bundle (raw-RGBA or
PNG pages + inspect envelope + diagnostics), and — since the PDF backend
joined that build — a `renderPdf` op returning the REAL deliverable's
bytes. That does not weaken this boundary: the GUI still renders nothing
itself, it asks the ENGINE for the PDF and shows those bytes in the
browser's own viewer, so what a user previews, downloads, and what the
CLI writes are the same bytes (pinned by a byte-comparison against a
committed example output). Details + the size budget
are in the [decision log](../engine/features.md#decision-log).

## What the GUI produces (and doesn't)

```text
GUI
  -> templates.yml
  -> definitions.yml
  -> sample params
  -> engine preview API calls
```

It does not render PDFs, does not own the layout algorithm, and does not
own formatting logic (it calls the engine's `formatter`/`diagnostics` APIs
and renders their output). It can now hand the user a PDF — the engine's
bytes, unmodified, through the host's download seam — which is the same
relationship it has always had to preview pixels.

## Workspace / toolchain (implemented)

The `gui/` pnpm workspace, the headless `designer-core` document model,
the `designer` component's canvas MVP (the engine-transport seam, the
debounced preview loop, and the box-overlay/selection surface), the
property-panel + diagnostics loop, and the **`designer-app` standalone
shell** (the MVP author→preview→export loop; see below) are built. The
property-panel + diagnostics work shipped: named ops
that address a leaf by a `path` + a map-key `keys` path (auto-creating /
pruning intermediate maps) plus `setStrings` and a transactional
`applyAll`; the property panel (content text/data binding, style +
`styleNames` registry picker, the localized format picker (registry
names + type-aware suggestions with live samples; the original registry
datalist became its expert free-entry path), box numerics),
each edit a named op; the diagnostics panel rendering `code` + typed
`args` through a **per-language catalog resolved from a BCP 47 tag** (an
in-repo `formatMessage` subset, no dependency; the English entries
verbatim from the engine templates, the engine `message` the fallback,
`origin` never shown; shipped en/ja/zh-TW/zh-CN full + hi/fil chrome-only,
per-key fallback to English), a
`path`-carrying diagnostic reusing selection to highlight on canvas;
undo/redo (buttons + ⌘/Ctrl+Z) and **validate-before-save, fail-closed**
(a fresh engine `validate` at save time — errors block, warnings pass, a
throw/reject blocks). The **page-setup surface** (in the fullscreen
document-settings view) edits the top-level `page:` map — a size select
leading with the locale registry's region-preferred order, then the full
engine-named list, then a custom `{ w, h }` composed from NUMBER inputs +
a UNIT select (the GUI composes the wire length string and parses none),
an orientation select, and a live proportional thumbnail (chrome — it
draws the input values, never document content). It rides an OPTIONAL
`path` on `setScalar`/`setStrings`/`removeKey` (absent = the document
root, reaching `page.*` which the structural grammar cannot spell), and
the canvas grew deselection (empty-overlay click + window-level Escape,
editable-guarded) so the surface is reachable. The named sizes' pt
dimensions + custom unit composition are pinned against the real engine
in the wasm integration test. The rich format picker (engine-rendered
samples, merged variant list) stays on the `gui-enablers` discovery
surface.

The **document-defaults & styles-registry surface** shipped in the
document-settings view (below page setup): a
**document-defaults** surface editing `defaults:` — a `defaults.locale`
picker (the endonym registry's tags as a datalist) carrying a hint that
the preview does NOT follow it (the WASM host sets the engine locale
explicitly at preset-open, so the key is only the CLI/MCP render
fallback), a `defaults.currency` picker (curated ISO 4217 codes), and a
`defaults.style` editor over the INHERITED subset of the style fields
(the cascade root only makes sense for inherited properties;
`backgroundColor` is excluded). Locale/currency gate on
`template.defaults.document`, the style editor on `template.defaults`. A
**styles-registry** surface does full `styles:` CRUD — a unified Create/Update form (a modal
carrying the name AND the style fields together, one `applyAll` = one
undo step; an existing style's name is read-only there, since rename
rewrites references), inline rename, and a two-step delete confirm
showing the impact count first (an unused style deletes immediately). A rename/delete rewrites EVERY `styleNames` /
`alternateStyleNames` reference transactionally (one `applyAll` = one
undo step), so the registry and its references never drift; it is refused
whole — never partially applied — when the shared usage walk truncated
(a partial index would half-rename), a reference path is non-addressable
(a hostile `.`/`[`-bearing map key would mis-address), or the batch would
exceed the op cap, each surfacing a localized notice. Two `designer-core`
ops were added for this: **`renameKey`** (replaces a map key's scalar in
place — value node, position, and comments preserved) and **`putValue`**
(the map-key twin of `insertItem`, setting a JSON-shaped value validated
by the same snippet caps — the create-empty-style form). The styles
usage walk (`styles/usage.ts`) now returns structured, op-addressable
references (map path + wire key + name list + an addressability flag) plus
a truncation flag, replacing the earlier synthesized display paths. Real
en-US engine tests pin that a rename/delete leaves no
`undefined_style_name` and that a `defaults.style` edit re-renders
cleanly. The apply-time style picker (slim toolbar) renders each entry's
name in a **chrome approximation of its own style** (size/weight/color on
a fixed paper tint, both themes — a preview, never an engine render), so
choosing is visual not name-guessing; and the blank presets (all locales)
plus the invoice/receipt/certificate examples ship a curated
**primitive-style ramp** (heading/body/caption class, names localized
per preset, unused so rendered output is byte-unchanged) so the picker is
populated from a blank start. The picker also carries the **selection→style
capture/update** bridge (gdoc-style): a tail row saves the selection's
explicit inline `style:` props as a new named style — one transactional
batch that registers the entry, appends the name last (so the cascade keeps
the look), and strips the now-redundant inline props (one undo step) — and,
when the item applies a real style, a second row updates that entry to match
the selection's drift (per-prop writes, so the entry's non-style-field props
survive byte-intact), showing the impact count before applying. Both open a
modal over `ui/Modal` that captures only string/number scalars (a per-side
border map stays inline) and renders every document value as escaped text.
Deferred to a **second phase (user decision)**: `defaults.formats`
(per-type format defaults) and the named `formats:` registry — pattern
editing must not become a free-typing surface, so it needs its own picker
design.

The **`designer-app` standalone shell** is the MVP author→preview→export
loop and the first shipping form: a locale-keyed **preset catalog**
(auto-detected from `navigator.languages`, user-overridable) opening into
the embedded `Designer`. It is deliberately ONE host of the component —
every browser concern (asset fetch, engine transport, persistence, file
open/download, locale) is an injected service, so the app modules are pure
and carry the 100%×4 gate; only the browser-entry group (`src/main.tsx`
+ `src/browser/`, the wiring of the real browser globals) is
coverage-excluded. Presets are the bundled `examples/` that carry a
`preset.yml` manifest (locale tags + `engineLocale` + localized name +
thumbnail); the catalog is **strictly per-locale** (a vertical genkoyoshi
never surfaces for en-US) and derived at build time by globbing those
manifests. A preset's bundled images (`examples/<bucket>/<name>/assets/`,
referenced as `assets/<name>`) are copied by the assembly, listed on
the catalog entry, and fetched + injected into the freshly booted
engine at preset-open (`addAssetFile` — the session retains them across
renders), so image-bearing presets preview correctly. The engine is booted **per preset-open** keyed on the preset's
`engineLocale`, so switching the UI locale never strands the engine on the
wrong font packs; the **fetch→inject→reload lazy font loop** rides the
shipped subset seam (`loadFontsSubset` returns the absent heavy packs; a
`missing_glyph` OR an `unknown_font_family` diagnostic triggers a
single-flight background fetch that re-injects the FULL pack set — the
engine consumes injected packs on each load — and swaps the transport
identity so the preview upgrades without user action). The
`unknown_font_family` arm is what makes a preset that AUTHORS a lazy-tier
`fontFamily` (genkoyoshi's `ipamj-mincho`) upgrade at all: absent at boot,
its glyphs come from a fallback face, so no `missing_glyph` ever fires.
The deploy artifact is a static `dist/` (Vite build + a site-assembly step
that chunks any font face over the 25 MiB Cloudflare Pages file cap into
`.partNN` pieces the app reassembles); `public/_headers` sets a same-origin
CSP. The lazy loop is pinned against the real engine in a node integration
test, and a `make gui-e2e` Playwright golden path exercises the browser
loop.

The **first-load experience** shipped as **catalog-first boot**: the engine
module is the largest single thing the app downloads and the catalog needs
none of it, so `main.tsx` STARTS the module fetch and never awaits it before
the first render — the await moved into `prepareEngine`, i.e. the first
preset open. What the user sees instead of a blank page: an inline static
splash in `index.html` (before any module, stylesheet or token resolves, so
its few colours are literals mirroring the theme's), then the catalog with
the module transfer reported around it (a hairline rail under the header
plus a muted header status, both silent once it lands), and — on opening a
preset — a staged panel naming which document is opening and which of three
stages it is on (engine → fonts → preview) with byte progress on the active
transfer. Two rules the surface must keep: a transfer with no usable
`Content-Length` degrades to an INDETERMINATE bar rather than inventing a
number (everything unusable — absent, non-numeric, negative, over the
safe-integer range — is treated as no total, and a body that outruns its
declared length tops out at 100%), and a refusal is stated with its remedy
rather than left spinning, which is why the module load has a terminal
`failed` state at all and why the standalone open flow catches. Byte totals
for the font stage come from the assembled font INDEX, derived before the
first fetch so the reported ratio is monotonic. Since the module's
capability list is no longer known at boot, the Google-Fonts loader is
handed to every editor unconditionally and the picker's capability gate
rides `prep.fonts` alone (the per-engine `pickerCapable` check) — the gate
is unchanged, only its single source moved. The wasm size budget was raised
in the same change (gzip 3MB / raw 8MiB, user-directed) because the loading
experience is what buys that tolerance; the causality is recorded above
`WASM_MAX_GZIP` in the `Makefile`, which is also where the standing rule
lives (feature growth earns a bump, a dep balloon does not).

The **Google-Fonts catalog picker** shipped on top: an editor-toolbar
modal (search + writing-system filter + real-font specimen samples +
the licence spelled out) over a checked-in catalog snapshot — static
OFL/Apache families from google/fonts at one pinned commit, generated
by `scripts/gen-font-catalog.py` with no API key. A pick fetches the
static ttf (runtime origin allowlist + size caps), pins its sha256
(hashed browser-side over the exact injected bytes), generates the pack
`manifest.yml` with per-face `url:` pins via the YAML serializer,
extends the locale overlay's `fonts.uses`, and hot-reloads the store so
the preview renders the font immediately; the property panel's
fontFamily field gains the picked families as datalist suggestions
(picking beats typing an id). Export becomes a store-only ZIP kit
(template + manifest + verbatim licence text + overlay + README) that
renders on a fresh machine through the CLI's pinned-face auto-fetch;
drafts persist manifests only and re-fetch bytes through the engine's
`fontFacesNeeded` pins on reload. The picker is feature-gated on the
`fonts.face.url` + `wasm.fonts.faces` capability keys and hidden
without them. Everything is pinned against the real engine in a node
integration test, including the trap this design exists to avoid: a
picked font must survive the lazy `missing_glyph` upgrade's full
re-inject (the loader's pack list is read live, never snapshotted at
boot).

The **GUI foundation (design tokens + default theme)** shipped: the chrome's
styling substrate is a data-first token set (`designer`'s `theme/tokens.ts`
— light + dark sets with an identical key list, WCAG-AA-pinned pairings)
resolved by pure functions (`resolveTheme(scheme, override)` with a
value guard on host overrides; `cssVars` → the **`--sj-*` custom
properties, now the INTERNAL styling value source** — host theming is
de-scoped) and applied on `document.documentElement` (so portaled
Headless UI overlays resolve them; the shell/component mount under the
`.sj-app` / `.sj-designer` root classes). Presentation is plain Tailwind
utilities riding the framework's stock scales — the `--sj-*` colors are
bridged into utilities via `@theme inline`; only the irreducible SVG
canvas paint + chip editor stay hand-CSS in `styles.css`. CSS posture:
[`../../gui/STYLE.md`](../../gui/STYLE.md). The default look is
the sumi-and-vermilion theme (warm-paper chrome, sumi-ink text, vermilion accent, 6px radius);
**dark mode is chrome-only — the canvas paper is engine-rendered pixels
and stays white**. The component takes the RESOLVED `colorScheme`
('light'/'dark'; it never reads the OS preference); the app resolves an
'auto'/'light'/'dark' preference over injected matchMedia, persists it
beside the locale override, and offers it (with the language control) as
a right-aligned icon menu in the app header.

The **Field Palette** shipped: the PM's read-only view of the
engineer's `definitions.yml`, rendered as the sidebar's data tab
whenever the `Designer`'s existing `definitions` prop is present
(no new injection point was needed — the prop already fed
validate/render, and `designer-app` already wires it from the preset
files). A grouped, searchable panel lists every field with label, key,
localized type, description, sample value, and a **used-in-template
indicator** — a placement count correlated against the template's
`data.key` bindings (scalar keys at document scope; array properties
match `table`/`repeat`/`repeat_flow`/`list` sources by their dotted
path, their fields row-relative under that source, including table
columns and `cell:` sub-templates). Clicking a used field selects a bound item's structural
path on canvas (the ONE shared selection state, like the diagnostics
panel); repeated clicks cycle through all placements; an array property's
heading selects its source placements the same way. The palette
dispatches ZERO document ops (editing lives in the data-item editor,
never the palette), collects
correlation from the DOCUMENT text (pure functions in
`palette/model.ts` over designer-core's capped materialization — never
a parallel engine), and treats definitions content as untrusted:
hostile input degrades to an empty state, display is capped
(256 groups/fields, 120-char text clips), and binding-key lookups are
`Map`-based. The usage correlation ALSO counts `{key}` interpolations —
static text on text/QR items, link URLs on items and spans, and a
`list`'s per-entry text (entry-scoped under the list's source) — via a
pure TS mirror of the engine's segment parser (`text/interpolate.ts`:
same charsets, `{{` escape, malformed-stays-literal; plus a display-side
cap on expressions per text), so a field driven only through
interpolation never reads unused. A name a `bindings:` declaration
redirects is counted under the KEY it declares (and a document-scoped
one against top-level params, even from inside a row scope), so the
usage indicator stays honest when the chip editor authors declarations.

**Binding UX shipped on top of the palette model**: the property panel's
`data.key` edits through a **field picker** (search + label + localized
type + LIVE sample value from the active params, falling back to the
definitions `example`; free text entry stays — a key the definitions
don't declare surfaces as a validation warning, not a dead end).
The picker is scope-aware: an item inside a table column / repeat cell /
repeat_flow card offers that source's ROW-relative fields, plus a second
labeled section of DOCUMENT-scope fields — the engine's `scope: document`
escape, for a value that belongs to the whole document rather than the row.
Picking one authors the key and the scope as ONE undo step; going back to a
row field drops the scope again; typing a key never re-scopes what the file
already says. The closed control keeps a badge whenever the binding carries
`scope: document`, so an externally authored escape is readable without
opening the picker — reading is unconditional, only the offer (and thus
authoring) is gated on the `binding.scope` capability. A data-SOURCE picker
(a table's / list's own binding) gets the same treatment when the iterable
itself sits inside a row scope: every array group it can offer is top-level,
so picking one only resolves through the escape. A data-bound
`image` item edits its `data.key` through the same picker (the creation
path below ships with its editing path); a `src`-based image edits its
`fit` mode, its box, and a replace-source button that routes the same
image-import pipeline. **Palette→canvas drag-to-bind**: every field
(used or unused) drags onto the canvas and drops as a type-appropriate
bound item via ONE `insertItem` (string/number/… → a flow-auto-sized
`text` with `data.key`; an image field → a data-bound `image` with an
explicit box), at the flow-body slot under the pointer (the canvas DnD
substrate's slot math reused; non-flow bodies and geometry-less pages
append at the end; a drop outside every page is a no-op). A drop can also
target a SUB-TEMPLATE — a table column's `cell:`, a repeat cell, a
repeat_flow card — appending at its end, since a row fragment is one
authored sub-template drawn many times and there is no single slot to point
at; the indicator is an outline of every drawn fragment rather than a line.
What may land where follows the data: a document-scope field enters a cell
carrying `scope: document`, a row-relative field only enters a cell fed by
its OWN group (no scope authored — the row is already the ambient one), and
an array group's scaffold stays body-level. Every other combination paints
nothing and does nothing on release, the canvas-DnD refusal posture. **Interpolation
chips**: inside the shared text editor (the panel field AND the canvas
double-click overlay — one component), a `{key}` / `{key:format}`
expression renders as an atomic labeled chip (field label from the
binding-picker options, wire + sample as tooltip); chips are inserted
from an in-editor field picker, deleted atomically, and RE-PICKED in
place — clicking a chip selects it (a pill is `user-select: none`, so
the selection is its own, not the caret's) and a trigger naming the
bound field opens the same picker rows, swapping the binding while the
surrounding text and the expression's `:format` stay exactly as
authored. The chip layer
is display-only — the wire text underneath is untouched (serialization
is the identity for untouched content, and hand-typed raw syntax stays
the expert path, becoming a chip on the next open). The picker offers
what the bare `{key}` grammar cannot say by authoring a **named binding
declaration**: a field whose key falls outside the interpolation charset,
and — inside a table cell / repeat card — a document-scope field, both
insert as a chip over a declared ASCII name while the declaration carries
the real key and `scope`. A declaration is written ONLY where the bare
form falls short (minimal wire), the text and the declarations it
references commit as ONE batch (one undo step), deleting the chip removes
the declaration the same way — and so does re-picking its field, which
needs no mechanism of its own: the commit batch already drops a declared
name the old text referenced and the new one does not (unless another
surface of the item still does) — and the whole authoring half is gated on
`binding.declarations` — READING one always labels its chip, so an
externally authored document still says which field a chip stands for.

**Iterable scaffolds shipped on top of the same substrates**: the DATA
is the entry point for repeating elements. An array group drags from
its palette heading onto the canvas (dropping its default presentation
— a table; a field-less scalar array drops as a list), and the insert
menu's list-data entry opens a dialog choosing the source (an array
group, or — workshop-mode blank-start — a fresh inline spec of field
names + kinds) and the presentation (table / card / list). Either way
the result is ONE `insertItem` of an engine-canonical, probed
diagnostics-free snippet (`table` with one label+`data.key` column per
field, widths omitted for the engine's equal split; `repeat_flow` with
a bordered auto-height card of bound text lines; `list` interpolating
the first field, through a declared name when the key falls outside the
interpolation charset and — against an engine without `bindings:` — the
first charset-SAFE field instead, never composed from an unsafe key). Blank-start additionally generates 3 sample rows through
the sample-data `extendParams` API under the fresh key BEFORE the
preview renders (committed only if the insert succeeded), so the table
shows real rows immediately with no definitions required. Image-typed
fields stay out of scaffolds (the asset pipeline's turf), and the
scaffold field count is hostile-bounded. The property panel grows
**table column editing** — source rebinding, per-column label / binding
(row-scope picker) / width, add / remove / reorder, each ONE op — and a
canvas click on a `…columns[n]` cell opens that column's form instead
of the unsupported note. A selected `repeat_flow` / `list` gets a
data-source section (rebind the array; a list also edits its per-entry
text template, cleared = entries print directly) — every kind the
scaffold creates stays editable in the panel.

The **format toolbar shows cascade-EFFECTIVE values** (decided design
for the toggle-state-vs-effective-style question): B/I/align/family/
size/color reflect what the item actually renders with — own style →
named styles (later wins) → `container` ancestors (inherited keys) →
`defaults.style` — resolved GUI-side over the document by
`toolbar/cascade.ts` + `toolbar/effective.ts` (layer gathering and
per-key resolution — a bounded mirror of the engine cascade; swap the
pair out if inspect ever carries resolved style), with a "from style
『name』 / inherited / from defaults" origin hint on the control. Ops
stay minimal-wire: toggling toward a state the below-own cascade
already yields just REMOVES the own key; `normal` (or an explicit
alignment) is authored ONLY as a cascade override — the toolbar never
restates engine defaults into the wire.

The **border editor + swatch pickers** shipped (gdoc/Excel-style): an
Excel-style diagram whose four edges are click targets, plus a
width/color/line-style "pen" and all-sides/none presets — rendered in BOTH
the decoration-tab fill-and-border cluster AND a slim-toolbar border popover (one
shared component), on every boxed item (text/rect/container/table/image/
qr_code). It authors the engine's non-inherited `borderWidth`/
`borderColor`/`borderStyle` (scalar or per-side map) in the SIMPLEST
touched-keys-only form — all-equal → a bare scalar, a per-side edit of
an existing map → a targeted leaf op (untouched sides byte-exact), a
0-width override to turn off a style-inherited border — resolved
GUI-side by the dedicated map-aware `panel/borderModel` and authored by
`panel/borderOps` (the generic
`display()` cascade flattens a map to unset). Line style is solid/double
(the engine's set — solid / double / dashed / dotted, the patterned
pair gated on the engine advertising them); a `table` map
draws the outer frame only (noted in the editor). In the same pass,
`backgroundColor` fill and text color became **swatch pickers** (shared
`ui/ColorSwatchPicker` — curated swatches + a native custom picker, no
hand-typed hex), and the decoration tab's typography fields render for `text`
only (fixing the inert `shape_style_ignored` fields a `rect` used to
show). Capability-gated: the whole cluster on `style.border`, the
per-side matrix on `style.border.sides`, the line-style select on
`style.borderStyle`.

The **layer tree + breadcrumb + tabbed sidebar** shipped: the sidebar
became a tabbed frame (standard tablist semantics, designed once — the
layer tree always present, the Field Palette as the data tab iff
`definitions`; the sample-data panel joins as a tab later), and the
document outline is a first-class surface. The tree is built from the
DOCUMENT (pure walk in `tree/model.ts` over designer-core's capped
materialization — never the box index, so it stays correct when a
render fails) and mirrors the palette walk's descent
(items / columns + `cell.items` / `item.items`), so every row carries
the same structural path the box index and diagnostics use — table
internals are fully exposed (decided: two-way selection sync forces the
tree to cover every path other surfaces can select). Rows show a type
mark (a decorative SVG icon) + a content-derived label (clipped text → column label → binding
key → authored id → localized type name; unknown wire types verbatim).
Selection is two-way through the ONE shared path selection: row click
selects; a selection arriving from canvas/diagnostics/palette expands
its ancestors and scrolls the row into view. Rows drag-reorder within
their OWN parent sequence only (pointer-events list reorder with a
4px threshold, Escape cancels, drop-slot math pure and unit-tested;
Alt+↑/↓ is the keyboard equivalent) — every reorder is ONE `moveItem`
(AI parity, single undo step); cross-parent moves (reparenting) are
supported from NEITHER surface yet — an open question for the
direct-manipulation track. A breadcrumb bar above the canvas shows the selected node's
ancestor chain (crumb click = select that ancestor; constant height so
selecting never shifts the canvas). Hostile documents degrade, never
throw: depth cap 32, node budget 1024 with a localized truncation
notice, 60-char label clips, unparseable text → localized empty state
while the canvas keeps its last good preview.

**Canvas drag reorder (flow/flex)** shipped, and with it the canvas
DnD substrate later direct-manipulation work extends: a pure
slot/indicator model (`designer`'s `canvas/dnd.ts` — which boxes may
reorder, plus `canvas/dropPlan.ts` — the drop-slot midpoint rule over
the inspect geometry, the insertion-indicator line, the single
`moveItem` a drop realizes) and a
semantics-free pointer drag state machine (`canvas/useDrag.ts` —
4px threshold shared with the layer tree, guarded pointer capture,
capture-phase Escape cancel, trailing-click suppression). A flow-body
item or a flex-container child (never an absolutely placed one — a
child authoring `box.x`/`box.y` moves with the absolute track; grid
cells, `cell`/`item` sub-templates, and repeat fragments are excluded,
the last by a duplicated-index guard) drags to a highlighted insertion
slot along the container's document-declared axis
(flow → vertical; `box.direction: row` → horizontal), with a
pointer-following ghost; the drop emits ONE `moveItem` (AI parity,
single undo step), the selection travels with the moved item, and the
overlay recomputes all drag geometry from the CURRENT inspect boxes
every render, so a mid-drag edit degrades the drag to a visual no-op —
stale geometry never produces a move. Alt+↑/← and Alt+↓/→ on a
focused box are the keyboard equivalent. Same-parent reorder only, on
the page where the drag starts; the drag pipeline is pinned against
the real engine (plan a drop from real inspect geometry → apply → the
moved item's `id` lays out at the destination path).

**Absolute drag/resize + grid snap** shipped, extending the same DnD
substrate: an absolutely placed item — an absolute-body child, a
header/footer band item, or an `x`/`y`-authored container child —
drag-MOVES on canvas and resizes by 8 handles on the selected box,
committing rounded values in the AUTHORED form (a bare number commits
a 2dp pt number; a `"12mm"`-style absolute-unit string commits in that
unit at fixed per-unit precision — no float noise, the
template-engineer gate; `%`/`em`/`rem` positions refuse the drag and
stay panel-edited, and a handle touching a relative-authored key is
hidden while the others keep working). Every commit is a
changed-keys-only transactional `applyAll` batch (one undo step, AI
parity; a horizontal move never authors `y`), the selection travels to
the manipulated item, and plain arrow keys nudge by the grid step.
Snapping: an **editor-side base grid** (preset steps 1/2/4/6/8pt or
off, quantizing in authored space, painted as an SVG pattern when on,
persisted beside the theme/locale prefs — NEVER written into the
template; Alt bypasses) and **minimal smart guides** (edge/center
alignment against same-parent siblings, guide snap wins over grid).
The movability affordance is a **placement chip** in the canvas topbar
stating every selection's placement kind in user language (absolute /
flow / header placement …) — and a drag attempt on a fixed box (grid cells,
repeat/table sub-templates, `line`/`page_break`, relative-unit
positions) emphasizes the chip with the WHY instead of doing nothing
(`<output>` live region). Flow children never get move handles (their
position is engine-resolved). The pure models
(`canvas/manipulate.ts` classification, `canvas/plan*.ts` plan math,
`guides.ts` / `lengths.ts`) work over the document and inspect geometry,
recomputed per render — a mid-drag edit degrades to a visual no-op;
the whole pipeline is pinned against the real engine (move, resize,
and an mm-authored drag whose diff touches only the dragged keys).

The **placement mode (auto/fixed)** shipped in the placement tab, killing the
blank-coordinate NG: a pure placement model (`panel/placementModel.ts`)
classifies every selected item by the ENGINE participation rule — a
container child (flex or grid) is `pinnable` (the only context where
Auto and fixed both exist in the wire: authoring `box.x`/`box.y` is the
absolute escape hatch), a flow-body child is `flow` (y is always
engine-owned; no toggle is offered because pinning is impossible), a
band / absolute-body child is `coordinate` (always coordinate-placed,
a static caption states the top-left origin), and sub-templates /
`line` / hostile documents stay `plain` (untouched flat fields, never a
throw). A container child gets a native-radio segmented toggle
(`ui/Segmented.tsx` — fieldset + sr-only radios, reusable): in auto the
x/y render as read-only displays with an "auto" tag showing exactly
the parent-content-relative values fixed mode would author (margin-adjusted,
`formatLength` rounding), so the toggle never changes the numbers;
switching to fixed writes BOTH `box.x`/`box.y` in one `applyAll` batch
(one undo step, AI parity) and the item does not move (pinned against
the real engine both directions); switching back removes only the
PRESENT keys and the item reflows. Pins are refused — the fixed option
disabled with a why-tooltip — while no fresh inspect backs them (the
preview reducer's revision correlation; stale geometry never authors a
coordinate — though the read-only displays and size seeds keep showing
the LAST-GOOD values through a render cycle, the canvas posture, so
field types never flap mid-render), when the parent box is missing, or
when a margin is not pt-resolvable (`%`-style; `auto` margins resolve
to 0 once pinned — proven against the real engine — so they pin fine). Unset w/h StepperFields seed with the
resolved border-box size (dimmed + auto tag, identity with authored
space) and commit only on a CHANGE — a tab-through authors nothing;
an empty commit clears back to the resolved display. The mode hints
are plain-language chrome keys (`panel.placement.*`, all six catalogs)
written to double as tutorial copy.

The **mounted host** shipped as a mode of the same `designer-app`
build (not a sibling package): asset URLs are relative (Vite
`base: './'`), and at boot the app fetches `config.json` beside
`index.html` — absent/invalid → the standalone preset catalog; a valid
`{ persistence: { kind: 'http', base } }` (same-origin base only) →
the app opens into the host's **project list** (projects → templates →
editor) and saves through the documented JSON contract
([designer-mount.md](../designer-mount.md)): a project = read-only
`definitions` (the Field Palette) + PM-edited templates, each template
document carrying `source` / optional preview `params` / the
picked-font pins / an opaque `rev` token (last-write-wins by default,
`409` → a localized conflict banner). The persistence seam is a pair of
provider interfaces (`TemplateStore`, `ProjectSource`) whose operation
names ARE the subscriber-style hook registry's provider-kind events
(`save:template`, `list:projects`, … — the recorded convergence,
shipped: the seam types live in the registry module and the app derives
its remote services by resolving those events, so an integrator host
can register its own providers); localStorage drafts are the local
`TemplateStore` implementation and keep working as crash-recovery
working copies in both modes (an explicit mounted save clears the
redundant local copy). Every host response is treated as untrusted
input (field-level runtime guards, size caps, id charset checks before
URL composition); the client never composes or stores credentials —
auth rides the host session through the proxy.

Decisions made and recorded here:

- **Lint/format stack: Biome** (a single tool replacing ESLint + Prettier),
  chosen over the ESLint+Prettier pair to minimize the dependency/supply-chain
  surface — one binary, no plugin graph. `biome check` gates format + lint
  together, zero-diagnostics.
- **Package manager: pnpm 11** (workspace), Node 24 LTS, both pinned
  (`packageManager`, `engines`, and the Docker image pins — Makefile `NODE_IMAGE`, the designer-app Dockerfile, the devcontainer). `pnpm-lock.yaml` is committed
  (it is not matched by the global `*.lock` ignore, so no `-f` needed).
- **All gates run in Docker via `make gui`** (typecheck + Biome + Vitest
  coverage), and `make gui` is part of `make verify` — the host has no Node
  toolchain, mirroring the Rust/wasm gates. Its one host-side step runs
  FIRST and needs no toolchain: the per-file line budget (below).
- **File and function length are both gated, RuboCop-style** (rule on,
  explicit waiver list, burn it down). Per FILE: `make gui-budget`
  (`scripts/check-gui-line-budget.sh`, pure POSIX sh + awk) caps every
  non-test `.ts`/`.tsx` under `gui/` at **150 executable lines** — blank
  lines and comments (`//`, `/* … */`, JSX `{/* … */}`) do not count, so
  documenting a file never costs budget, and the cap cannot be met by
  compressing statements onto fewer lines. A file over the cap needs an
  in-file `line-budget-exempt: <reason>` comment (the same token the
  engine budget uses, so one grep finds every waiver in the repo); the
  standing waivers are exactly the DATA tables where splitting adds no
  cohesion (the six i18n catalogs, the icon set, the tutorial course
  table) — the burn-down list is empty: every other over-cap file has
  been split. Per FUNCTION: Biome's
  `complexity/noExcessiveLinesPerFunction` at 150 (`skipBlankLines`),
  test files and `e2e/` excluded — that rule carries NO waiver list.
- **A seam is picked for COHESION, never to buy the neighbour
  headroom** (user direction, and it OVERRIDES "just get under the cap"):
  the cap is a design-smell detector, not a budget. A file that exists
  only so a sibling fits is forbidden — the standing counter-example is a
  14-line props leaf with ONE consumer, since the module it was modelled
  on earns its file on SIX. Copy a precedent's REASON (its consumer
  count), never its shape. When a genuinely cohesive unit will not fit,
  the IMPLEMENTATION is what is wrong: it is carrying too much, and the
  remedy is the nesting context object / grouped-props bundle below —
  not a raised cap and not a waiver. Seams that have worked repeatedly:
  READ apart from WRITE; what each half can be REFUSED BY; what a thing
  IS apart from what it SHOWS; a shell plus one module per control
  cluster; and — for a hook — the state machine apart from the pure model
  it decides with. Measure with the gate's own counter after EACH
  extraction (the traps live in
  [gotchas/gui-toolchain.md](gotchas/gui-toolchain.md)).
- **Three wide prop lists are NOT offenders and must not be "fixed"**:
  `designer/src/props.ts` (the host-injection surface — a deliberately
  wide public API), the `editorProps.ts` pair (shared vocabulary), and
  `BoxOverlayProps` (re-exported from the package index, so re-bundling
  it is a host-facing API break). The smell is a flat scatter of loose
  values, not the number alone.
- **The DEFAULT construction form is a nesting context object — build
  new code that way from the start, not as a later remedy** (user
  direction: assume everything grows). Inputs arrive as a small number
  of named typed BUNDLES; a bundle's direct properties stay few because
  each is itself a bundle; and the functions that operate on a bundle
  hang off it rather than being free functions the caller must thread
  separately. `usePaletteDrag`'s `PaletteDragWiring` is the best-formed
  example already in the tree — it carries its own `pageSvgRef`/
  `pageHitAt` and nests `paletteDrag: PaletteDragHandlers` inside
  itself. The construction idiom is the `<X>Options` → `<X>` hook pair
  (`useDocViews(options: DocViewsOptions): DocViews`), the React-shaped
  `cascadeContext(args) → CascadeContext` (`toolbar/cascade.ts`: a
  builder gathers the layers ONCE, the resolvers take it first).
  **Where the rule bites**: a component whose inputs span more than one
  concern, or a hook returning several related values. A leaf
  presentational component with a couple of props stays plain — bundling
  `Caret`'s inputs would cost clarity, not buy it.
- **The cap is a design-smell detector, and the cap always wins** (user
  direction). Split seams are chosen for COHESION, never to buy a
  neighbour headroom — a file that exists only so another file fits is
  the failure mode this rule names. When a genuinely cohesive unit will
  not fit, the implementation is what is wrong: it threads too much, and
  the fix is the bundling above, not a raised cap or a waiver. A flat
  scatter of loose props is the shape that gets there — it reads fine at
  eight and was a 37-prop shell by the time anyone noticed, which is why
  the bundle is the default rather than the repair. Line count falls out
  of doing this; it is not the reason to do it.
- **Two different "context" mechanisms, and which one applies is
  decided by what the value IS.** React's `createContext` is reserved
  for STABLE host-injected dependencies that do not change per render —
  today exactly two: the i18n catalog/locale (`i18n/context.tsx`) and
  the engine transport (`preview/context.tsx`). Everything that flows
  with the document or editor state stays an explicit prop, grouped
  into plain context objects per the rule above. Putting churning state
  (preview geometry, selection) behind a Provider would re-render every
  consumer and would move the host-injection contract off the props
  interface, which is where this document defines it.
- **`designer-core` is pure TS** (no React): the template held as an
  `eemeli/yaml` CST `Document`, edits expressed only as named patch operations
  (`setScalar` / `setStrings` / `removeKey` / `moveItem` / `duplicateItem` /
  `insertItem` / `removeItem`,
  the scalar/strings/remove-key ops taking an OPTIONAL `path` — absent reaches
  the document root map; `insertItem` takes its subtree as a plain
  JSON-shaped value composed into the CST — never YAML text, so no second
  grammar and no alias surface — capped in depth and node count), an undo/redo
  history (text snapshots v1), and selection state keyed by the engine's
  box-index `path` grammar. `designer` carries the canvas MVP;
  `designer-app` is the standalone shell (the MVP author→preview→export
  loop, described above).
- **Bundler: Vite** (`designer-app` only; `+ @vitejs/plugin-react`,
  exact-pinned) — the one bundler in the workspace, chosen for its
  esbuild/Vitest alignment and verbatim `public/` asset copying. The
  wasm pkg, font packs, and presets are NOT bundled; they are copied into
  `dist/data/` by the site-assembly step and fetched at runtime, so the
  gitignored `pkg` is never a static import. The assembly script runs
  under node type stripping, hence its `.ts` runtime imports +
  `allowImportingTsExtensions` in the app tsconfig.
- **Preset = bundled example + `preset.yml` manifest beside it** (decided
  against a dedicated `presets/` tree): a preset is Designer content, a
  pack is engine data — but a preset reuses the example the determinism
  gate already covers, and a demo without a manifest is excluded from the
  catalog. The zh receipt presets land the same way.
- **The blank preset is per-locale** (superseded the single `blank-a4`
  with en+ja tags): each catalog locale opens a blank page at ITS standard page
  size — a Letter page for en-US/en-CA/en-PH/fil-PH, an A4 page
  elsewhere — with `defaults.locale` set to the locale's engine locale.
  One bundled `blank-*` example per (size × engine locale) carries the
  region-qualified catalog tags; the size↔locale knowledge is the ONE
  registry `LOCALES` (`gui/designer/src/i18n/locales.ts`), whose new
  `engineLocale` field names the engine-resolvable tag (a formatter
  builtin ja-JP/en-US or a shipped `packs/locale` pack — regional English
  tags with neither map to en-US). Decided against an assembly-time
  manifest expansion (the generated templates would not be real committed
  examples) and against a runtime `defaults.locale` injection (it would
  break opened-source identity). `defaults` stays lean — `locale` only,
  no `currency`.
- **Round-trip fidelity is at eemeli's canonical-CST level**: comments and key
  order are preserved, but flow collections are re-emitted in the library's
  canonical spacing (`[heading]` → `[ heading ]`) on the first write.
- **One canonical serializer, `designer-core`'s `serializeTemplate(doc)`**:
  the single serialization home the Designer writes through (snapshots, saves,
  preset normalization) — never `String(doc)` directly. It disables line
  folding (`doc.toString({ lineWidth: 0 })`) so hand-authored long lines
  survive a round-trip; the `eemeli/yaml` default folds at 80 columns, which
  would rewrite large templates (the layout-showcase preset by ~950 lines) on
  the first write. The form it emits is a fixed point:
  `serializeTemplate(parseTemplate(s)) === s` once `s` is canonical.
- **Bundled presets are stored at that fixed point**, so a template-engineer's
  first-edit diff shows only the keys they touched (the adoption gate). This
  is enforced permanently, not once: `pnpm --filter @shojiku/designer-core
  normalize:examples` rewrites every `examples/*/*/templates.yml` to the fixed
  point, and the `designer-core` round-trip suite globs them and asserts
  `serialize(parse(src)) === src` — so a new or edited example that skips
  normalization reds `make gui`. Normalization is semantics-neutral (only flow
  spacing / blank-line runs change), so `make examples-check` stays byte-green.

## Designer chrome redesign (shipped)

The accumulated chrome was judged "hard to operate intuitively" at a user
review; a full design pass (two chrome-skeleton mockups + per-part
mockups, user-reviewed) settled the following, and the implementation
track (stacked PRs on a long-lived feature branch) has fully merged.
This section is the decision record; the file-level truth is the code
map ([gui-designer](../code-map/gui-designer.md) /
[gui-app](../code-map/gui-app.md)).

- **Chrome idiom: Google-Docs-style** (chosen over a Word-ribbon
  counter-proposal): a flat menubar (File / Edit / Insert / Format /
  Data / View / Help) + a title bar (document name, save state — a component
  surface a simple embedding host uses; the standalone app instead
  carries the name + save state in its OWN gdoc-style header, so the
  component title bar renders nothing there) + ONE slim
  icon toolbar that absorbs the selection-context format toolbar
  (undo/redo, zoom, insert, format controls, grid/sample selects, the
  template-size indicator). The breadcrumb + placement chip row and
  the bottom diagnostics strip stay. The rejected ribbon's cost: ~90px
  of always-on vertical chrome.
- **The menubar lives in the `designer` component**, not the app: the
  app header's file actions (back/open/export/add-font) move into the
  menubar through a TYPED host-injected menu-action seam (existing
  host callbacks re-wired; menu items dispatch existing ops/host
  callbacks only — no new document state, so AI parity holds).
  Host-supplied menu entries are UNTRUSTED host input like every host
  response: labels/ids validated, rendered as text only. Every
  host — standalone app, mounted host, an embedding admin UI — gets
  the same chrome; the standalone app header is a gdoc-style stack
  (brand icon + the open document's title over a small brand line,
  reported up from the editor screen) with right-aligned icon
  theme/language menus. **The title is click-to-rename** (inline input,
  commit on Enter/blur, Escape cancels, IME-composition aware): the name
  is document metadata, NOT template wire (`templates.yml` is untouched
  by a rename, so the round-trip guarantee holds). Standalone it persists
  in the local draft envelope; mounted it routes through the host
  `TemplateStore.save` payload (an optional `name` field the host may
  ignore — the project index entry name stays the authoritative source on
  reopen, so leaving the editor re-fetches the project).
- **CSS foundation: build-time Tailwind + Headless UI** (user decision,
  revised twice from the original "no framework" call — the final
  stance). Don't hand-write CSS where the framework covers it: layout /
  spacing / type / color are plain UNPREFIXED Tailwind v4 utilities
  (`@tailwindcss/vite`, preflight off while legacy sheets remain, the
  legacy sheets imported into `layer(components)` so utilities win);
  interactive primitives with hard behavior (dialog/menu/listbox/tabs/
  popover/switch) ride `@headlessui/react` — unstyled, so the LOOK is
  entirely our utilities; the `--sj-*` tokens are an INTERNAL
  light/dark value source bridged into Tailwind via `@theme inline`
  (required: the tokens live on app roots, not `:root` — the non-inline
  form resolves to empty), applied at the document root so portaled
  overlays resolve them. **The Designer ships as an app / own-page
  mount (sidekiq-web style), never into a host page's DOM** — so
  host-DOM isolation (utility prefixes, a per-package CSS build, a
  host-facing `--sj-*` theming contract) is DE-SCOPED (a build-time
  prefix + package CSS build were tried and rolled back as needless).
  A future white-label/SaaS embed, if ever needed, builds its own UI
  over controller/engine instead. Runtime CSS-in-JS stays rejected.
  CDN Tailwind stays rejected (a dev-only runtime compiler; CSP
  `script-src 'self'`; self-contained static shipping). **Dependency
  posture: `gui/` is liberal (a well-chosen library over hand-rolling);
  the ENGINE stays strict** (user direction).
- **Component catalog page: RETIRED** (user direction, superseding the
  earlier "component catalog first" call): the reusable chrome
  primitives live in `designer/src/ui/` on the Tailwind + Headless UI
  foundation, and that directory (plus this doc and the code map) IS
  the inventory — the dev-only isolation page (`/catalog.html`) was
  deleted once the Tailwind migration completed. Storybook stays
  rejected for dependency surface; a future need for isolated
  component rendering re-opens this as a fresh decision.
- **Namespace: unified `sj`** (superseded the earlier "keep
  `.shojiku-*`, no rename" stance). Hand-CSS classes are `.sj-*` and
  custom properties `--sj-*` — one family; Tailwind utilities stay
  unprefixed. The mount-root classes are `.sj-app` (app shell) /
  `.sj-designer` (component); theme tokens now live on
  `document.documentElement` (portaled Headless UI overlays escape a
  mount-root scope), so token resolution no longer depends on the scope
  class. With host theming de-scoped the `--sj-*` names are an INTERNAL
  value source, not a public contract. Full rule set:
  [`../../gui/STYLE.md`](../../gui/STYLE.md).
- **Panel IA**: per-item editing splits into content / decoration / placement tabs;
  every default-showing control shows the RESOLVED effective value with an
  origin badge (default / style "name" / inherited) and — when that origin is
  AUTHORED in the document — a jump into the
  document-settings view. Effective-value resolution generalizes the
  format toolbar's cascade mirror (`toolbar/effective.ts`) — one
  bounded mirror of the engine cascade, never two — and now floors an
  unset inherited key to its real engine default so a control
  reads its value rather than blank; that engine floor is the ONE origin
  with no jump (nothing authored it, and the badge would otherwise stack
  the same link down every unset field of the decoration tab). The no-selection state is a compact
  hint card pointing at the **fullscreen document-settings view** (a
  fixed whole-document layer-tree root row / the File-menu document-settings entry /
  an origin-badge jump open it; it takes over the whole editor area — the
  layer-tree pane included, since the view carries its own section rail —
  and shows ONE of the page / base-text / styles / locale sections at a
  time beside a live preview of the real document, superseding the earlier
  right-panel accordion). The base-text section is deliberately named "standard text" in the ja chrome, the
  same words the format toolbar's style picker uses for "no named style
  applied": one thing, named once. Its fields show the engine's fallback
  as a PLACEHOLDER, never as a filled value — a filled box under a
  "default" tag reads as a setting the document made, when in fact nothing
  is authored until the user changes it.
- **Input primitives**: numeric/length fields get steppers
  (authored-unit-preserving); wire-spelling datalists are replaced by
  a picker component with LOCALIZED labels + live sample renderings
  ("with ¥ symbol — ¥300,000"), free entry kept as the expert path; the
  format field appears only after a data key is picked; the
  insert-data-item flow gains a create-new-field modal (workshop mode, over
  `extendParams`).
- **Table columns edit horizontally**: a bottom offcanvas sheet
  (spreadsheet orientation — one grid column per table column, rows
  for label/binding/width/format + a read-only sample preview), with
  an Excel/TSV paste import (clipboard → column definitions + sample
  rows over the scaffold substrate; a new untrusted-input surface with
  caps and charset guards, no formula evaluation). Offcanvas/modal use
  is liberal by user direction.
- **Contextual help**: `?` popover affordances beside genuinely
  confusing controls (2 sentences + a "learn more" link, `help.*`
  catalog keys, en+ja first) plus a Help menu (tutorial, shortcuts,
  glossary) — the always-available sibling of the tutorial.
- **The in-app tutorial**: a nine-chapter through-course
  ("your first invoice", blank page → exported invoice) opened from
  Help, plus a dismissible first-run suggestion, AND a set of
  help-menu **topic shorts** (focused 2–3 min drills — containers & layout /
  data binding / tables / footers & page numbers / fixed vs auto
  placement / style & format provenance) listed under their own section in the launcher
  beside the course. A topic is a single-chapter unit run by the SAME
  controller/matcher/coach mark; it reuses a course step's sentence by
  reference (single-source copy) while keeping its own independent
  progress, runs on its own practice document, and returns the reader's
  own document on exit ("use it on my own document"). It is Designer chrome,
  not a host injection: every host gets it. Its steps are DATA
  (`{id, copyId?, anchor, done}`) whose completion predicates read the
  committed op stream, the selection path, the rendered page count and a
  closed set of UI events — never the DOM — so a step is satisfied by the
  same ops an AI would emit. It runs on a bundled practice document: starting the
  course snapshots the reader's own template + sample data and leaving
  always restores them (the undo history does NOT cross that swap — the
  document bytes are identical, the history is not). Step prose lives in
  ja/en modules rather than the chrome catalog, whose parity gate would
  demand six machine translations of instructional text; the launcher's
  own short labels are ordinary catalog keys in all six languages.
  Progress is persisted through an injected accessor (the standalone app
  wires `localStorage`), read as the launcher opens and re-validated
  against the real course on every read.
- **Pane ergonomics**: the fixed-width left sidebar became resizable
  (a WAI-ARIA splitter `ResizeHandle` primitive; width is a persisted
  pref, clamped, Designer-local UI state never in the template) and
  collapsible via an always-visible slim-toolbar toggle
  (session-local, NOT the persisted pref — decided over the mockup's
  offcanvas overlay as the better ergonomics for a persistent tool
  pane).
- **Currency field kind**: the add-field surfaces offer currency as
  a first-class kind (the FieldKind quartet grew to a quintet); its
  SCHEMA writes ONLY `{type: number, format: currency}` — no
  `precision:`, no per-field `currency:` — leaving currency code and
  precision entirely to the resolution chain (field `currency:` →
  `defaults.currency` → pack `currencyDefault` → JPY; precision →
  field `precision:` → pack per-code override → CLDR fractions), so
  JPY renders whole and USD keeps 2 decimals automatically; pinning a
  precision would break multi-currency. Sample synthesis gives
  money-shaped fields whole-unit amounts (no `¥474.92` draws). The
  workshop-mode PLACEMENTS a currency field creates (paste-import money
  columns, blank-start scaffold columns, the create-field insert,
  workshop drag-to-bind) author `data.format: symbol` — the engine
  promotes a number + `symbol`/`name` pick to the currency type
  (capability `format.currency.coerce`), so ¥ shows from the first
  preview with no definitions; the CODE still rides the
  `defaults.currency` chain, never per-field. Engineer-mode
  drag-to-bind stays bare (declared `displayFormat` is the engineer's
  channel), and the format picker offers `symbol`/`name` on number
  fields (capability-gated).
- **Delivery mode** (user decision, completed): the redesign was built
  on the long-lived feature branch `feat/gui-redesign` with stacked
  PRs; the workspace gates were allowed red mid-track on that branch,
  and the track merged to `main` only when fully green — the one
  sanctioned exception to the per-change green-gate rule, now closed.

## Mandatory lint/test gates (TypeScript/React)

Formatting/style and coverage follow the general rules in
[../guidelines.md](../guidelines.md); the wired gates all run inside
`make gui` (in `make verify`). What's specific to `gui/`:

- **Biome** (`biome check` — format + lint in one) must run clean, zero
  diagnostics; the adopted stack, replacing ESLint + Prettier (never mix
  both stacks in a package)
- **Per-file line budget** — 150 executable lines, waiver token
  `line-budget-exempt:` (see the decision above); runs first in `make gui`
- `tsc --noEmit` with `strict: true` must pass
- **Vitest** (adopted) unit tests for pure state logic — reducers,
  document ops, the preview state machine, and the field-palette model
  (the definitions view + used-in-template correlation)
- `vitest run --coverage` with `thresholds` set to `100` in
  `vitest.config.ts`, enforced in `make gui`
- Component tests (React Testing Library) for Canvas/Property
  Panel/Diagnostics interactions, plus at least one integration test
  against the real WASM engine (never a mock)
- End-to-end tests (Playwright) for the golden path (open preset →
  tweak → preview → export) — wired as **`make gui-e2e`** (Playwright in
  Docker over the built + assembled app), on-demand like `make wasm-e2e`,
  NOT part of `make verify`
- Accessibility: run axe (or equivalent) against rendered GUI screens —
  **not yet wired in CI (aspirational, do not assume it gates)**; a11y
  diagnostics surfaced by the engine are a different concern (they
  describe the *generated PDF's* accessibility, not the GUI's own)

## Notes

- Canvas approach (decided, and now built as the `designer` canvas MVP:
  a host-injected `EngineTransport` seam over the browser-WASM `Engine`,
  a debounced preview loop with revision-tagged snapshot correlation, a
  raw-RGBA `<canvas>` underlay, and an SVG overlay of one interactive
  `<rect>` per box for click/keyboard path-keyed selection — details in
  the code map, `docs/code-map/gui-designer-canvas.md`): the engine's preview is the underlay,
  and an SVG/DOM overlay built from `inspect` boxes carries selection/guides
  — the GUI never re-renders content. The `inspect` box index emits a box
  for **every** item (id-carrying or not), each keyed by a structural
  `path` (`sections.body.items[3].items[0]`, `…cell.items[1]`,
  `…columns[2]`) so the canvas hit-tests every node and correlates it back
  to YAML without GUI-side id injection; an authored `id:` is a lookup
  alias on top. Correlate a box to the document version that produced it
  (paths are re-synthesized each layout, so a stale overlay against a
  freshly-edited template must re-inspect, not reuse old geometry). The
  SVG output backend is not built.
- Grid is a supported layout tool but is not the primary layout mechanism —
  GUI should present four basic tools to users (fixed position, stack,
  grid, table) regardless of how many internal layout models exist.
