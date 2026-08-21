# Code map — conventions

> AI-only. This file is the canonical rule set for every map in this
> directory. The maps are the token-saving entry point: an agent reads
> the touched component's map BEFORE searching or editing (routing table
> in [CLAUDE.md](../../CLAUDE.md)); seam work reads BOTH sides' maps.
> Human readers never need these files.

## Structure

- **One map per component**, split so a session loads only the touched
  area. `gui/designer` is further split by area; its index file
  ([gui-designer.md](gui-designer.md)) routes to the area files.
- Every map opens with the same preamble: the AI-only note, the
  read-before-searching rule, the update-in-same-PR rule, and a
  one-line granularity statement.
- **Area-wide shared postures are stated ONCE near the top of the map**
  (e.g. "pure models never throw — hostile input degrades to null",
  "every multi-part edit is ONE `applyAll`"), never repeated per file
  entry.

## Entry granularity — what a bullet carries

One bullet per file (or per tight file cluster): **role + key exported
types/functions + load-bearing contracts**. Load-bearing means: a claim
whose violation breaks a neighbor — seam contracts ("the ONLY
layout↔renderer contract"), single-home claims ("the ONE binding choke
point"), hostile-input postures, ordering contracts ("this hook order is
load-bearing"), and non-obvious placement rules ("append a key to the
matching submodule when the wire widens").

| Belongs in a map entry | Lives elsewhere |
| --- | --- |
| file role, key exports, module topology | — |
| seam / single-home / ordering contracts | — |
| hostile-input posture (degrade, caps EXIST) | the cap's numeric value → the code / `docs/engine/` |
| test-suite topology (which suite mirrors what) | per-test detail → the suites themselves |
| — | defaults & keyword sets → accessors + `docs/engine/` feature pages |
| — | diagnostic-code enumerations → `docs/engine/diagnostics.md` |
| — | CSS/Unicode/spec behavior → `docs/engine/` (layout-model + feature pages) |
| — | rationale & history → `docs/engine/features.md` § Decision log |
| — | incident-derived traps → `docs/agents/gotchas/` |
| — | work-item codes & dates → nowhere (forward-looking set only) |

## Register

- Token-dense one-liners; no prose paragraphs. Full sentences are fine
  inside a bullet, but a bullet states facts, not narration.
- Relative markdown links must resolve from the map's own directory.
- A structural claim in a map ("these modules never import each other")
  is a falsifiable claim: prove it with the grep before writing it, and
  re-prove it whenever a change touches its subject
  (`docs/agents/gotchas/verification-claims.md`).
- A claim that a gate/test enforces something names the command that
  holds it; never assert protection that does not exist.

## Maintenance

- **Update the touched map in the same PR whenever files, modules, or
  boundaries change** (cycle Phase C; a cycle that alters structure but
  not the map is not done).
- **A split or move is a free AUDIT of the entries it rewrites**: you
  have just re-read the source to move it, so check the old bullet's
  behavioral claims against what you read rather than transcribing them
  into the new ones. A refactor found an entry asserting that
  row-condition edits rewrite the whole list with one `putValue` when
  the code had addressed a single entry by `[n]` — the opposite claim,
  and the load-bearing one, since per-entry addressing is what keeps the
  neighbours byte-exact. Nothing else audits these: a stale behavioral
  claim compiles, and no gate reads prose.
- **Granularity creep is a curation defect**: a map bullet that has
  grown numeric caps, default values, keyword enumerations, or spec
  behavior is carrying another doc's content — move it to the owning
  doc (table above) and keep the pointer-shaped claim. A component map
  markedly larger than its peers usually means misplaced detail, not a
  bigger component.
- When a map's component grows past one comfortable session load, split
  the map by area (the gui-designer precedent) and add the routing
  table to its index file + CLAUDE.md.
