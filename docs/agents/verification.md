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
- **Never wrap a gate.** Not in a pipe (`make gui:verify | tail -40` reports
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

- `make gui:test F=<file pattern>` — coverage dropped, since one file
  cannot meet a workspace threshold;
- `make engine:test P=<crate> F=<name filter>` — ~30 s against a crate
  where the workspace run is ~4 min. It prints
  `capi cdylib link SKIPPED (narrowed run)` so the narrowed result can
  never be mistaken for the full one.

Both say the same thing about their own limits: a narrowed run proves
nothing about what it skipped, so the plain target is what you run
before claiming the tests pass.

## CI is the merge bar; `make verify` is the offline fallback

**User decision: the routine pre-PR step is no longer a local full run.**
CI is a strict SUPERSET of `make verify` — every prerequisite of that
target has a CI job running the same `make` target in the same pinned
container, and CI additionally runs `site:build`, the SDK version matrix
(local runs one version per language) and the `proof:<lang>` install
checks. A green CI therefore says everything a green local mirror would
and more, in parallel minutes instead of ~20 serial ones.

What stays local is the `<scope>:<job>` grid, **coverage included**:
`engine:budget` / `engine:lint` / `engine:test` while iterating,
`engine:verify` / `gui:verify` / `engine:coverage` before pushing. Coverage earns its
place because it is the one gate whose failure demands NEW TESTS rather
than a fix — discovering that through a push-and-wait loop is the
expensive way to learn it.

Reach for the full `make verify` only when CI is not available to you:
working offline, or changing a gate's own recipe and wanting the answer
before it reaches CI. It is still correct, just no longer routine.

Note the trigger: CI fires on `pull_request`, so opening the PR is what
starts it — pushing a feature branch alone runs nothing.

## A green run does not expire on every edit

The same reasoning applies to whatever you last ran, `make verify`
included: it is a statement about the tree's **gate-relevant** state.
Re-running a mirror for a change that cannot reach a gate is waste, not
rigor — and it trains you to treat the gate as ceremony.

- Changes no gate reads: Makefile **comments**, `docs/agents/**`, this
  file. Nothing parses them; verify stays valid. One exception worth
  knowing: `make make:check` DOES read EVERY tracked file — Dockerfiles and
  doc comments included — for the make-target names they spell in code, so a
  doc edit that names a command is checkable in seconds. Prove it by grep if you
  are unsure — that is inspection, and it is free.
- Changes that reach exactly one scope: re-run **that** scope
  (`gui:verify`, `engine:test`), not the whole mirror.
- Changes to a gate's own recipe, or to code any gate compiles: the
  mirror is back on the table.

Saying "verify was green before these three comment edits, and no gate
reads comments" is a stronger claim than a second green run, because it
names *why*.

**The inverse has no such defence: a green earned WHILE you were editing
never stood at all.** Everything above is about edits made *after* a run;
a run overlapped by edits is a different animal, because it measured a
tree that no longer exists and never existed as a whole. The gate lock
does not save you — it serializes gates, not editors — so a long run
started before a fix and read after it reports PASS over a mixture of the
two trees, and nothing in the output says so. It is the most expensive
kind of green, because it arrives exactly when you are ready to believe
it. Treat the last edit, not the last command, as the thing a green run
is about: if a file changed after the run began, the run is void, and
saying "it passed" is a claim about no tree at all.

Two habits keep it cheap. Start a long gate only when you have nothing
further to change, and when you do change something mid-run, say so out
loud in the record rather than letting the PASS line stand for the new
tree.

## Where this is written down

| Home | Holds |
| --- | --- |
| top of [Makefile](../../Makefile) (`head -30`) | the allowlist itself — the commands |
| `make help` | the full target inventory |
| this file | the rule, its edge, and the missing-command protocol |
| [CLAUDE.md](../../CLAUDE.md) | § The other half of the map — routes here alongside the other rulebooks (architecture, guidelines, gotchas) |
| [gotchas/docker-make.md](gotchas/docker-make.md) | the incidents behind each clause |
