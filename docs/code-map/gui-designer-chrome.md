# Code map — gui/designer — menubar, toolbar, i18n, ui primitives, theme, text editor

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Area index + neighbors: [gui-designer.md](gui-designer.md). Granularity:
> file role + key exports + load-bearing contracts.

Covers `i18n/`, `toolbar/`, `menubar/`, `help/`, `hooks/`, `styles/`,
`text/`, `ui/`, `theme/`, `review/`, `pdf/`, `src/styles.css`.

Chrome-wide postures: every label rendered is CHROME text (catalog keys),
auto-escaped — never document-derived HTML; document-derived values reach
the DOM only escaped or through the CSSOM; hostile-string lookups use real
`Map`s / `Object.hasOwn` guards (binding keys, style names, locale tags
are attacker strings); native `title` is banned (the `TipBubble` instant
tooltip replaces it — gated by `ui/chromeConvention.test.ts`).

## i18n

- `i18n/format.ts` — `formatMessage`: an in-repo ICU-subset substitution
  (single linear scan, no backtracking; an interpolated arg value is
  never re-scanned; missing arg → null so the caller falls back) +
  `formatList` (locale-aware "and" list join over `Intl.ListFormat`,
  hostile-tag fallback to `en` — for chrome naming a SET of things).
- `i18n/catalog/` — one module per language (`en`/`ja`/`zh-tw`/`zh-cn`
  FULL — diagnostics + chrome; `hi`/`fil` chrome-only with per-key
  English diagnostic fallback). `i18n/catalog.ts` — `DEFAULT_CATALOG`
  assembly; host spreads-extends it.
- `i18n/locales.ts` — `LOCALES` (`LocaleInfo { tag, label, messages,
  engineLocale, pageSizes }`) — the picker/page-setup source of truth;
  `pageSizes[0]` = the locale's standard size; `ALIASES` script map;
  `localeInfo(tag)` lookup (miss = omit, never invent regional paper).
- `i18n/resolve.ts` — `resolveChain`: BCP 47 tag → ordered chain ending
  at `en` (hasOwn-guarded, length-capped, garbage → `['en']`).
- `i18n/render.ts` — pure `translate` + `renderDiagnostic` (walk the
  chain PER KEY; engine `message` is the fallback, never parsed; the
  ORIGINAL tag drives number grouping).
- `i18n/context.tsx` — `I18nProvider`/`useI18n` (`locale`, resolved
  `language`, `t`, `describe`).
- `i18n/registry.test.ts` — node env: reads
  `engine/diagnostics/src/code.rs` and asserts every FULL language
  covers every wire code.

## Format toolbar

The cascade mirror is TWO files — layer gathering (`cascade.ts`) and
per-key resolution (`effective.ts`); both go if inspect ever carries
resolved style.

- `toolbar/cascade.ts` — the cascade LAYERS below one item, read ONCE:
  `cascadeContext(read, path, floor?)` → `CascadeContext` (item,
  registry, defaults, ancestors, floor; every layer read try/caught and
  narrowed).
- `toolbar/effective.ts` — cascade-EFFECTIVE resolution over a prepared
  context — the ONE mirror the toolbar AND the panel's decoration tab consume:
  `effectiveValueIn(ctx, key)` / `effectiveStyles(…)` → per key
  `{value, cascade, own, origin, styleName}`; the engine-default floor
  (`buildStyleFloor`) sits below `defaults.style` for inherited keys. A
  bounded GUI-side mirror of the engine cascade (docs/engine/style.md).
- `toolbar/model.ts` — pure toolbar model: `readToolbar` (the
  selection-context control set keyed off `BORDERABLE_TYPES`) + op
  builders that author the MINIMAL wire over the cascade (toggling
  toward what the cascade already yields just removes the own key);
  `formatContext(…)` — the toolbar's derived-value context built once
  at the root; enum values drift-guarded against `STYLE_FIELDS`.
