# Contributing to Shojiku

## Prerequisites

**Docker and `make`. Nothing else.** There is no host Rust or Node
toolchain — every gate runs in a pinned image with cached volumes, so a
clean machine produces the same result as CI. `make help` lists every
target.

## Checking your work

Checking a *result* and debugging a *failure* are different jobs, and
they use different commands.

To check a result, use the `<verb>:<scope>` grid. Each prints **one
PASS/FAIL line** and exits with the gate's **real exit code**:

| | `engine` | `gui` | `site` | `docker` |
| --- | --- | --- | --- | --- |
| `budget:` | `make budget:engine` | `make budget:gui` | — | — |
| `lint:` | `make lint:engine` | `make lint:gui` | `make lint:site` | — |
| `test:` | `make test:engine` | `make test:gui` | `make test:site` | — |
| `verify:` | `make verify:engine` | `make verify:gui` | `make verify:site` | `make verify:docker` |

The `sdk` scope nests one level further, one entry per language, because
each has its own toolchain and container: `make verify:sdk:ruby`,
`make verify:sdk:python`, `make verify:sdk:dotnet`,
`make verify:sdk:java`, `make verify:sdk:js`, `make verify:sdk:php` and
`make verify:sdk:go` — all seven, each with its `test:` and `lint:`
slices.

- **`verify:<scope>`** is that scope's whole bar — budget + lint + tests
  plus whatever else the scope needs (100% coverage, cargo-deny, the
  key-catalog drift gate, example byte-compare and the WASM build for
  `engine`). It is the slow,
  conclusive one.
- **`budget:` / `lint:` / `test:`** are the fast slices to iterate on.
- **`make verify`** is every scope at once: the full CI mirror, and the
  bar a change must clear before it ships.
- **`make quiet T=<target>`** gives any other target the same treatment.

