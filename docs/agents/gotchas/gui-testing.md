# GUI testing traps (jsdom / RTL / vitest / the 100%×4 gate) — `gui/`

> AI-only. Test *strategy* lives in `shojiku-test-professional`;
> language standards in `shojiku-node-professional`; live-browser smoke
> traps in [browser-smoke.md](browser-smoke.md).

## jsdom's missing pieces

- **jsdom has no canvas/layout backend.** `getContext('2d')` returns
  null (after a noisy "Not implemented") and `ImageData` is undefined;
  jsdom never lays out, so `position`/stacking/`overflow` bugs pass
  EVERY unit test. The vitest setup file must shim `getContext`→null
  (quiet) + define `ImageData`, and register `afterEach(cleanup)` —
  **RTL does NOT auto-cleanup without `globals: true`**, so `screen`
  queries otherwise match stale trees leaked from earlier tests (a
  "multiple elements found" that makes no sense). Assert load-bearing
  inline paint/positioning explicitly — **a component that ships no
  stylesheet must inline its paint defaults: an unstyled `<rect>` fills
  BLACK** (use `fill="transparent"`, not `none`, to stay
  click-targetable); defer true geometry to the Playwright golden path.
- **jsdom has no PointerEvent, and RTL's fallback silently drops the
  fields a drag handler reads** (`pointerId`, `clientY`, `isPrimary` —
  the bare `Event` constructor ignores them). Shim a MouseEvent-based
  `PointerEvent` in `vitest.setup.ts` (the designer package ships one);
  call `el.setPointerCapture?.(id)` guarded and cover the supported
  branch by stubbing the method in one test. **The same gap hits HTML5
  drag/drop**: `fireEvent.drop(el, { clientX, clientY, dataTransfer })`
  builds a bare `Event`, silently dropping all three — dispatch a real
  `MouseEvent('drop', …)` and `Object.defineProperty` a synthetic
  `dataTransfer` onto it. **But a raw `el.dispatchEvent` is NOT
  act()-wrapped**: a handler that sets React state doesn't flush before
  the next query — a component-level test with mock handlers passes
  while the SAME dispatch at the Designer level reads stale DOM. For
  right-click use `fireEvent.contextMenu(el, { clientX, clientY })` (it
  act-wraps AND preserves coordinates); reserve raw dispatch for events
  whose init fields RTL drops, wrapped in `act()` when state changes.
- **Headless UI's anchored popovers construct a `ResizeObserver` on
  open** — the no-op shim must live in the vitest setup of EVERY package
  whose tests open one, not just the package that defines the component
  (rendering the embedded `Designer` in `designer-app` tests errored on
  every menu-opening test until the shim was mirrored).
- **A Headless UI `Dialog` with the `transition` prop stays MOUNTED
  through its exit transition in jsdom** (no `transitionend` fires) — a
  close test asserting `queryByRole('dialog')` is null right after
  clicking close FAILS. Assert the close WIRING (that `onClose` fired,
  or the closed data-state). **Backdrop-click close is likewise not
  jsdom-synthesizable** (outside-click detection ignores synthetic
  events). Pin × + Escape (`fireEvent.keyDown(document, { key:
  'Escape' })`) — the `ui/Modal` primitive's tests set this posture.
- **Headless UI `Tab`/`Disclosure` UNMOUNT their inactive content** — a
  test querying a control behind a non-active tab fails "unable to find
  a label"; click the `role="tab"` into view first (the property panel's
  `openTab` helper). Disclosure is also UNCONTROLLED — to open a section
  programmatically, hand-roll a controlled aria-expanded accordion.
- **jsdom boolean DOM getters can be `undefined`, not `false`** (e.g.
  `el.isContentEditable`) — a predicate leaks `undefined` through an
  `&&` chain despite a `: boolean` signature. Compare `=== true`, and
  unit-test the contentEditable arm via `Object.defineProperty`.
- **The `WheelEvent`/UIEvent constructors REJECT non-finite init
  members** (WebIDL `double`) — a hostile-input test passing
  `deltaY: NaN` throws at construction. Forge a plain
  `new Event('wheel')` and `Object.defineProperty` the fields — the
  shape a hostile script would actually dispatch.
- **RTL's `fireEvent.doubleClick` fires ONLY the dblclick event**, not
  the two preceding clicks — fire `click` then `doubleClick` when the
  handler's precondition comes from the click (e.g. selection).