- `toolbar/FormatToolbar.tsx` — the SHELL (+ `FormatToolbarProps`):
  resolves path → view → effective → `readToolbar`, renders NOTHING
  without a formattable target; holds the `StyleCaptureModal` state
  (outside the picker popover, keyed to the path it opened FOR); one
  `dispatch` that drops null ops. Clusters sit in the gdoc order (style
  picker | family + size | B/I/color | border | align) on the `FMT_BTN`
  rail, popover dismiss via shared `hooks/usePopover.ts`.
- `toolbar/fmtChrome.tsx` — cluster-shared chrome (`FMT_BTN`,
  `FMT_POPOVER`, `MENU_ROW`, `Caret`/`Sep`, `originHint`/`hintTitle`,
  `ToggleButton`).
- `toolbar/TypographyGroup.tsx` — family + size field (change-guarded
  commit-on-blur, ±1pt steppers, no datalist) + B/I (`aria-pressed`
  from EFFECTIVE state).
- `toolbar/FamilyControl.tsx` — a `menuitemradio` dropdown over host
  `fontFamilies` ∪ the current value + an `onAddFont` tail row.
- `toolbar/AlignControl.tsx` — gdoc-style dropdown whose trigger shows
  the ACTIVE glyph; non-enum authored values fall back to left.
- `toolbar/ColorControl.tsx` — over the shared `ui/ColorSwatchPicker`,
  writing `style.color` / `style.backgroundColor` (the op stays here).
- `toolbar/BorderControl.tsx` — a rail button opening a popover hosting
  the SHARED `panel/BorderEditor` (no second implementation).
- `toolbar/StylePicker.tsx` — `menuitemcheckbox` rows over the registry
  ∪ the item's names (each row rendered in its own style via
  `styles/preview` + a usage count BEFORE applying), then the
  selection→style capture tail rows opening `StyleCaptureModal`;
  toggling a name is ONE op.
- `toolbar/AlignToolbar.tsx` — the canvas multi-select align/distribute
  cluster (renders at ≥2 movable items; distribute needs 3);
  presentational — emits intents the Designer turns into ONE `applyAll`
  via `canvas/align.ts`.

## Menubar + title bar

- `menubar/model.ts` — pure menubar model: `buildMenubar(t, wiring)` →
  File/Edit/Insert/Help columns; every `MenuItem` runs an EXISTING op or
  host callback (AI parity); band-only/unsavable rows stay VISIBLE and
  disabled with the reason appended; optional file actions present only
  when the host wires them. `menubar/insertItems.ts` — one armed insert
  group → menu rows (the per-entry-kind dispatch + the two
  visible-but-disabled gates). `menubar/hostEntries.ts` —
  `validateHostEntries(raw)`: untrusted host entries runtime-typed, id
  charset + reserved-name reject + caps + dedupe; bad entries dropped,
  never thrown (re-exported through `menubar/model.ts`).
- `menubar/Menubar.tsx` — the `role=menubar` row of Headless UI menus.
- `menubar/Titlebar.tsx` — document name + `saveStatus`; renders
  NOTHING when both absent.

## Save/export review

- `review/diffModel.ts` — pure `computeLineDiff(baseline, current)`: the
  CAP decision + the result the pane consumes (`truncated` coarse summary
  over cap); never throws; read-only, NOT a patch op. Over
  `review/diffScript.ts` (how the texts differ: line split, the
  `commonTrim` prefix/suffix that sizes the work, the LCS edit script)
  and `review/diffRows.ts` (what it SHOWS: the context window, the
  collapse to gap rows, the hunk count behind the "N places changed" pill).
- `review/SaveReviewModal.tsx` — the pane before save/export/AI-apply
  (mode-titled; plain-language "N places changed" pill + the raw ±line
  diff, document text escaped; cancel dispatches nothing; diff colours
  ride `diffAdd`/`diffDel` tokens).
