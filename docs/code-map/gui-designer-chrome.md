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
  The subset has NO `plural` arm, deliberately; a count string picks its
  own key instead (see `i18n/usageLabel.ts`), which is enough while every
  shipped language distinguishes at most one-from-other. A locale with
  more plural categories is the moment to grow the formatter.
- `i18n/usageLabel.ts` — `usageLabel(t, count)`: the "used in N places"
  line, choosing `toolbar.styles.usageOne` vs `toolbar.styles.usage`.
  Shared by both registry rows and the style picker so the rule lives
  once rather than as a ternary per call site.
- `i18n/catalog/` — one module per language (`en`/`ja`/`zh-tw`/`zh-cn`
  FULL — diagnostics + chrome; `hi`/`fil` chrome-only with per-key
  English diagnostic fallback). `i18n/catalog.ts` — `DEFAULT_CATALOG`
  assembly; host spreads-extends it.
- `i18n/locales.ts` — `LOCALES` (`LocaleInfo { tag, label, messages,
  engineLocale, pageSizes }`) — the picker/page-setup source of truth;
  `pageSizes[0]` = the locale's standard size; `ALIASES` script map;
  `localeInfo(tag)` lookup (miss = omit, never invent regional paper);
  `ENGINE_ONLY_LOCALES` (engine-resolvable locales with NO chrome catalog
  — `th-TH` ships a pack but no Thai UI — so the `defaults.locale` picker
  offers them beside the registry's own `engineLocale` values, while the
  language menu lists the chrome TAGS). There is no tag-substituting helper
  any more: `engineLocaleFor` mapped `en-GB` → `en-US` for the locale
  panel's engine query, which made the panel explain a document the engine
  refuses (`canonical_id` widens a bare language only, and no `en-gb.yml`
  ships), so the query now sends the authored tag and the picker offers only
  what the engine can resolve.
- `i18n/resolve.ts` — `resolveChain`: BCP 47 tag → ordered chain ending
  at `en` (hasOwn-guarded, length-capped, garbage → `['en']`).
- `i18n/render.ts` — pure `translate` + `renderDiagnostic` (walk the
  chain PER KEY; engine `message` is the fallback, never parsed; the
  ORIGINAL tag drives number grouping) + `variantKey`: a diagnostic whose
  ARGS distinguish a case its one engine code cannot may refine to
  `<code>.<variant>`, tried before the bare code (today: an EMPTY
  `unknown_data_key` key, where the generic wording echoes the empty key
  back). Wording only — the engine wire is untouched.
- `i18n/context.tsx` — `I18nProvider`/`useI18n` (`locale`, resolved
  `language`, `t`, `describe`).
- `i18n/registry.test.ts` — node env: reads
  `engine/diagnostics/src/code.rs` and asserts every FULL language
  covers every wire code.
- `i18n/ellipsis.test.ts` — node env: the HIG action gate (gui/STYLE.md
  § Actions). Both halves — the ellipsis key set is IDENTICAL in every
  catalog and never lands on a heading; and a dialog's title equals the
  label that opened it, minus the ellipsis. The second half is a pair
  table plus an exemption table carrying a REASON per key, whose union
  must cover every ellipsis label (so a new one cannot go unclassified);
  the review pane's exemption is self-checked against its confirm label.
  The two pairs whose view the app titles are gated in
  `designer-app`'s `i18n/appCatalog.test.ts` instead.

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
- `toolbar/wire.ts` — the minimal-wire DECISIONS every cascade-aware control
  authors through, keyed by a full `keys` array rather than a style key:
  `toggleWire` / `alignWire` / `comboWire` (+ `alignedValue`). Array-keyed
  because a table BAND's properties do not live at `style.*` — the header row's
  sit at `header.style.*`, the body row's at `row.style.*` — so the toolbar and
  the band/column editors share ONE copy of the rule instead of two. Never
  author what the cascade already yields; `normal` appears only as a cascade
  override, never as a default restated. `null` = dispatch nothing.
