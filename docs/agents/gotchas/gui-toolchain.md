# GUI toolchain traps (Biome / tsc / pnpm / splits) — `gui/`

> AI-only. Standards live in `shojiku-node-professional`; Docker/mount
> traps in [docker-make.md](docker-make.md); test traps in
> [gui-testing.md](gui-testing.md).

## Splitting files under the line budget

- **Size the RESULT with the gate's own counter before committing to a
  partition** — executable lines are far fewer than raw lines, so a
  partition that looks obviously sufficient can miss: a planned 2-way
  split of a 272-line model would have left the keeper at ~205, and the
  real answer was four files. Run the gate's awk over a candidate
  carve-up (or split, measure, split again) instead of planning from raw
  sizes, and aim for ~130 so the next edit does not immediately
  re-breach — but never buy that headroom with a module that has no
  reason to exist. Measure again after EACH extraction, not once at the
  start: one slice's keeper needed a second split by estimate but came in
  at 96 once the first extraction landed, so the planned second module
  would have existed purely for headroom that already existed.
  **Extract the shared LEAF first — it shrinks every sibling at once**,
  so a partition sized before it over-counts all of them: one plan
  carved a one-consumer module off a write side it had measured at
  ~140, and hoisting the per-side primitives into the vocabulary leaf
  they belonged to took that same side to 124 on its own, retiring the
  extra file before it was written.
- **A count taken BEFORE `make gui-format` is not the count you ship.**
  The formatter reflows import blocks (a one-line `import { … } from` the
  new module now exceeds the width becomes six lines), and every one of
  those lines is executable. One file was recorded at 56 and was actually
  62 for exactly this reason — harmless against a 150 cap, wrong in a
  table whose premise is "the gate's own number". Take the FINAL numbers
  after the last format run, never from the moment the file was written.
- **A precedent is only a precedent if its REASON transfers**: a 14-line
  props leaf was split off "the way `panel/itemPanelProps.ts` does it"
  and shipped, but that one earns its file with SIX consumers while the
  new one had one — the consumer count, not the shape, is what made the
  original legitimate.
- A file whose SIBLING TESTS split along the same seam keeps any suite
  that legitimately spans two of the new modules whole, importing from
  both — splitting a cross-module hostile-input test to match the source
  layout is how those assertions get lost. **A COMPONENT suite whose
  fixture preamble every describe uses stays whole outright** — only its
  import lines move. The gate excludes `*.test.ts{,x}` and the coverage
  config excludes `src/**/*.test.{ts,tsx}`, so a shared NON-test fixture
  module is neither budget-exempt nor coverage-excluded: splitting such
  a suite buys nothing (tests are not budget-gated) and costs either a
  new gated file or the preamble duplicated per part. A PURE-MODEL suite
  splits freely — its preamble is usually a few lines.
- **Before slicing a test file by `describe` block, enumerate its
  MODULE-LEVEL declarations** (`grep -n '^const \|^function \|^let '`):
  fixtures live *between* describes as often as above the first one, so
  a describe-to-next-describe slice both mis-homes them and silently
  eats the lines in the gap. Two `SiblingBox` fixtures declared between
  the 2nd and 3rd describe rode into the wrong half and one line
  vanished entirely; `tsc` caught the mis-homing only because the names
  were referenced — a dropped blank or comment line would have shipped.
- **The strongest cheap proof that a test split lost nothing is
  comparing the `it()` TITLE SETS, not the counts** — extract the titles
  from `git show HEAD:<orig>` and from the new files, and require the
  sorted sets to be identical in both directions, **and assert the new
  side has no DUPLICATE title** (`sort | uniq -d` empty). An unchanged
  count survives a renamed, re-scoped or quietly-rewritten case; an
  identical set does not; and only the duplicate check distinguishes
  "cases added" from "a describe copied into two files" — one split
  reported 65 against 62 and the count alone read as three extra tests.
  Pair it with the line-containment check (which covers the source side).