- `pdf/PdfPreviewModal.tsx` — the engine's PDF bytes in an `<iframe>`
  over a blob URL (the browser's own viewer; URL revoked on
  change/unmount; download dispatches the host callback).
- Designer wiring: Save AND Export open the review first; `baselineText`
  advanced only on a save that PROCEEDS; validate-before-save stays the
  fail-closed gate at confirm.

## Help

- `help/HelpHint.tsx` — a `?` popover beside a confusing control (pure
  presentational; `onMore` → glossary).
- `help/ShortcutsDialog.tsx` + `shortcutsModel.ts` (`shortcutRows(mac)`
  mirrors `shortcuts.ts`); `help/GlossaryDialog.tsx` + `glossaryModel.ts`
  (`GLOSSARY_TERMS`). Both Modals off the Help menu, keys in all six
  catalogs.

## Popover state

- `hooks/usePopover.ts` — Escape / outside-pointerdown dismiss (Escape
  stopPropagations so the window-level deselect never fires).

## Named-style capture + usage

- `styles/preview.ts` — `stylePreview(style)` → object-prop
  `CSSProperties` (the CSSOM is the safety boundary; hostile lengths
  dropped) + `PREVIEW_CHIP` (the fixed paper-tint chrome every preview
  surface shares).
- `styles/captureModel.ts` — pure selection→style plans:
  `capturableStyleProps` (explicit inline scalars only; per-side maps
  stay untouched), `captureStyleOps`/`updateStyleOps` (per-prop ops,
  never a whole-map replace), `updateTargetName` (last registry-present
  `styleNames` entry).
- `styles/StyleCaptureModal.tsx` — what the capture COMMITS: the
  create/update modal (IME-guarded name entry, impact count; ONE
  `applyAll` per commit; refusals via `panel/stylePlan`'s
  `REFUSAL_MESSAGE_KEY`).
- `styles/CapturedStyleView.tsx` — what the capture SHOWS, rendered by
  BOTH modes: the `STYLE_FIELDS`-ordered captured-props list + the
  `stylePreview` chip.
- `styles/usage.ts` — `buildStyleUsage(text)` → `StyleUsage {refs,
  truncated}`: the shared usage index from a generic bounded walk
  matching `styleNames` AND `alternateStyleNames`; `StyleRef {path, key,
  names, addressable}` is the op-addressable identity (rename/delete
  refuse on `!addressable` or `truncated` — the half-rename hazard);
  depth/node caps; real `Map`.

## Text editing (interpolation chips)

- `text/interpolate.ts` — pure `{key}`/`{key:format}` segment parser
  mirroring `engine/core/src/interpolate.rs` (same charsets, `{{`
  escape, malformed-stays-literal; the ONE deviation is the display-side
  `MAX_TEXT_EXPRS` cap). One scan, two projections (`parseSegments` /
  `parseRawSegments` — concatenating `raw` reproduces the input).
- `text/chipModel.ts` — pure chip model: `chipMetaMap` (real `Map`),
  `buildEditorNodes` (raw segments → text nodes + atomic labeled chip
  spans, DOM-API-built), `serializeEditor` (never more wire than
  visible text), `chipWire(key)` — the ONE charset gate (round-trips
  through the ONE parser; the engine charset is never restated).
  Reading a chip's stored slice back goes through that same parser rather
  than trusting the attribute (it is document-derived): `chipFormatOf` /
  `chipLabelOf` answer nothing for a slice that is not exactly one
  expression, and `chipWireWithFormat` PROVES a re-composed
  `{name:format}` by parsing it back, degrading to the bare slice so a
  crafted format cannot close the expression early.