- `toolbar/model.ts` — pure toolbar model: `readToolbar` (the
  selection-context control set keyed off `BORDERABLE_TYPES`) + the op
  builders, which are `toolbar/wire`'s decisions aimed at `style.*`;
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
  `FMT_POPOVER`, `MENU_ROW`, `Caret`, `originHint`/`hintTitle`,
  `ToggleButton`). The group rule it used to mint is now `ui/Sep`, shared with
  the slim toolbar and the align cluster.
- `toolbar/TypographyGroup.tsx` — family + size field (change-guarded
  commit-on-blur, ±1pt steppers, no datalist) + B/I (`aria-pressed`
  from EFFECTIVE state). The size box is hand-rolled rather than a
  `panel/StepperField`, so it carries the reseed wiring itself
  (`panel/useReseedKey`): `comboWire` authors nothing for a cleared box over an
  INHERITED size — there is no own key to remove — and the typed blank used to
  sit there over a page still rendering at the cascade's size. Being outside
  `panel/` is why a panel-scoped sweep of that defect did not reach it.
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
  mirrors `shortcuts.ts` — plus ONE row that is not window-level, the
  layer tree's Alt+↑/↓ reorder chord, listed because a keyboard path
  nothing names is a keyboard path nobody finds);
  `help/GlossaryDialog.tsx` + `glossaryModel.ts`
  (`GLOSSARY_TERMS` — data field, margin box, snap grid, style, default,
  interpolation, units). Both Modals off the Help menu, keys in all six
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
- `formats/` — the `formats:` registry's domain model, laid out
  deliberately parallel to the styles one above. `model.ts`
  (`readFormatsView`, `MAX_FORMATS`, `RESERVED_FORMAT_NAMES` mirroring
  `FieldType::from_name`, `AMBIGUOUS_FORMAT_NAMES` — the GUI's own refusal
  of `default`/`symbol`/`name`/`value`, which the engine ACCEPTS as entry
  names but which then mean two things in one document, the ordered
  `FORMAT_DEFAULT_TYPES`), `plan.ts`
  (the refusal vocabulary; four of its messages point at the
  `styles.error.*` catalog keys on purpose — they are worded about the
  DOCUMENT and the rewrite, not about styles), `fieldOps.ts`
  (create/edit; an EMPTY pattern is a refusal, never a write — the wire
  field is required and authoring without it produces a template the
  engine cannot parse) and `refOps.ts` (rename/delete, one transactional
  batch, refused whole).
- `formats/usage.ts` — `buildFormatUsage(text, paletteGroups)` →
  `FormatUsage {refs, truncated}`, plus the `FormatRef` shape. THREE
  roots, which is what makes it differ from the style walk it otherwise
  mirrors: every binding's `format:` under `sections` (matched
  GENERICALLY — `Binding.format` is the only `format:` the REGISTRY is
  reachable from, so this reaches items, spans, table columns, char grids
  and the `bindings:` map, and stays complete when a new binding position
  ships; the wire's one other `format:`, `PageNumberItem.format`, is a
  page-number TEMPLATE and is skipped by type), EVERY string
  under `sections` and under
  `document:` (`{key:closing}` reaches the same dispatch, so a rename
  that skipped it would half-apply) — every string rather than every
  INTERPOLATED one, since enumerating the dozen-odd surfaces the engine
  interpolates would go stale, and the dated filter is what keeps a
  brace-carrying literal that is NOT interpolated (`Binding.placeholder`,
  a table's `overflow_text`) from being rewritten in practice — AND
  `defaults.formats.<type>`, which
  sits outside `sections` entirely and is root-addressed — only its
  `date`/`datetime` slots, the other four naming a per-type builtin pick.
  An inline `{ pattern }` default is a definition rather than a reference
  and is skipped. A registry name can also be named by definitions'
  `displayFormat:`, in a file this walk is not given; those references
  are simply not rewritten — the same silence a style name's unreachable
  ones get.
- `formats/usageWalk.ts` — the recursive half: the per-node visit plus
  the two pieces of CONTEXT a reference needs, the enclosing row scope
  (opened by an array source under `columns`/`cell`/`item`) and the
  item's `bindings:` declaration map (served to every string beneath it,
  spans included, as the engine does).