- **Compute a test file's describe boundaries from the SAME text you
  slice** — reading line numbers out of the working file and then
  `sed`-ing those ranges from `git show HEAD:` addresses different code
  the moment the working file's import block has been rewritten, which
  on a split is always. That is the offset-reuse trap
  (`verification-claims.md`) wearing a two-file disguise.
- **Prove a split is behavior-preserving with a LINE-CONTAINMENT check,
  not just an unchanged test count**: take the original file from
  `git show HEAD:<path>`, drop its imports/comments/blank lines, and
  assert every remaining line appears somewhere in the new module set.
  Then CLASSIFY the leftovers — a legitimate split's misses are only
  multi-line import fragments, lines that gained an `export` prefix,
  Biome reflows, and the extractions you meant to make; anything else is
  a behavior line you dropped.
- **A re-export-only BARREL cannot be proven by line containment** — it
  has almost no behavior lines, so the check reports a serene "0 missing"
  no matter what you dropped. Its proof is the exported NAME SET: parse
  every `export { … } from` block on both sides and require the sorted
  sets to be identical in both directions (360 = 360 on the designer
  barrel), and check the `export type * from` re-exports survive
  separately — a wildcard carries no names to diff, so only a consumer
  importing one of those types (tsc) proves it still resolves.
- **Splitting a COVERAGE-EXCLUDED file needs the exclude glob widened in
  the same change**, or the extracted modules land inside the 100%×4 gate
  with no tests and red it. The honest form is one glob for the group
  (`src/browser/**` beside `src/main.tsx`), which keeps the exclusion
  covering exactly the code it covered before — say so in the code map,
  since a widened exclusion is a policy line a reviewer will look for.
- **`make gui-budget` counts lines; it does not PARSE.** A sed
  line-range extraction that sliced mid-function shipped a syntactically
  broken module past a green budget run — the gate reported OK on a file
  `tsc` could not read. Budget-green is never evidence that a split
  compiled; run the formatter (seconds) after every extraction batch and
  treat IT as the syntax gate.
- **The importer blast radius is not the moved-symbol census.** A model
  whose moved exports had ~6 consumers turned out to be imported by 33
  files, because most consumers name the TYPES (which stayed) in the
  SAME import statement as a symbol that moved. Size the churn from
  `tsc`'s error list, not from a per-symbol grep, and rewrite each
  import statement by splitting its specifiers across their new homes.
  **But run the census PER EXPORT anyway, because that is what finds a
  DEAD one** — and confirm every suspect by grepping IMPORT STATEMENTS,
  never bare identifier occurrence: a `\b<sym>\b` sweep reported
  `docKey` as consumed by 14 files because it is also a PARAMETER name
  in two sibling modules, and reported a cap as consumed by a module
  that declares its own constant of that name. An export nothing
  imports is invisible to every gate —
  tsc, Biome and the 100% coverage gate were all green over an exported
  `const` array with zero references in the workspace (a `const` is a
  covered statement), and only the per-symbol grep saw it. The inverse
  is NOT a finding: an export whose only consumer is its own test can
  still be load-bearing — one was the sole assertion of two
  hostile-input cases, so retiring it would have meant rewriting
  security tests inside a line-budget slice.