- Named binding declarations are THREE pure modules over the `bindings:`
  wire — two rules shape all three: **minimal wire** (a declaration is
  authored only where the bare grammar cannot say it) and **one parser**
  (writability decided by round-tripping through `chipWire`):
  - `text/declModel.ts` — the READ side: `readDeclarations`
    (hostile-safe, deliberately UNCAPPED so a minted name cannot collide
    with a hidden real one), `readOtherSurfaceNames` (link.url + spans,
    mirroring `validate/bindings/decl.rs`), `chipMetaFor` (a declaration
    WINS over a same-named ambient field).
  - `text/declMint.ts` — `mintDeclName` (TOTAL; bounded loop; never
    opens with a digit/dot) + `planChipInsert` (bare `{key}` when it
    suffices; reuses an equivalent existing/pending declaration; the
    taken set spans declarations ∪ pending ∪ text names ∪ every offered
    key ∪ other-surface names — a minted name can neither shadow nor
    redirect a link URL/span).
  - `text/declCommit.ts` — `commitOps`: text edit + staged declarations
    + the prune of one this edit orphaned, ONE `applyAll`; past the
    `MAX_TEXT_EXPRS` cap the prune stands DOWN entirely (the engine has
    no such cap).
- `text/chipContext.ts` — `ChipContext` + `chipContextFor(…)` — the
  per-item context BOTH hosts (panel field, canvas overlay) build
  through so they cannot drift; reading declarations is ungated, only
  AUTHORING is capability-gated (`canDeclare`).
- `text/editorDom.ts` — Selection/Range helpers (no execCommand), incl.
  `chipFromTarget`/`caretBesideChip` — a chip is `user-select: none`, and
  a click on unselectable content inside a contenteditable is answered by
  the browser with NOTHING (no focus, no caret), so the editor places the
  caret at the pill's nearer edge itself.
