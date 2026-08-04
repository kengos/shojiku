# Verification — how correctness is established here

**Read this before claiming anything works.** It is the rulebook behind
one user rule: *a correctness claim comes from a `make` target, and you
do not invent an equivalent.*

The allowlist of commands is the top of the [Makefile](../../Makefile) —
`head -30 Makefile` prints it, and `make help` lists every target in
full. This file says why that list is the whole permitted surface, where
its edge is, and what to do when the command you want is missing.

## The rule

**Only the operations in that list establish correctness.** Concretely:

- "the tests pass", "lint is clean", "coverage holds", "this is ready" —
  each must name the make target that said so, and its `PASS` line.
- No hand-built equivalent, however tempting the speed. Not
  `docker run … cargo test -p <crate>`, not
  `pnpm exec vitest run <file>`. The targets carry the repo-root mount,
  the pinned image, the gate lock, the log path and the exit-code
  discipline; an incantation re-derives four of those from memory each
  time, and mount drift is the single biggest documented time-sink in
  this repo.
- **Never wrap a gate.** Not in a pipe (`make gui | tail -40` reports
  *tail's* status, so it exits 0 over a failed gate), not in a redirect
  plus `; echo $?` (same trap, suffix form — the exit code you read is
  `echo`'s), not in `make -n` (make EXECUTES recipe lines containing
  `$(MAKE)`, so a "dry run" takes the gate lock and can kill a gate
  already running in the tree). Each of these has reported a RED gate as
  green here; the second and third did so within one hour of each other.
- The targets already give you what wrapping was for: one PASS/FAIL
  line, the full log at `.make-logs/<target>.log`, and every failure at
  the fixed path `.make-logs/last-error.log`.

## The edge: reading is not checking

Inspection is unrestricted and needs no target — grep the tree, read a
vendored dependency's source out of the cargo volume, decode the bytes
of a rendered PDF, drive the running app in a browser. This is not a
loophole to be minimised: probing `krilla` and `xmp-writer` that way is
what found an XMP injection hole that no gate would ever have flagged,
because the code was *correct* and the third-party contract was the
surprise.

What separates the two is the CLAIM. Inspection produces a hypothesis;
a make target produces a verdict. **Convert what you learn into a test,
then run the target, then say it works.**

## When the command you need does not exist

**Ask, then add a target — do not type a one-off.** A missing scope is a
gap in the grid, and filling it is cheap:

- it stays honest, because CI runs the same targets;
- everyone after you gets the same command;
- and the alternative — a private incantation that lives in one
  session's memory — is exactly what this rule exists to stop.

Both narrowing flags came from this route, after a cycle in which the
gap got filled with hand-typed `docker run`s instead:

- `make test:gui F=<file pattern>` — coverage dropped, since one file
  cannot meet a workspace threshold;
- `make test:engine P=<crate> F=<name filter>` — ~30 s against a crate
  where the workspace run is ~4 min. It prints
  `capi cdylib link SKIPPED (narrowed run)` so the narrowed result can
  never be mistaken for the full one.

Both say the same thing about their own limits: a narrowed run proves
nothing about what it skipped, so the plain target is what you run
before claiming the tests pass.

## A green `make verify` does not expire on every edit

`make verify` is a statement about the tree's **gate-relevant** state.
Re-running the ~20-minute mirror for a change that cannot reach a gate
is waste, not rigor — and it trains you to treat the gate as ceremony.

- Changes no gate reads: Makefile **comments**, `docs/agents/**`, this
  file. Nothing parses them; verify stays valid. Prove it by grep if you
  are unsure — that is inspection, and it is free.
- Changes that reach exactly one scope: re-run **that** scope
  (`verify:gui`, `test:engine`), not the whole mirror.
- Changes to a gate's own recipe, or to code any gate compiles: the
  mirror is back on the table.

Saying "verify was green before these three comment edits, and no gate
reads comments" is a stronger claim than a second green run, because it
names *why*.

## Where this is written down

| Home | Holds |
| --- | --- |
| top of [Makefile](../../Makefile) (`head -30`) | the allowlist itself — the commands |
| `make help` | the full target inventory |
| this file | the rule, its edge, and the missing-command protocol |
| [CLAUDE.md](../../CLAUDE.md) | § The other half of the map — routes here alongside the other rulebooks (architecture, guidelines, gotchas) |
| [gotchas/docker-make.md](gotchas/docker-make.md) | the incidents behind each clause |