- **An implausible leftover set means your STRIPPER is broken, not your
  split — and it fails in BOTH directions, so sanity-check the INPUT
  count too.** Too LARGE: one check reported 84 misses because its
  import-skipping state machine treated a single-line
  `export type { X };` as an unterminated multi-line import and swallowed
  the component body; the real count was 31. Too SMALL: the same state
  machine written with a broken terminator (`from '\''` inside a quoted
  heredoc — awk never sees a valid pattern) never LEAVES the import state
  and eats the whole file, reporting a serene "0 behavior lines, 0
  missing" for a file with 131. A containment run that says the original
  had almost no behavior lines is the tell. Run the stripper against a
  positive control (a fixture with a multi-line import, a comment and one
  real statement) before believing either number — one per LANGUAGE
  shape you strip, since a control that is pure TS cannot exercise the
  JSX arm. Two concrete stripper bugs those controls catch: **BSD `sed`
  does not expand `\t` inside a BRACKET EXPRESSION**, so a trim written
  `s/^[ \t]*//` treats the class as {space, backslash, t} and eats a
  leading `t` — `too_many_styles:` and `truncated_usage:` were reported
  MISSing while sitting verbatim in the new file (use `[[:blank:]]`);
  and a comment skipper matching only `/^\/\*/` misses the **JSX** form
  `{/* … */}`, billing every JSX comment line as behavior (three
  phantom leftovers in one component split — the budget gate's own awk
  already carries the `\{?` this needs). (Same family: BSD `awk`/`sed`
  do not support `\s`, so a cross-check pattern written with it
  silently matches nothing and reports a confident `0`.)
- **A "pure move" is where a silent REWRITE hides best — re-read each
  moved line against the ORIGINAL, not against what it obviously
  means.** Extracting a captured-props view, a row label was rebuilt as
  `` t(`panel.field.${key}`) `` instead of `t(field.labelKey)`. Every
  shipped spec happens to satisfy that convention, so no test, no
  typecheck and no gate would ever have gone red — but the field is a
  free-form `string`, and the first spec that diverges breaks a label
  with nothing pointing at the cause. Containment catches it (the line
  lands in the leftover set); "it's just a move and the tests pass"
  does not.
- **A code-map entry you MOVE to a new module carries its old CLAIMS,
  and the split re-asserts them — including the ones that were already
  false.** A pre-split entry listing six op builders said "each refuses
  (null) rather than authoring what the engine would warn on"; only
  three return `Op | null`. The sentence was wrong before the split,
  rode into the new module's entry verbatim, AND got restated in the new
  file's `//!`-equivalent header, so one stale claim became two. Line
  containment does not see doc prose and no gate reads it. When a
  summary sentence moves, re-verify it PER MEMBER against the new
  module's actual exports (`grep '^export function'` and read the return
  types), exactly as you would a fresh claim.
- **A STRUCTURAL rewrite defeats line-containment — say so and prove it
  another way, don't wave the leftovers through.** When a split also
  changes the shape (a component's inline handler becoming a pure model
  that RETURNS a plan; closures becoming functions over a context
  object), every moved line is parameterized — `event.key` → `key`,
  `box.path` → `path` — so it lands in the leftover set and containment
  can no longer distinguish "moved" from "quietly rewritten". The cheap
  substitute: locate each leftover in `git show HEAD:<file>` and assert
  they ALL originate inside the regions you deliberately rewrote (0 from
  anywhere else), then lean on the component suite's UNCHANGED `it()`
  title set, which exercises the new path end to end.

## Biome

- **Suppression comments anchor the DIAGNOSTIC's node, not the line**:
  `useSemanticElements` reports the element, so `// biome-ignore` above
  the `role=` attribute is "unused" — put it directly above the opening
  tag (JSX children context needs the `{/* biome-ignore … */}` form).
  Biome flags unused suppressions, so a misplaced one fails the gate
  rather than rotting. For `noArrayIndexKey` the anchor is the `key`
  ATTRIBUTE — on a multi-attribute element the comment sits INSIDE the
  attribute list, directly above `key={…}`, never above `<Tag`. A
  wrapped multi-line directive reports `suppressions/unused` AND still
  flags the node — which includes a REASON you continued onto a second
  `//` line, since that second line is an ordinary comment and breaks the
  adjacency. Keep the whole directive on one line however long the reason
  gets. The convention stays one per-node ignore per `key`
  (never `biome-ignore-all`); and when keyed cells are siblings of ONE
  container (a CSS-grid matrix emitted row-major), per-row `key={index}`
  values COLLIDE across rows — prefix them per row (`` `h${i}` ``).