A few targets are deliberately **on-demand** rather than part of
`verify`, because they cost minutes and answer a question most changes
do not raise: `make wasm-e2e` and `make gui-e2e` (browser golden
paths), `make fuzz` (below), and the two cross-build targets. `make capi-dist`
cross-builds
the C ABI cdylib for the
platform matrix the FFI SDKs ship (linux x64/arm64, windows x64-gnu)
into the gitignored `dist/capi/` with a `SHA256SUMS` beside it;
`make cli-dist` does the same for the `shojiku` BINARY, over the same
matrix into `dist/cli/` — those are the prebuilt CLIs a GitHub Release
offers, which the subprocess SDKs tell users to install and which
neither of them ever downloads on its own. Not to
be confused with `make capi-lib` and `make cli-bin`, which are NOT
on-demand: they build the single host-architecture cdylib the FFI SDKs'
gate containers load and the host-architecture `shojiku` binary the
SUBPROCESS ones run, and every `sdk:<lang>` target depends on one of
them. macOS
artifacts need a macOS runner and are produced at release time. (The
ordinary `make test` gate still LINKS the cdylib once in dev profile —
`cargo test` alone only builds the rlib, and the shared library is the
crate's actual deliverable — so only the cross matrix is on-demand.)

### Fuzzing (on demand, not a gate)

The parsers that read attacker-chosen bytes — the shared PDF reader and
the signature-container decoders — have libFuzzer targets in
`engine/fuzz`:

```bash
make fuzz FUZZ_TARGET=cms_container FUZZ_SECS=600
```

`make fuzz` with no arguments runs every target for a minute each. It is
deliberately outside `make verify`: fuzzing has no natural end. What the
gates run instead is the corpus **replay** — every committed seed through
the same entry points — so the targets cannot rot between runs.

A crash lands in `engine/fuzz/artifacts/<target>/`. Turn it into a
committed file under `engine/fuzz/corpus/<target>/` (the replay tests then
guard it forever) together with the fix; do not commit the artifact
itself, and do not commit anything the seed step generated — a signed
document embeds a certificate, and this repository holds no key material.

### When a gate fails

The failing run is written to a fixed path:

```bash
cat .make-logs/last-error.log
```

It opens with the target, the exit code, the time, and the last
`== step ==` the run reached — so that one file answers "where did it
fall over?" without re-running anything. The file is cleared
automatically when that same target next passes. Per-target logs sit
beside it (`.make-logs/<target>.log`); the whole directory is
gitignored.

### If the failure does not tell you *what* failed

That is a bug in the gate, not something to work around silently. Add an
entry to [docs/make_issues.md](docs/make_issues.md) — what you ran, what
it showed instead, and what actually answered the question. No approval
or scoring needed; the release engineer works through that list. Say it
while the log is still in front of you, because the next run overwrites
it.

### Do not pipe a gate to `tail`

```bash
make gui | tail -40     # WRONG
```

A shell pipeline reports the **last** command's status, so this exits
`0` even when the gate **failed** — and `tail` throws away the earlier
steps you would need to diagnose it. The commands above exist so you
never need this; if you must pipe, set `pipefail` first.

### Changing a dependency

Every gate installs from a committed lockfile (`--locked` for cargo,
`--frozen-lockfile` for pnpm) and refuses to re-resolve on its own, so a
manifest edit is not finished until the lockfile catches up. Two verbs,
over the four lockfiles — `engine`, `gui`, `site`, `sdk:js`:

```bash
make lock:gui
```

re-resolves after you edited a `package.json` or `Cargo.toml`; anything
that already satisfies its range stays put. And:

```bash
make update:gui
```

bumps to the newest release each range still allows. That one moves
dependencies you did not name, so read the lockfile diff before
committing it. `make lock` on its own is the engine scope, as it always
was; engine changes still need `git add -f engine/Cargo.lock`, which a
global gitignore otherwise hides.

Neither verb reaches a **transitive** dependency — if the parent's range
is already satisfied, pnpm keeps the version it resolved, which is how a
security advisory can survive a full `update:`. Force it with an
`overrides:` entry in that project's `pnpm-workspace.yaml`
(`pnpm audit --fix=override` writes them) and apply it with `lock:`.
Treat every such entry as temporary: it pins a dependency the tree would
otherwise move past on its own, so drop it once the parent widens.

These write files; they check nothing. Follow them with the scope's
`verify:`.

## Before you open a pull request

1. `make verify` is green. That is the merge bar.
2. Docs that describe what you changed are updated in the same change —
   the code map under [docs/code-map/](docs/code-map/README.md) whenever
   crates, modules, or boundaries move, and the relevant reference page
   under [docs/engine/](docs/engine/README.md) for authorable syntax.
3. Bundled example outputs are refreshed (`make examples`) if your
   change alters what they render.

> **CI runs the same `make` targets you just ran**, in the same pinned
> containers — engine, gui, wasm, docker, and every SDK across each of
> its supported language versions, as parallel jobs. A gate is defined
> once, in the Makefile, so a green local run means what it says.
>
> **One gate at a time per working tree.** Two gates in one tree corrupt
> each other — they share `engine/target`, and the failure blames a test
> rather than your code. `scripts/gate-lock.sh` enforces this and names
> the holder; separate git worktrees still run gates in parallel. If you
> work two branches at once, also set `WORK_TAG=<something>` so the
> locally built image tags, the designer e2e container name and its port
> do not collide — those belong to the docker daemon, not to your tree.

> **You need GNU Make 4 or newer.** make is the one tool that does not
> run in a container, and macOS still ships 3.81 (2006), which parses
> recipe quoting differently enough to hide a real failure. The Makefile
> REFUSES to run anything but `help` under 3.x (it used to warn, and the
> warning was skimmed past); on macOS, `brew install make` and put its
> `libexec/gnubin` ahead of `/usr/bin` in `PATH`.

## Where the rules live

- [docs/architecture.md](docs/architecture.md) — system overview,
  component boundaries, cross-cutting principles. Read before moving
  code between components.
- [docs/guidelines.md](docs/guidelines.md) — formatting, the 100%
  coverage rule and its exclusions.
- [docs/agents/](docs/README.md#agent-policies) — the policy for the
  area you are touching.
- [CLAUDE.md](CLAUDE.md) — the repo map AI agents read first; useful to
  humans as a dense index of where everything is.
