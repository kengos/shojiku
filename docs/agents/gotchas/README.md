# Gotchas — hard-won traps, by area

> AI-only. These files hold the incident-derived traps — the things
> learned the hard way. The rest of `docs/agents/` states the
> *standards*; this directory keeps the *stumbles*, so a policy read
> stays cheap and a trap is read exactly when it applies.

## How to use this directory

- **Pre-flight (before building)**: during `/shojiku-cycle` Phase A, the
  plan names which gotcha files apply to the change (route by the table
  below) and copies the handful of *specific* applicable traps into
  CYCLE.md as a known-traps (pre-flight) list. The Phase B implementer reads
  that list before the first edit.
- **When stuck**: a red gate with a confusing message, a smoke that
  "disproves" a tested feature, a sweep that reports zero — check the
  matching file here *before* debugging cold. Most entries exist because
  someone debugged the symptom for a full loop when the cause was
  environmental.
- **Write-back**: cycle Phase E routes new toolchain/test/verification
  stumbles HERE (the owning skill keeps only standards + the pointer).
  Same rules as skills: no dates, no work-item codes, fix wrong text
  in place, consolidate ≥3 incidents of one class into one rule.

## Routing

| You are about to… | Read |
| --- | --- |
| run cargo/pnpm gates through Docker, background a gate, iterate on tests in a container | [docker-make.md](docker-make.md) |
| write or modify Rust under `engine/` | [rust-engine.md](rust-engine.md) |
| write TypeScript under `gui/` (Biome, tsc, pnpm, refactors/splits) | [gui-toolchain.md](gui-toolchain.md) |
| write or fix gui tests (jsdom, RTL, vitest, the 100%×4 coverage bar) | [gui-testing.md](gui-testing.md) |
| touch the `eemeli/yaml` document model (designer-core ops, serialization) | [yaml-doc-model.md](yaml-doc-model.md) |
| smoke the running Designer in a browser (dev server, Browser pane, drag) | [browser-smoke.md](browser-smoke.md) |
| run a bulk edit/rename/sweep, or write a count/claim into a doc, commit message, or review | [verification-claims.md](verification-claims.md) |

Coverage-gate diagnosis for the Rust workspace stays in its own skill
(`shojiku-coverage`); the gui-side coverage traps are in
[gui-testing.md](gui-testing.md).