- **A `datetime-local` input with `step={1}` normalizes its value with a
  trailing `.000` in jsdom** — assert with `.toContain`; the commit path
  strips fractional seconds itself so the authored value is
  deterministic. A whole-minute value seeded WITH `:00` into a
  minute-precision input (no step) is rejected/blanked.
- **`TextDecoder` (default `ignoreBOM: false`) CONSUMES a leading UTF-8
  BOM**, so a hand-rolled BOM strip after `decode()` is a
  permanently-dead branch that reds the 100% gate. Drop it.

## Coverage-gate traps (vitest v8)

- **v8 coverage (v4+) counts BRANCH LEGS the line-based era never saw**
  — every `if` gets an implicit-else leg, each `&&`/`?:` operand its
  own — and `coverage.include` no longer fences out-of-package source
  imports (exclude `**/<package>/**` explicitly). Cover the untaken side
  of every guard; annotate `/* v8 ignore next N -- <why> */` ONLY for
  provably-dead defensive guards, and before concluding a leg is dead,
  trace EVERY caller (two "dead" legs turned out reachable).
- **A FUNCTION can stay uncovered while every LINE reads 100%** — an
  inline predicate inside a short-circuit that only runs when TWO
  optional sources coexist. Locate it via lcov:
  `--coverage.reporter=lcovonly`, grep `FNDA:0,(anonymous_N)`, match
  `FN:<line>`. The fix is a both-sources test, not an ignore.
- **A type-only `.ts` file reports `0/0/0/0` but does NOT fail the
  thresholds** — don't "fix" it. But an **unimported re-export barrel
  IS a statement** and reds the gate on its own file — when the package
  `index.ts` already re-exports a new layer's modules, don't also add a
  `layer/index.ts` barrel; import it or drop it.
