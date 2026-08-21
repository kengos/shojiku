# Code map — gui/designer-core (headless document core)

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Designer work often spans packages — seam work reads the neighbor's map too:
> [gui-core.md](gui-core.md) ← [gui-designer.md](gui-designer.md) ← [gui-app.md](gui-app.md).
> The `gui/designer` map is split by area — its index routes to
> [canvas](gui-designer-canvas.md) / [panel](gui-designer-panel.md) /
> [insert](gui-designer-insert.md) / [chrome](gui-designer-chrome.md).

## Workspace / toolchain preamble (applies to all of `gui/`)

GUI (TypeScript, `gui/`): the React Designer — a pnpm workspace (Node
24, pnpm 11) of three packages, dependency direction strictly downward
`designer-app → designer → designer-core`. Toolchain: TypeScript
`strict`, **Biome** (one stack for lint + format, NOT ESLint/Prettier),
Vitest with 100%×4 coverage thresholds; all gates run in Docker via
**`make gui:verify`** (in `make verify`) — no host Node toolchain, mirroring
the Rust/wasm gates. Two length gates, RuboCop-style (rule on, explicit
waiver list, burn it down): per FILE, `make gui:budget`
(`scripts/check-gui-line-budget.sh`, pure POSIX sh + awk, runs FIRST in
`make gui:verify` on the host) caps every non-test `.ts`/`.tsx` at **150
executable lines** — blank lines and comments do not count, so
documenting a file costs no budget — with an in-file
`line-budget-exempt: <reason>` waiver (the same token the engine budget
uses); per FUNCTION, Biome's `noExcessiveLinesPerFunction` at 150, test
files and `e2e/` excluded, with NO waiver list.

## gui/designer-core/src (headless document core — pure TS, no React)

- `index.ts` — the public barrel: the ONLY import surface
  `designer`/hosts see.
- `document.ts` — the parse/serialize home.
  **`parseTemplate(source, maxBytes?)`** = size-capped `eemeli/yaml`
  `parseDocument` → CST `Document` (default cap `MAX_TEMPLATE_BYTES`,
  raisable per-call toward `MAX_TEMPLATE_BYTES_CEILING` for inline
  images; **`clampTemplateMaxBytes`** fail-closes a hostile limit to the
  default and clamps to the ceiling). Parsing holds aliases as NODES so
  it is bomb-safe; **`readTemplate`** = `doc.toJS({ maxAliasCount })` is
  where alias expansion + the "billion laughs" cap live. **`readNode`**
  = the SAME cap over the subtree at a yaml-path (the panel's per-node
  read; missing → `undefined`; a RAW scalar leaf stored by `map.set`
  returns as-is, never `undefined`). **`serializeTemplate`** =
  `doc.toString({ lineWidth: 0 })`, the ONE serialization home —
  folding off so authored long lines survive; output is a fixed point.
  `TemplateParseError`.
- `ops.ts` — the op layer's ENTRY POINT + public surface. **Named patch
  operations are the ONLY edit path**, each a serializable `Op` value
  for AI parity: `setScalar`/`setStrings`/`removeKey`/`renameKey`/
  `putValue`/`moveItem`/`duplicateItem`/`insertItem`/`removeItem`
  (`moveItem` alone may name a SECOND sequence, `toPath` — the
  cross-parent move).
  `applyOp` dispatches by what an op ADDRESSES — the five MAP-KEY ops to
  `keyOps.ts`, the four SEQUENCE ops to `seqOps.ts` — and validates
  fully BEFORE mutating, so a failure returns a typed `OpResult` with no
  partial edit (`OpError` codes: `path_not_found`/`not_a_map`/
  `not_a_seq`/`key_not_found`/`index_out_of_range`/`invalid_value`).
  Addressing: `path` is structural with `[n]` indices; `keys` is a pure
  map-key path under it. `path` is OPTIONAL on scalar/key ops — absent =
  the document ROOT map, the only way to reach top-level keys — and
  `path` addresses a SEQUENCE ELEMENT by index, which `keys` cannot: a
  leaf edit inside a list entry is a TARGETED op, never a whole-list
  `putValue` rewrite (the rewrite re-serializes sibling entries and
  DESTROYS their comments). The `keys` surface is AI-parity-public so it
  is capped (`MAX_KEY_DEPTH`, `setStrings` `MAX_STRING_VALUES`).
- `keyOps.ts` — the five map-key ops. `setScalar`/`setStrings`
  auto-create missing intermediate maps; `removeKey` prunes maps left
  empty. **`renameKey`** `{path?, keys, to}` replaces the `Pair`'s KEY
  scalar IN PLACE (value node + position + comments preserved;
  `createNode(to)` authors a YAML-syntax `to` as a quoted scalar — no
  structural injection). **`putValue`** `{path?, keys, value}` is the
  map-key twin of `insertItem` — a JSON-shaped `SnippetValue` set at the
  key path, validated by the SAME snippet checker, then composed via
  `doc.createNode` (the styles-registry create-empty-style form).
- `seqOps.ts` — the four sequence ops (required `path`; the root is a
  map, never a seq); the `moveItem` arm delegates to `seqMove.ts`.
  **`insertItem`** `{path, index, value}`: `value` is
  a plain JSON-shaped `SnippetValue` — never YAML text (no second
  grammar, no alias/anchor surface); a MISSING final `items`-like key on
  an existing map auto-creates an empty seq, deferred until index
  validation passes. The FIRST item inserted into an empty seq clears
  the flow flag → BLOCK style, so an authored `items: []` stops reading
  as `items: [ … ]`; a non-empty flow seq keeps its form.
  **`removeItem`** splices one element; an emptied seq is KEPT
  (`items: []`), never pruned.