- `formats/datedBinding.ts` — WHICH references are references at all.
  A `formats:` entry is `date`/`datetime`-kind only and the engine
  consults the registry solely in the dated arms of format dispatch, so
  the registry is reachable from a DATED binding and nothing else: a
  `format: symbol` on a currency binding names that currency's builtin
  symbol variant, never an entry called `symbol`. Filtering by that
  STRUCTURAL rule rather than by a table of builtin spellings is
  deliberate — a spelling table would have to track `money.rs`,
  `text.rs`, `format.rs` and every locale pack. An UNRESOLVABLE type (no
  definitions, an undeclared key) records the reference: over-rewriting
  is today's visible behaviour, under-rewriting leaves a dangling name.
  The corollary the tests pin positively: an entry whose name shadows a
  locale-PACK variant is a real reference from a dated binding and must
  keep being rewritten. The engine agrees INDEPENDENTLY at the picker
  layer — `engine/authoring/src/formats/variants.rs` adds registry names
  to a type's pickable spellings only for `Date | Datetime`, and
  `kind_matches` even keeps a `datetime` entry off a `date` field — so
  the usage walk was the last place in the system still matching a
  registry reference by SPELLING. `datedChip` is the chip-side
  companion: an interpolated name can resolve at more than one
  (key, scope) pair, so it answers from the whole candidate set and
  records unless every pair that resolves says non-dated.
- `formats/chipRefs.ts` — the `{key:format}` half: `chipFormats` reads a
  string's format-picking expressions (flagging one at `MAX_TEXT_EXPRS`,
  where the GUI parser stops and the engine does not, so the rewrite
  refuses instead), `rewriteChipFormat` restates the whole string with
  just that name changed — or stripped to a bare `{key}` on a delete.

## Text editing (interpolation chips)

- `text/interpolate.ts` — pure `{key}`/`{key:format}` segment parser
  mirroring `engine/core/src/interpolate.rs` (same charsets, `{{`
  escape, malformed-stays-literal; the ONE deviation is the display-side
  `MAX_TEXT_EXPRS` cap). One scan, two projections (`parseSegments` /
  `parseRawSegments` — concatenating `raw` reproduces the input).