- **Routing handlers through a `{...spread}` SILENCES the a11y lint.**
  Biome matches `useKeyWithClickEvents` (and its family) on the JSX
  attributes it can SEE, so extracting an element's handlers into one
  object and spreading it makes the rule stop firing — the tell is the
  element's existing `biome-ignore` suddenly reporting
  `suppressions/unused`, which reads like the refactor having FIXED
  something. Deleting the suppression is the wrong fix: it retires the
  rule for that element forever. Name the handlers one by one at the call
  site (`onClick={bg.onClick}` …) and keep the suppression meaningful.
- **`biome lint --only=<rule>` force-runs the rule with DEFAULT options
  and ignores `overrides`** — it is a "run this rule everywhere" probe,
  not a preview of the configured gate. A waiver list built from
  `--only` output waived the wrong files. Measure a rule's real offender
  set with the gate command itself (`pnpm lint`).
- **Apply fixes with `pnpm run format` from `gui/`, or `make gui-format`
  from the repo root** — a hand-path `biome check --write src/…` is
  config-relative-ignored (biome.json sits at `gui/`) and silently
  processes 0 files. **Removing an unused import is an UNSAFE fix**, so
  neither of those touches it — `make gui-format` exits nonzero with
  "Skipped N suggested fixes". After a move/extraction that strands
  imports, run `biome check --write --unsafe <gui-relative path>` scoped
  to the edited file, read the diff, then re-run the plain format.
  Unused TYPE aliases and consts are reported but NOT auto-removable
  even unsafely — delete by hand.
- **Biome formats/lints `.css` by default** — adding a stylesheet needs
  no config change; run `make gui-format` once after authoring CSS.
  **Run it after EVERY hand-edit batch, not just CSS or lint-error
  ones** — a wrapped-line format diff on a late edit otherwise costs a
  full ~2-min `make gui` loop (the formatter is seconds; the gate is
  not). A bulk edit that SHORTENS string literals re-flows multi-line
  calls back onto one line — run format before `make gui`, not after.
- **`noNonNullAssertion` forbids `x!` OUTRIGHT.** In a test, build a
  minimal literal of the shape the code reads instead of `find(...)!`;
  in product code, narrow with a guard or index a known-present entry.
  Run `make gui-format` first (it fixes the fixable half), then read the
  remaining reports.
- **`noControlCharactersInRegex` fires on ESCAPED `\u0000`-range
  character classes too** — a deliberate control-char reject (a URL
  guard) takes the one-line ignore rather than a weakened class.

## Biome × a11y / React idioms

- `useExhaustiveDependencies` flags a dep list with a bump counter over
  a STABLE mutable ref — compute the derived value directly each render
  instead of `useMemo`. `noAssignInExpressions` rejects
  `ref.current ??= make()` — use an `if (x === null)` local (a local
  narrows; `ref.current` does not).
- `noLabelWithoutControl` fires on a generic `<label>` wrapper whose
  control arrives as `children` (justified one-line ignore). A checkbox
  GROUP is `<fieldset>`/`<legend>`, not `<div role="group">`; a
  mutually-exclusive SEGMENTED control is native radios in a fieldset
  (sr-only legend + sr-only `<input type="radio">` in styled labels) —
  `role="radio"` on buttons is rejected; the onChange handler still
  re-guards `disabled` (jsdom delivers clicks to disabled inputs); any
  in-label suffix chrome folds into the accessible name, so a field with
  in-input chrome uses explicit htmlFor/id instead of a wrapping label.
  A status line is `<output>`, not `<p role="status">`. Inside a
  `role="menu"` popup, drop the group role entirely (heading span +
  `role="menuitem"` buttons).
- BUT a **toolbar button cluster** (`role="toolbar"` + `role="group"`
  sub-cluster of `<button>`s) is the WAI-ARIA-correct pattern —
  justified ignore. Same for a focusable window-splitter
  (`role="separator"` + `tabIndex` + `aria-valuenow`): `<hr>` cannot
  represent it. **`useSemanticElements` can start firing on a
  previously-green element the moment you give it CHILDREN** (a
  decorative grip child on a self-closing separator) — an
  INTERACTIVE/VALUED role has no valid semantic swap; reach for the
  ignore rather than re-typing the element.