- The editor's two field menus are ONE component under two triggers, over
  ONE offer rule and ONE popover — so inserting a chip and re-picking a
  selected chip's field cannot drift apart in what they show:
  - `text/fieldMenuModel.ts` — the pure offer derivation: offerability
    (with `canDeclare` every field is offerable, else the interpolation
    charset filters), the document-scope SECTION (row scope + `canDeclare`
    only — at document scope the two lists are the same rows), and the
    search filter. Offerability settles BEFORE the filter, so "nothing
    offered" and "nothing matched" stay distinguishable. i18n-free:
    sections carry their heading KEY.
  - `text/FieldMenuButton.tsx` — trigger + `panel/PickerPopover` (the
    SAME popover the property panel's binding picker draws). Its
    `ariaLabel` is explicit because the panel wraps the whole editor in a
    `<label>`, which would otherwise name every button inside it.
  - `text/InsertFieldMenu.tsx` — that button under the insert trigger.
  - `text/ChipFieldMenus.tsx` — both menus plus the pick→plan→DOM
    wiring, kept out of `TextEditor` so that component stays the
    seeding/commit shell. A replace needs no declaration machinery of its
    own: `declCommit`'s batch already prunes the name it orphaned.
- `text/editorHandlers.ts` — keyboard, pointer + text-ingress behavior:
  `handleEditorMouseDown` (a click on a chip focuses the editor, lands
  the caret beside it, and RETURNS that chip as the selected one — a pill
  is unselectable, so it cannot ride the caret's selection),
  `replaceChipAt` (swaps a selected chip for a picked field, carrying the
  expression's `:format` across; re-validates the node against the live
  editor first, since paste/drop/erosion restructure it in between),
  `handleEditorKeyDown` (⌘Enter commit, plain `\n` Enter, Escape cancel
  with stopPropagation, ⌘B/I/U preventDefaulted, atomic chip erosion),
  `insertPlainTextAt` (the ONE ingress paste/drop/Enter share — a
  native HTML drop would mint live elements), `insertChipAt`.
- `text/TextEditor.tsx` — the ONE text-editing component (contenteditable
  chip editor; content seeded imperatively ONCE from `buildEditorNodes`
  — hand-typed `{key}` stays plain until commit reseeds, IME-safe;
  commit on blur leaving the whole root, changed-serialization only;
  `onCommit(text, declarations)` hands both to the host).

## Shared UI primitives (`ui/`)

Headless UI owns behavior (focus trap, keyboard, ARIA, portal); the LOOK
is Tailwind utilities over the `--sj-*` tokens.

- `ui/Button.tsx` — `Button`/`IconButton` (`data-variant` is the test
  hook; `IconButton.label` = aria-label + TipBubble).
- `ui/Select.tsx` — over Headless UI Listbox (display label separate
  from wire value).
- `ui/Menu.tsx` — data-driven grouped entries + headings; text or icon
  trigger (icon form gets a TipBubble); `checkedId` for single-choice.
- `ui/Switch.tsx` — over Headless UI Switch.
- `ui/Segmented.tsx` — the mutually-exclusive pill as a NATIVE radio
  group (fieldset + sr-only inputs, `has-*` variants).
- `ui/Modal.tsx` — over Headless UI Dialog (`transition` prop; jsdom
  keeps it mounted through exit — close tests assert the WIRING);
  `size` prop: `default` 460px / `roomy` 560px / `wide` 900px.
- `ui/Offcanvas.tsx` — Modal's bottom-anchored sibling with a light
  scrim (the column sheet's frame).
- `ui/ContextMenu.tsx` — hand-rolled fixed `role="menu"` at the click
  point (Headless UI's Menu is trigger-anchored).
- `ui/ColorSwatchPicker.tsx` — curated swatches + native color input,
  no hand-typed hex; document colors pass `isHexColor` before the chip
  preview; the caller owns the op.
- `ui/TipBubble.tsx` — the gdoc-style instant tooltip (~300ms CSS,
  decorative, width-BOUNDED — a label may interpolate a hostile style
  name; `data-sj-tip` is the test hook).
- `ui/ResizeHandle.tsx` — the WAI-ARIA window splitter (semantics-free;
  caller owns state; pointer capture guarded for jsdom).
- `ui/icons.tsx` — the hand-drawn inline-SVG icon set (`currentColor`,
  aria-hidden; hand-drawn is a consequence, not a rule — the line is in
  `gui/STYLE.md` § Icons). Carries the chrome marks + the layer tree's
  per-item-type marks, drawn for distinguishability at 14px.
- `ui/chromeConvention.test.ts` — the node-env convention GATE: fails
  on native `title=` or a text character standing in for an icon
  (comments blanked; `i18n/catalog/` exempt; the one documented
  exception — the app header's document-title button — lives in
  designer-app).
- `ui/chrome.ts` — the shared chrome className strings (anything a
  SECOND surface needs moves here; a bare `<select>`/`<input>` breaks
  the dark scheme — reach for these).

## Theme substrate (`src/theme/`)

- `theme/tokens.ts` — tokens as data: `LIGHT_THEME`/`DARK_THEME`
  (identical key set, compile-checked), `TOKEN_VARS` → `--sj-*` names
  (bridged into Tailwind via `designer-app/src/tailwind.css`
  `@theme inline` — a new color token adds a line there), pinned by a
  contract test + a WCAG-AA contrast suite in BOTH schemes;
  `diffAdd`/`diffDel` back the review diff.
- `theme/resolve.ts` — pure `resolveTheme(scheme, override?)` (override
  merged through `safeTokenValue` — charset allowlist, `url(` rejection,
  invalid drops to base) + `cssVars(tokens)`.

## CSS posture

- `src/styles.css` — IRREDUCIBLE-ONLY hand CSS (canvas SVG paint,
  the chip editor's `.sj-chip*`, the rendering-status dim); everything
  else is Tailwind utilities; hand-CSS uses the `.sj-*` namespace. The
  chip aligns `vertical-align: middle`, never `baseline`: its `overflow`
  is not `visible`, and such an inline-block takes its BOTTOM MARGIN EDGE
  as its baseline (CSS 2.1 §10.8.1), which hung the pill a descender
  above the text beside it. Dark
  mode themes CHROME only — the canvas paper is engine pixels and stays
  white. CSS posture: `gui/STYLE.md`.