- `text/chipModel.ts` — pure chip model: `chipMetaMap` (real `Map`),
  `buildEditorNodes` (raw segments → text nodes + atomic labeled chip
  spans, DOM-API-built), `serializeEditor` (never more wire than
  visible text — and it carries LINE structure: a `<div>`/`<p>`/`<li>`
  contributes the break it displays, while a lone `<br>` inside one is the
  browser's empty-line placeholder and contributes none. That is what makes it
  safe to leave plain Enter to the browser, which is the only way the caret can
  rest after a break at the end of a value), `chipWire(key)` — the ONE charset gate (round-trips
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
- `text/editorHandlers.ts` — keyboard, pointer + text-ingress behavior. Every
  key is ignored while an IME composition is open, so an Enter that CONFIRMS a
  conversion reaches the browser's own IME handling rather than a key this file
  acts on — the guard every other Enter-acting
  surface in the Designer carries, pinned here by an explicit
  `isComposing: true` keydown test (jsdom defaults it false, so nothing else
  can see a regression). Also carries
  incl. `handleTextIngress` (the ONE plain-text ingress a paste and a drop
  share: refuse the native event, insert the plain flavor, then run the
  caller's after-step over the result):
  `handleEditorMouseDown` (a click on a chip focuses the editor, lands
  the caret beside it, and RETURNS that chip as the selected one — a pill
  is unselectable, so it cannot ride the caret's selection),
  `replaceChipAt` (swaps a selected chip for a picked field, carrying the
  expression's `:format` across; re-validates the node against the live
  editor first, since paste/drop/erosion restructure it in between),
  `handleEditorKeyDown` (⌘Enter commit, Escape cancel
  with stopPropagation, ⌘B/I/U preventDefaulted, atomic chip erosion —
  **plain Enter is NOT handled**: answering it with a `\n` node left the caret
  unable to rest after a break at the end of a value, so the next character
  landed on the previous line, and every other spelling behaved the same way
  because the cause is the missing content, not the representation. The
  browser's own Enter mints a line container the serializer reads),
  `insertPlainTextAt` (the ONE ingress paste and drop share — a
  native HTML drop would mint live elements), `insertChipAt`.
- `text/TextEditor.tsx` — the ONE text-editing component (contenteditable
  chip editor; content seeded imperatively ONCE from `buildEditorNodes`
  — hand-typed `{key}` stays plain until commit reseeds, IME-safe;
  commit on blur leaving the whole root OR on UNMOUNT, changed-serialization
  only; `onCommit(text, declarations)` hands both to the host). Leaving the
  field is not always a blur — a panel tab switch or a selection change removes
  the node while it still holds focus, and the browser fires no blur for that,
  so the exit path is what stops the reader's typing being discarded. Made
  exactly-once by two flags: `cancelled` (Escape never commits) and `committed`
  (a blur/⌘Enter that already fired must not repeat as a second undo step —
  the host reseeds the field on its new value, so the committed instance
  unmounts moments later). The optional
  `onDraft` reports the edit IN PROGRESS (`null` withdraws: commit,
  cancel, unmount) — the property panel's only confirmation channel is
  the canvas, so without it a reader types and nothing on screen moves
  until blur. Omitting it leaves the component's behaviour exactly as it
  was for the DRAFT — but not for the commit: the unmount path below is
  unconditional, so the canvas overlay host (which passes no `onDraft`) also
  gained it.
- `text/EditorSurface.tsx` — the contenteditable element itself and its
  seven handlers, split out so `TextEditor` stays the seeding /
  commit-decision / staged-declaration shell. Every DOM-mutating path
  here is Range surgery (atomic chip erosion, paste,
  drop) and so fires no `input` event: each drives the detached-chip
  re-check and the draft publish itself. Enter is not among them — the browser
  applies it and fires a real `input`. A commit or a cancel ENDS the
  edit and is never followed by a publish.
- `text/useDraftReporter.ts` — the draft callbacks; it publishes and withdraws
  and does NOT decide what an unmount means (that is a commit decision, and it
  belongs to the component that owns the value). An IME composition is
  tracked as a FLAG rather than read off the event (`isComposing` needs a
  cast on React's synthetic event, and jsdom leaves such boolean DOM
  getters `undefined`, so a test would pass over a broken guard); the
  listener rides a ref so withdraw-on-unmount can be a one-shot effect.

## Shared UI primitives (`ui/`)

Headless UI owns behavior (focus trap, keyboard, ARIA, portal); the LOOK
is Tailwind utilities over the `--sj-*` tokens.

- `ui/Button.tsx` — `Button`/`IconButton` (`data-variant` is the test
  hook; `IconButton.label` = aria-label + TipBubble). **The only place the
  filled accent is minted** — `VARIANT.primary` — which is what makes the
  Material 3 hierarchy (primary=filled / default=outlined / ghost=text)
  gateable; `ui/actionConvention.test.ts` refuses a hand-rolled copy.
- `ui/Select.tsx` — over Headless UI Listbox (display label separate
  from wire value).
- `ui/Menu.tsx` — data-driven grouped entries + headings; text or icon
  trigger (icon form gets a TipBubble); `checkedId` for single-choice.
  An icon trigger may also carry `triggerText`, the control's current
  VALUE beside the glyph (the header's language name), while `label`
  stays the accessible name — two icon controls side by side are
  indistinguishable at low acuity, and the name has to keep naming the
  ACTION when the visible text is a noun.
- `ui/Switch.tsx` — over Headless UI Switch.
- `ui/Segmented.tsx` — the mutually-exclusive pill as a NATIVE radio
  group (fieldset + sr-only inputs, `has-*` variants); optional
  `describedBy` puts a caller's hint on the GROUP as a description.
- `ui/Modal.tsx` — over Headless UI Dialog (`transition` prop; jsdom
  keeps it mounted through exit — close tests assert the WIRING);
  `size` prop: `default` 460px / `roomy` 560px / `wide` 900px.
- `ui/Offcanvas.tsx` — Modal's bottom-anchored sibling with a light
  scrim (the column sheet's frame).
- `ui/AnchoredSurface.tsx` — the pointer-anchored surface BOTH the context
  menu and the border popover sit in: fixed `role="menu"` at the click
  point, Escape (capture + stopPropagation, so the window-level deselect
  never also fires) / outside-pointerdown dismissal, and the viewport
  clamp. The element is held in STATE, not a ref (the clamp needs a
  render, and a state-held node is null on unmount); `role` is a LITERAL
  because the a11y lint reads it statically. There is no closed state —
  the caller decides whether it exists.
- `ui/anchorPosition.ts` — pure `clampToViewport` + `ANCHOR_MARGIN_PX`: a
  surface hanging off the right/bottom edge is pulled back; one larger
  than the viewport pins to the margin rather than off the near edge.
- `ui/ContextMenu.tsx` — the menu itself over `AnchoredSurface`
  (Headless UI's Menu is trigger-anchored, hence hand-rolled):
  `role="menuitem"` buttons, first-row focus on open, roving arrows.
  Labels are CHROME text, never document content.
- `ui/ColorSwatchPicker.tsx` — the popover SHELL over `ui/SwatchGrid`, plus
  the native custom-colour input and the clear row; no hand-typed hex;
  document colors pass `isHexColor` before the chip preview; the caller owns
  the op. Optional `describedBy` describes the trigger without touching its
  name. Exports `placeIn(anchor, size, view)`, which decides which way the
  popover hangs: the grid is taller and wider than the flat palette it
  replaced, so it ran off the bottom of the window from a control low in the
  panel and off the side from one near its right edge. Both inputs are
  independent of the answer (the trigger does not move; the popover's extent
  is the same either way) — reading the popover's own rect instead decides
  against a box a previous answer already moved. An axis flips only when the
  default side overflows AND the other has room; otherwise the max-height
  scrolls. The popover takes `w-max`, or shrink-to-fit against the ~40px
  trigger wrapper squeezes every column back to the swatch width. That
  placement now lives in `hooks/usePopoverPlacement.ts` — hoisted out when a
  second popover (the panel's numeric combo) needed it, since any panel
  popover taller than a couple of rows has the same problem.
- `ui/swatchPalette.ts` — the palette as a STRUCTURE, not a flat list:
  `HUE_COLUMNS` (six hues × `SHADE_STEPS` shades, lightest first),
  `NEUTRALS`, and `swatchPlace` over a real `Map` (the lookup value can come
  from a document). Position carries the information — a column is a hue, a
  row a darkness step — so a reader who cannot distinguish the colours
  reaches one by counting rather than by looking. The NEUTRAL row is the
  exception: it shares the hue columns' template, so it sits under headers
  that do not name it, and each neutral is named outright instead of by a
  step. The previous flat palette
  is contained exactly: its neutrals are the neutral row and its hues the
  `BASE_STEP` row, pinned by a test, so no authored colour disappeared.
- `ui/SwatchGrid.tsx` — that palette rendered with hue names as column
  headers, the step beside each row, and a `<output>` readout naming
  whatever is hovered OR focused (`name · #hex`), falling back to the
  committed colour. Focus is served as well as hover so the keyboard path is
  not the degraded one. Its grid template is an INLINE style: `minmax()`
  nested inside `repeat()` generates no Tailwind rule, and the silently
  missing class left the columns at the swatch width.
- `ui/swatchNames.ts` — `swatchName` DERIVES the accessible name from that
  position (hue key + darkness step through `color.shade`) rather than
  looking it up per hex, which is why a 36-swatch grid costs one chrome key
  and not thirty-six; a value outside the palette keeps its hex. The drift
  guard asserts the RULE reaches every swatch, and that every key it can
  emit resolves in every language.
- `ui/SwatchValueLabel.tsx` — the `name · #hex` line a FIELD renders beside
  its chip, so the popover does not have to be opened to learn what is set.
  It lives beside the field rather than inside `ColorSwatchPicker` because
  the trigger chrome is caller-owned and ranges from a toolbar icon button
  (no room) to a panel swatch (room); the widget presents a value, and where
  a name fits is the caller's question. It reuses `swatchName`, so the closed
  field, the popover readout and each swatch's accessible name are one
  derivation. Nothing clips here, unlike the readout: this returns early
  unless the value passes `isHexColor`, so the string it renders is seven
  characters or a catalog name — a clip would be a branch no input can take.
  Mounted on the char_grid ruling colour first; the other colour fields
  follow.
- `ui/chipContrast.ts` — what a colour VALUE is, and how a chip painted in
  one stays visible: `isHexColor` (the guard every document-derived colour
  passes before reaching an inline style — it lives here, not beside the
  picker, because it is a property of the value), `relativeLuminance`,
  `chipRing`, and `chipPaint`, which is what call sites use. The chip sits on
  chrome that is light in one scheme and dark in the other, so a fixed token
  border loses one end of the range at each; the ring is derived from the
  chip's OWN WCAG luminance instead (light chip → dark hairline, dark chip →
  light one), which needs no theme branch and no new token. A chip with NO
  colour has no luminance to derive one from, and the token border it used to
  rely on does not carry it — on the dark surface the old fill and that border
  both sit near 1.18, i.e. invisible, which is the state every colour field
  starts in and what a scalar-or-map wire value reads as. `chipPaint` gives it
  a chequerboard plus a mid-grey outline that clears 3:1 against both
  surfaces, and returns fill and outline together so the two guards a call
  site used to keep in agreement cannot disagree.
- `ui/TipBubble.tsx` — the gdoc-style instant tooltip (~300ms CSS,
  width-BOUNDED — a label may interpolate a hostile style name;
  `data-sj-tip` is the test hook). Decorative (`aria-hidden`) by DEFAULT;
  given an `id` it drops that, becomes somebody's `aria-describedby` target
  AND starts revealing on keyboard focus — one opt-in, both channels, which
  is how a hover-only hint reaches a keyboard user without being welded into
  a control's name. Opt-in rather than default because of one CATEGORY — any
  tip group wrapping a focusable text field (the panel's field primitives, and
  `toolbar/TypographyGroup`'s size box) — where reveal-on-focus would park a
  tooltip over the rows below while the user types. `align="start"` anchors
  it left for a narrow control near the property panel's clipping edge.
- `ui/ResizeHandle.tsx` — the WAI-ARIA window splitter (semantics-free;
  caller owns state; pointer capture guarded for jsdom).
- `ui/icons.tsx` — the hand-drawn inline-SVG icon set (`currentColor`,
  aria-hidden; hand-drawn is a consequence, not a rule — the line is in
  `gui/STYLE.md` § Icons). Carries the chrome marks + the layer tree's
  per-item-type marks, drawn for distinguishability at 14px. The three
  section marks (`IconSectionHeader` / `IconSection` / `IconSectionFooter`)
  are deliberately one FAMILY — same page outline, filled band at top /
  middle / bottom — so the mark says WHICH section without a letter that
  would only work in English.
- `ui/chromeConvention.test.ts` — the node-env convention GATE: fails
  on native `title=`, on a text character standing in for an icon, or on a
  toolbar group rule (`w-px` beside `bg-border`) authored anywhere but
  `ui/Sep.tsx` (comments blanked; `i18n/catalog/` exempt; two pinned
  exceptions — the app header's document-title button, which lives in
  designer-app, and `ui/Sep.tsx` itself as the rule's mint site). Walks BOTH
  packages via `testkit/sourceWalk.ts`.
- The three treatments in the layer tree's one column are a decision, not
  drift: `tree/TreeRow.tsx` wraps and clamps (its label is document-derived and
  can carry a binding key), while `tree/LayerTree.tsx`'s document-root row and
  `tree/BandPlaceholderRow.tsx`'s two stacked lines stay nowrap+ellipsis — both
  render static chrome strings that cannot overflow.
- `ui/actionConvention.test.ts` — the node-env ACTION gate (gui/STYLE.md
  § Actions): the filled accent (`bg-accent` + `text-on-accent`, UNPREFIXED —
  a `data-checked:`/`aria-pressed:` accent is toggle state, a filled `<span>`
  is a badge) is composed on no `<button>` outside `ui/Button.tsx`; every
  `<Modal>`/`<Offcanvas>` `footer={…}` slice — brace-balanced out of the
  comment-blanked source — is built from `Button` and holds EXACTLY ONE
  `variant="primary"` (Material 3: one primary per screen). The pattern carries
  its own positive control and both exclusions are pinned. It also holds the
  COMPLEMENT — every primary is INSIDE a footer, bar an exact self-checking
  `path:line` list (the empty-state CTA; the footer-less restore-points
  dialog's two buttons) — so a filled button added to a work surface is a red
  gate rather than a design-time read; the rule is keyed on footer MEMBERSHIP,
  not on the directory, because three of the thirteen footers live under
  `panel/`. A third clause refuses the emphasis token anywhere but a
  `variant=`, so an indirection cannot hide a fill; the four declared non-uses
  are the `ButtonVariant` union and the font-pack TIER homonym. What stays
  UNGATED is which of the restore-points dialog's two buttons is filled — that
  is runtime state, pinned by `designer-app`'s `SnapshotDialog.test.tsx`.
  All three gates walk BOTH packages' sources.
- `i18n/ellipsis.test.ts` — the node-env ELLIPSIS gate (Apple HIG): the set of
  chrome keys whose value ENDS in `…` is identical across all six catalogs (the
  ellipsis is a property of the ACTION, not the language), and no `<h1>`–`<h6>`
  heading renders one — which is also why an opener whose key doubles as its
  dialog's `title=` (`shortcuts.title`, `glossary.title`) cannot take one
  without a key split. The heading set is seeded three ways, because a
  line-based walker sees only the LITERAL `title={t('key')}`: the source walk,
  the doc-settings rail's imported table, and the `.title` NAMING CONVENTION
  over the catalog — the last is what reaches the six titles that arrive
  through a variable (`labels.title`, `currentStep.title`, a composed
  `` t(`help.${topic}.title`) ``, `t(keys.title)`, `sectionTitle`). Keys on
  "ends with", never "contains" — a gate that flagged quoted prose would be
  relaxed into uselessness. A progress or
  placeholder `…` (`Saving…`) is exempt from the HIG reading by being neither
  a control nor a heading, and parity still covers it.
- `ui/chrome.ts` — the shared chrome className strings (anything a
  SECOND surface needs moves here; a bare `<select>`/`<input>` breaks
  the dark scheme — reach for these).
- `ui/Sep.tsx` — `Sep`: the thin rule between two toolbar groups, minted HERE
  and nowhere else (`chromeConvention` walks the source for it, the way
  `actionConvention` does for the filled accent). Four hand-rolled copies had
  drifted into two margin spellings with one of the four `aria-hidden`. The
  convention it carries: a GROUP owns its LEADING rule, so an absent group
  cannot leave two rules adjacent, and the first group in a bar has none.

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