- A **decorative SVG shape** (drag ghost, insertion indicator) carries
  NO ARIA attribute at all: `aria-hidden="true"` reds
  `noAriaHiddenOnFocusable` and `role="presentation"` reds
  `noInteractiveElementToNoninteractiveRole` — the accepted form is
  unlabeled + `pointerEvents: 'none'`.
- A **single-choice menu's current value** is not conveyed by a
  checkmark icon alone (decorative icons are aria-hidden). Put
  `aria-current="true"` on the checked entry (valid on
  `role="menuitem"`), and pin "exactly one aria-current" in the test.
- A **button whose visible text IS data** (document title, file name)
  must not get an action `aria-label` — aria-label REPLACES the contents
  as accessible name (WCAG label-in-name). Keep the contents as the name
  and put the action hint on `title`; query tests by the DATA name.
- A contenteditable div with `role="textbox"` needs an explicit
  `tabIndex={0}` — Biome's `useFocusableInteractive` cannot see that
  contentEditable implies focusability.

## TypeScript

- **A vitest run alone does NOT typecheck** (the transform erases
  types): a component test passing a nonexistent prop runs with the prop
  silently dropped and fails with a misleading runtime symptom — when a
  new test wires NEW props, check the props interface first (or run the
  package `typecheck`) before debugging runtime behavior. And **run
  `tsc --noEmit` after EVERY edit batch including the final one** — a
  big refactor's last edit is the one most likely to be typechecked only
  by accident.
- **Control-flow narrowing does NOT survive into a deferred closure.**
  An `onClick` arrow captures the VARIABLE, not the narrowed type —
  capture the narrowed value in a `const` at the narrowing site and
  close over that. **A refactor that groups loose props into ONE object
  prop re-creates this trap at every site at once** — destructure the
  object once at the top of the component/hook and use those locals
  (that also keeps memo dep lists naming stable fields).
- **`export { x } from './y'` creates NO local binding.** Moving a
  helper out of a module that must keep exporting it satisfies the
  CONSUMERS but leaves every remaining USE inside that module unresolved
  — surfacing as a `ReferenceError` fanned across hundreds of tests
  instead of one tsc line. Add a real `import` alongside the re-export
  whenever the module still uses the symbol.
- **When extracting a component, take each prop's TYPE from the
  CONSUMER's existing prop declaration, not from what the value appears
  to be.** Grep the receiving component's props interface (and the
  producing function's return type) before writing the new one; a batch
  of guessed types surfaces as one tsc round per wrong guess.
- **Extracting effects into custom hooks REORDERS them.** React runs
  effects in hook-call order. Before splitting a component with several
  `useEffect`s, list them in source order, then by the new hook-call
  order, and check every pair where one effect OBSERVES what another
  produces.
- **A value the old closure read LATE must become an ACCESSOR when the
  closure becomes a pure fn over a context object.** A field built at
  RENDER time differs from a CALL-time read exactly when the call
  happens after an `await` (a draft save after an async font install
  persisted the PRE-install list — silent and green). Walk each context
  field and ask whether any caller reads it after an await; those become
  `() => T`. The reverse smell: a context field that is a function for
  no reason.
- **Adding a required field to a SHARED interface breaks every object
  literal of it — including fixtures in packages you did not open.**
  `tsc` enumerates them exactly; take the compiler's list rather than
  grepping, and expect the fan-out when sizing the change.
- **Any arithmetic feeding a BYTE-checked bound uses byte length, never
  `String.length`.** UTF-16 units under-count CJK by ~2 bytes/char
  against a `TextEncoder`-measured cap — the gate then admits input
  whose real byte size exceeds the cap. Measure with
  `new TextEncoder().encode(text).length` (memoized); pure-ASCII
  payloads may keep `length` with a comment saying why.