- **Duplicating a helper duplicates its COVERAGE obligation, and a pure
  move is where that bites.** The repo's per-module `record(value:
  unknown)` convention (two dozen copies) is fine to follow, but a split
  that gives the new module its own copy hands it three branch legs that
  only the ORIGINAL module's tests exercised — the write half of a
  read/write split saw two of them and the 100%-branches gate failed on
  a change that moved no behavior at all. Cover the fresh copy from the
  new module's OWN suite; extending an existing hostile-input `it()` with
  the missing shapes does it without perturbing the title set the split
  is being verified by.
- **A defensive fallback for a value the CALLER guarantees is a branch
  no test can take.** Turning a hook's closure into a pure function over
  a context tempts one at the call site — `siblingEnd(rowRefs, drag?.parent
  ?? '', index)` for a callback the model invokes only after it has
  narrowed `drag` to non-null. The `?? ''` leg is then unreachable and
  the 100%-branches gate fails on a pure move. Hand the narrowed value
  THROUGH the callback instead (`isEnd(parent, index)`, called as
  `isEnd(drag.parent, …)`), so the guarantee stays where the narrowing
  is and no dead leg exists to cover.
- **A guard that MOVES in a refactor carries its `/* v8 ignore */` along
  — and the inherited justification is often stale.** The ignore reads as
  pre-existing and unquestioned, so it silently satisfies any negative-case
  requirement the plan wrote for that guard: the case is "covered", no
  test exists, and every gate is green. On every split, re-derive each
  moved ignore's claim from the CURRENT contract rather than the comment.
  One said a nudge's `ops === null` leg was unreachable "because the box
  was classified movable" — but the grid step arrives as a bare `number`
  on an EXPORTED wiring interface that the component never normalizes, so
  any host passing a non-finite step reaches it. Deleting the ignore and
  adding the hostile-input case kept coverage at 100%×4, which is itself
  the proof the leg was live. A still-true ignore costs one re-read; a
  stale one hides both a defect and a dropped requirement.
- **A nullable ref used only after mount makes any `x === null` / `x?.`
  on it a dead branch.** Same family: an OPTIONAL prop read with
  `?? fallback` is dead when every caller of that path passes the prop —
  declare the default in the destructuring (`{ scope = '' }`) instead.
  Order a compound guard so a genuinely-varying condition drives the
  short-circuit, or reach the element through a callback ref
  (null-on-unmount covers it).
- **React's `onWheel` is registered PASSIVE at the root**, so
  `preventDefault()` there is a no-op. Add a non-passive native listener
  wired through a **callback ref**, not `useEffect([])` — the effect
  form leaves an `if (el === null) return` that never runs (a
  permanently-uncovered branch); the callback ref runs with the element
  on mount and `null` on unmount, so BOTH branches cover.
- **v8 cannot cover a `for (;;)` whose only exit is a `return` inside**
  — the never-taken normal exit reports uncovered. Write `while (cond)`
  with a real condition.
- **Vitest coverage counts TEST files too** — an uncalled function
  literal inside a hostile fixture fails the FUNCTION threshold on the
  test file itself. For must-reject non-data leaves use `Symbol('x')` /
  `10n` instead.
- **Cloning a component clones its COVERAGE tests, not just its code** —
  a modal copied from another inherits the same hard-to-hit branches
  (the `<dialog>` focus-management callback ref needs both the
  focused-trigger path AND a `vi.spyOn(document, 'activeElement',
  'get').mockReturnValue(null)` + unmount). Copy the source's
  focus-mgmt tests too.
- **A parent that CONDITIONALLY renders a child owns three coverage legs
  the child's own tests never touch**: (1) the inline callback arrow on
  the child (`onClose={() => setOpen(false)}`) is a PARENT function —
  add a parent-level open-then-close test; (2) an insert/apply handler's
  op-REFUSED leg needs a hostile-target fixture (the `items: 3` non-seq
  target trick); (3) any MODE ternary in that handler needs both modes.
  Enumerate all three before the first `make gui`. And a
  `while (taken.has(id))` id-minter needs a fixture where the FIRST id
  is already taken.
- **A helper called ONLY from event/drag paths never gets the
  initial-render coverage a JSX-position expression gets for free** —
  its `snapshot?.x ?? fallback` arms need an explicit before-any-render
  test (fire the gesture while `renderRaw` never resolves) plus one per
  independently-missing piece.
- **An effect-driven hook loops when a dependency's identity churns**
  (an object built fresh each render re-fires an effect that dispatches
  state). In a test this surfaces as a **vitest worker OOM** ("Worker
  exited unexpectedly", `tests 0ms`), NOT a size error — build such
  values once (stable ref / `useMemo` / hoisted const).
- **`vi.fn(async () => …)` types its calls tuple as `[]`** — reading
  `mock.calls[i][1]` is a tsc error even though the runtime recorded the
  args. Give the impl a signature (`vi.fn(async (_key: string) => …)`).
- **A `useSyncExternalStore` fixture whose `getSnapshot` mints a fresh
  literal fails EVERY test in the file at once.** React compares
  snapshots by identity, so `get: () => ({ kind: 'ready' })` looks like a
  value that never settles and the render dies with "The result of
  getSnapshot should be cached to avoid an infinite loop" — a message
  that names neither the store nor the component, so 17 unrelated
  navigation/theme tests read as a total breakage. Capture the state
  once (`const S = {...}; get: () => S`), and put the builder in the
  shared testkit rather than inline per test: the mistake is invisible
  at the call site and gets re-made the second time a test needs a
  different state.

## Vitest runner

- **Vitest 4 removed `--reporter=basic`**, and the failure does not say
  so: it dies with `ERR_LOAD_URL` through `loadCustomReporterModule`,
  which reads like a broken install. To take a test COUNT, run the
  default reporter and grep `"Test Files|Tests "` from the summary.
- **Vitest's default `include` collects `*.spec.js` too**, so a
  co-located Playwright `e2e/` folder gets picked up as a unit test and
  dies on `Cannot find module '@playwright/test'`. Scope
  `test.include: ['src/**/*.test.{ts,tsx}']`.
- **A run that exits NONZERO with every test passing is an unhandled
  rejection**, not a threshold miss — check the coverage ERROR lines
  first, and if there are none, look for a promise your test started that
  nobody caught. It surfaces as a bare `undefined` before the pnpm
  failure line and names no test. The usual cause is a component's own
  `async` handler: a click handler that `await`s and never catches leaks
  the rejection into the run, so a test that deliberately makes a
  service REJECT turns green-but-failing. That is a real defect in the
  handler (a view that never leaves its loading state), not a test
  artifact — fix the catch rather than the test.

## Queries and fixtures

- **Playwright `getByLabel('X')` is substring + case-insensitive**:
  'Size' also matches a "Re**size p**anel" splitter — anchor with a
  regex (`getByLabel(/^Size/)`) or `exact: true`.
- **Positional role queries (`getAllByRole('combobox')[0]`) are fragile
  across chrome additions** — one new `<select>` in a shared component
  shifts every downstream test that indexed by position. Query by
  accessible name; reserve positional indexing for lists with no stable
  names.
- **A control in a SHARED panel that unrelated tests use as an
  incidental "make an edit" handle breaks broadly when it moves** (~15
  save/draft/preview tests reached for the page-setup Size select).
  When relocating a control out of a shared surface, grep the WHOLE
  workspace for its label, and give the movers a small helper that
  reaches the control at its new home.
- **An aria-hidden TOOLTIP bubble puts its control's label text into the
  DOM a second time** — a page-wide `getByText('<chrome word>')` goes
  ambiguous the moment a shared primitive gains one. Scope
  (`within(dialog)`) or query by role + accessible name.
- **A new chrome LABEL that duplicates an existing chrome string
  collides on accessible name** (a `<label>`-wrapped control AND a
  `<section aria-label>` both answer to it). Grep the catalog for the
  value before adding it; give the new key a DISTINCT string. But when
  the collision means genuine REDUNDANCY — two surfaces showing the SAME
  state — CONSOLIDATE to one owner instead of inventing a distinct
  string, and let tests query the current owner (and match the owning
  catalog's string, e.g. the app catalog's `app.saved`, not the title
  bar's). **The collision can exist in ONE locale only**: two keys
  distinct in ja both rendered "Close" in en (`help.close` on a modal ×
  vs a footer `block.manage.close`), so the ja-eyed author sees no
  clash while every en-locale `getByRole` in range goes ambiguous —
  grep the value in EVERY catalog, not just the one you author in.
- **A wrapping `<label>` RENAMES every labelable descendant, buttons
  included** — a field helper that grows a second child silently gives
  that button the FIELD's name. Give such a sibling an explicit
  `aria-label` equal to its visible text; expect the fix to un-mask a
  duplicate elsewhere (scope those queries `within(root)` in the same
  change).
- **Threading a cascade FLOOR to per-field origin badges turns
  previously-blank fields into badge-bearing ones** — tests that clicked
  "the" jump button break with "found multiple elements"; it is also a
  real UX-density signal worth flagging.
- **A minimal engine template fixture needs `sections.body.type: flow`**
  — a bare `body: { items: [...] }` parse-errors `missing field 'type'`,
  not the diagnostic you were testing. Every hand-built band gets its
  `type`.
- **A real-engine integration fixture's TEXT must match the engine
  instance's font locale.** The wasm integration suite boots en-US (no
  CJK glyphs), so Japanese fixture strings add `missing_glyph` warnings
  that red a "diagnostics-clean" assertion — use ASCII there; cover
  Japanese-key handling in pure unit tests. **A real-engine RASTER
  fixture must be a valid encoding** (CRC-checked chunks) — generate a
  minimal valid 1×1 PNG (`python3 -c` with `zlib`+`struct`), never
  hand-type base64.
- **A Designer-level pointer test's client coordinates are divided by
  the render scale** (jsdom rects are unmeasurable so only the ÷`scale`
  remains; the Designer renders at `DEFAULT_SCALE` 2) — a drop meant for
  page pt y=120 fires at clientY 240. Component-level overlay tests can
  pass `scale={1}`.
- **A pointer test against a snap-capable model must place its
  coordinates OUTSIDE every snap attractor (or assert the snap)** — a
  target within threshold of ANY sibling edge/center silently rewrites
  the expected committed value. Same family: assert float expectations
  with the SAME expression shape the code computes
  (`12 * (72 / 25.4)`, matching `unitToPt`), never an algebraic
  equivalent that differs by an ulp.

## Forms & input commits

- **A commit-on-blur NUMBER path must treat an empty field as a
  non-commit BEFORE `Number()`**: `Number('')` is `0`, not `NaN`, so an
  `isFinite` guard passes a cleared field through (a cleared stepper
  committed 0 → clamped to 1 → collapsed the grid on a mere blur).
  `raw.trim() === ''` returns early unless the empty state MEANS
  something; pin the cleared-field blur with a no-dispatch test.
- **A keydown handler that commits on Enter MUST guard
  `e.nativeEvent.isComposing` first** — a Japanese user pressing Enter
  to confirm an IME conversion otherwise commits mid-composition. jsdom
  defaults `isComposing` to false, so no jsdom test and no ASCII smoke
  reveals it — pin with `fireEvent.keyDown(el, { key: 'Enter',
  isComposing: true })` asserting no commit. Prefer a plain `<input>`
  over contenteditable for single-line labels; route Enter/Escape
  through `el.blur()` so one `onBlur` is the sole commit path (works
  deterministically in jsdom too).