- `seqMove.ts` — `moveItem`, the ONE op that can address TWO sequences.
  Without `toPath` it reorders inside `path`; with one it SPLICES the
  node into that sequence instead, so the moved subtree keeps its
  comments, quoting and anchors — which a `removeItem`+`insertItem`
  pair cannot, since `insertItem` takes a plain JSON snippet. ONE index
  rule covers both: `to` is the index in the DESTINATION after the
  source removal (same-seq the post-splice index; cross-seq the plain
  insertion index, admitting `length` to append, and clearing the flow
  flag of an empty destination exactly as `insertItem` does). Refuses
  before any splice, so a failure is byte-exact: a bad path/kind/index,
  and `invalid_value` when `toPath` lies INSIDE the moved node (the
  node would contain itself). ONE refusal is decided AFTER the splice and
  rolled back: a move touching ANCHORS is verified by asking the library
  to stringify — `eemeli/yaml` checks alias order there and throws, and
  `serializeTemplate` is a bare `toString()`, so the result would be a
  crashing SAVE rather than a diagnostic. That oracle is exact where a
  boundary heuristic is not (a shared top-level `anchors:` block aliased
  throughout is perfectly safe to move around), and it costs nothing for
  a node carrying no anchors — which is every bundled template.
  The containment walk needs no budget — a
  parsed document is a TREE (an alias is a leaf node, not a back-edge),
  and this check is what keeps it one.
- `snippet.ts` — what a snippet VALUE is, refused without reading the
  document: depth/node caps (`MAX_SNIPPET_DEPTH` also terminates cyclic
  hostile values, `MAX_SNIPPET_NODES`), finite scalars only,
  plain-object maps only (exotic objects rejected; a JSON `__proto__`
  key stays inert data). **`isSnippetValue(value)`** is the exported
  type guard over the SAME walk — the ONE public home for the
  snippet-shape rule, so a consumer that persists/reuses a materialized
  node narrows hostile storage the way the op layer does.
- `opTarget.ts` — where an op LANDS, read-only: `resolveMap`/
  `resolveSeq`/`checkKeys`/`walkIntermediates`/`findPairByKey` (matches
  both parsed-Scalar and op-created raw-string keys).
- `opCreate.ts` — the resolvers that CREATE a missing target:
  `setLeaf`'s intermediate maps, the deferred sequence auto-create.
- `opTypes.ts` — the wire vocabulary (`Op`/`OpError`/`OpResult`) + the
  clip/fail primitives.
- `path.ts` — the structural **path grammar** shared with the engine box
  index (`sections.body.items[3]` → `PathSegment[]`); `parsePath`/
  `formatPath`/`toYamlPath`, `PathSyntaxError`.
- `history.ts` — what the undo stack IS: `HistoryEntry`, the
  `MAX_HISTORY` count + `MAX_HISTORY_BYTES` budget, the pure
  `trimHistory`.
- `editor.ts` — **`Editor`** session = live `Document` +
  `serializeTemplate` snapshot undo/redo, each `HistoryEntry
  {text, selection}` restoring BOTH text AND selection (undo of a
  `moveItem` re-selects at the OLD path; redo re-selects an inserted
  item); a selection-only change is NOT a history step; selection is
  keyed by the path grammar. **`create(source, {maxBytes})`** +
  **`setMaxBytes`** thread the template-size cap through EVERY re-parse
  (rollback / undo / redo) so a legally-oversized document stays
  editable. **`subscribe(listener)`** reports each COMMITTED change
  (`{ops, source: 'apply'|'batch'|'undo'|'redo'}`) after the document
  and history settle — observation only (a refused op and an empty
  batch report nothing), so the op surface stays the single mutation
  path. **`applyAll`** applies a batch transactionally — all land as
  ONE undo step, or the first failure rolls back byte-exact and returns
  the failing op's `index` (`BatchResult`, `MAX_BATCH_OPS`).
  **`read`** exposes `readNode` for the panel, and **`ReadFn`** —
  `(path: string) => unknown` — is exported HERE as the document-read
  contract every pure model in `designer` takes (it used to live in a
  `designer` feature area, which had dozens of consumers importing a
  document type from a feature module).
- `wire.ts` — type-only read views of the template wire subset,
  mirroring `engine/core` serde names (`data` is a `DataBinding
  {key?,format?}` map, never a bare string; enum unions copied from the
  engine); no runtime code.
- `scripts/normalize-examples.ts` — the `normalize:examples` one-shot:
  rewrites every `examples/*/*/templates.yml` to the
  `serializeTemplate` fixed point.

Tests are sibling-per-module (`keyOps.test.ts` = the five map-key ops,
`seqOps.test.ts` = the four sequence ops, `seqMove.test.ts` = what a
SECOND sequence brings to `moveItem`, `snippet.test.ts` =
`isSnippetValue`, `history.test.ts` = `trimHistory`, `ops.test.ts` =
dispatch + the root-addressed form), all exercised through `applyOp` —
`opTarget.ts`/`opCreate.ts`/`opTypes.ts` have no separate public surface
and are pinned through those suites (their headers say so). Round-trip
is tested against a canonical fixed-point fixture (eemeli round-trips at
canonical-CST fidelity — comments + key order preserved, flow-seq inner
spacing normalized to `[ x ]`), so an op touches only its keys;
`roundtrip.test.ts` also globs every bundled `templates.yml` and asserts
`serialize(parse(src)) === src` — the **permanent fixed-point gate**
(bundled presets are stored normalized so a first-edit diff stays
clean).