- **A pure-model file and its component must differ by MORE THAN CASE**
  (`pageRail.ts` beside `PageRail.tsx` collides on case-insensitive
  macOS — `TS1149`). A model gets a DISTINCT lowercase noun
  (`zoom.ts`/`ZoomControl.tsx`).
- **A `.ts` build script run via bare `node` (type stripping) needs
  explicit `.ts` extensions on every relative runtime import it
  traverses — and after SPLITTING one, run it once for real**: `tsc`
  resolves with the `Bundler` setting and proves nothing about node's
  runtime resolution, so a missing extension anywhere in the new module
  chain (including a re-export hop) surfaces only at execution. One
  `node scripts/<name>.ts` that prints its summary line is the whole
  check. tsc's `Bundler` resolution needs `allowImportingTsExtensions:
  true` (with `noEmit`) for those extensions; TYPE-only imports are
  erased, so they stay extensionless. (The posture designer-core's
  `normalize-examples.ts` uses.)

## pnpm

- **pnpm ignores dependency build/postinstall scripts by default.**
  Biome and esbuild need theirs to link their platform binary. Add
  trusted tools to `onlyBuiltDependencies` in `gui/pnpm-workspace.yaml`
  — that IS the review gate for allowing a postinstall (per
  shojiku-node-security). pnpm 11 stopped reading the package.json
  `pnpm` field where this list used to live — on a pnpm major bump,
  check the settings-migration notes or the allowlist silently
  evaporates.
- **`minimumReleaseAge` (10080 = 7 days here) fails the GATE, not just
  `pnpm add`.** `pnpm install --frozen-lockfile` — what `make gui` and
  `make verify` run — re-verifies every lockfile entry against the
  cutoff and dies with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, naming
  each entry's publish time. A dependabot PR raised days after a
  release therefore reds the gate on arrival; it ages into green, and
  the fix is to wait (or exclude the one package via
  `minimumReleaseAgeExclude`). Do NOT reach for `trustLockfile: true`
  (default false) to clear it — that skips this very pass, and since
  dependabot resolves on its own without honouring the guard, this
  install-time check is the ONLY place the policy is enforced for the
  PRs that carry nearly every dependency change here.
- `pnpm-lock.yaml` is `.yaml`, so the user's global `*.lock` ignore does
  NOT match it (no `git add -f` needed; that caveat is Cargo.lock's).
- **pnpm 11 runs a deps-status check before every `pnpm run` script**, and
  against a `node_modules` that is a SYMLINK into an image's store it decides
  the install is stale and tries to PURGE it — which dies with
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in a container, and would
  delete the image's store if it succeeded. `verifyDepsBeforeRun: false` in
  `pnpm-workspace.yaml` turns it off, which is what lets a gate keep invoking
  the package's own scripts instead of duplicating their command lines.
  Setting `CI=true` "fixes" the TTY error by letting the purge proceed —
  do not.
- **A gitignore pattern with a trailing slash matches directories only**, and
  a linked-in `node_modules` is a SYMLINK, so `node_modules/` does not ignore
  it. Drop the slash when the path can be a link.

## Renames

- **A namespace-token rename (`.shojiku-*`→`.sj-*`, a `data-*` attr) is
  NOT a blanket `s/stem-/new-/`.** The same stem appears as FUNCTIONAL
  strings that must survive: URL/mount paths (`/shojiku-api/`), CLI
  commands, localStorage keys (`shojiku.*`), wasm/docker/npm/Vite-plugin
  names, the `@shojiku/` import scope. Enumerate the distinct contexts
  FIRST (`grep -o 'stem-[a-z-]*' | sort | uniq -c`), replace with a
  guard (negative lookahead over the functional tokens), and assert the
  leftover set is EXACTLY the known-functional occurrences — not
  "zero". `make gui` catches a renamed test `querySelector`, but NOT a
  corrupted URL literal inside an assertion string.
