# Contributing to Shojiku

## Prerequisites

**Docker and `make`. Nothing else.** There is no host Rust or Node
toolchain — every gate runs in a pinned image with cached volumes, so a
clean machine produces the same result as CI. `make help` lists every
target.

## Checking your work

Checking a *result* and debugging a *failure* are different jobs, and
they use different commands.

To check a result, use the `<scope>:<job>` grid — scope first, so the
table reads down a column. Each prints **one PASS/FAIL line** and exits
with the gate's **real exit code**:

| | `engine` | `gui` | `site` | `docker` |
| --- | --- | --- | --- | --- |
| `:budget` | `make engine:budget` | `make gui:budget` | — | — |
| `:lint` | `make engine:lint` | `make gui:lint` | `make site:lint` | — |
| `:test` | `make engine:test` | `make gui:test` | `make site:test` | — |
| `:verify` | `make engine:verify` | `make gui:verify` | `make site:verify` | `make docker:verify` |

The `sdk` scope nests one level further, one entry per language, because
each has its own toolchain and container: `make sdk:ruby:verify`,
`make sdk:python:verify`, `make sdk:dotnet:verify`,
`make sdk:java:verify`, `make sdk:js:verify`, `make sdk:php:verify` and
`make sdk:go:verify` — all seven, each with its `test:` and `lint:`
slices.

- **`<scope>:verify`** is that scope's whole bar — budget + lint + tests
  plus whatever else the scope needs (100% coverage, cargo-deny, the
  key-catalog drift gate, example byte-compare and the WASM build for
  `engine`). It is the slow,
  conclusive one.
- **`:budget` / `:lint` / `:test`** are the fast slices to iterate on.
- **Every job has exactly ONE name, and it is quiet by default.** Add
  `V=1` — `make gui:verify V=1` — for the raw output when you are
  reading it to debug rather than asking whether it passed. There is no
  second, verbose spelling of a target to pick between.
- **`make verify`** is every scope at once: the full CI mirror, and the
  bar a change must clear before it ships.
- **`make quiet T=<target>`** gives anything that is not already a gate
  the same treatment.
- **`make make:check`** is the gate over this surface itself: it refuses
  a target filed under the wrong `mk/<scope>.mk`, a public target with no
  scope, and — the reason it exists — any tracked file naming a `make`
  target that does not exist. It reads every tracked file, so a command
  spelled in a Dockerfile or a doc comment counts too.

A few targets are deliberately **on-demand** rather than part of
`verify`, because they cost minutes and answer a question most changes
do not raise: `make engine:wasm-e2e` and `make gui:e2e` (browser golden
paths), `make engine:fuzz` (below), and the two cross-build targets. `make engine:capi-dist`
cross-builds
the C ABI cdylib for the
platform matrix the FFI SDKs ship (linux x64/arm64, windows x64-gnu)
into the gitignored `dist/capi/` with a `SHA256SUMS` beside it;
`make engine:cli-dist` does the same for the `shojiku` BINARY, over the same
matrix into `dist/cli/` — those are the prebuilt CLIs a GitHub Release
offers, which the subprocess SDKs tell users to install and which
neither of them ever downloads on its own. Not to
be confused with `make engine:capi-lib` and `make engine:cli-bin`, which are NOT
on-demand: they build the single host-architecture cdylib the FFI SDKs'
gate containers load and the host-architecture `shojiku` binary the
SUBPROCESS ones run, and every `sdk:<lang>` target depends on one of
them. macOS
artifacts need a macOS runner and are produced at release time. (The
ordinary `make engine:test` gate still LINKS the cdylib once in dev profile —
`cargo test` alone only builds the rlib, and the shared library is the
crate's actual deliverable — so only the cross matrix is on-demand.)

### Fuzzing (on demand, not a gate)

The parsers that read input nobody vetted have libFuzzer targets in
`engine/fuzz`, in two groups: **sign** — the shared PDF reader and the
signature-container decoders — and **wire** — the authored-input doors
(template, params, definitions, the aozora-ruby scanner, and the locale
and font pack manifests).

```bash
make engine:fuzz FUZZ_GROUP=wire                          one group
make engine:fuzz FUZZ_TARGET=cms_container FUZZ_SECS=600  one target, longer
```

`make engine:fuzz` with no arguments runs every target for a minute each,
which is now over ten minutes — reach for `FUZZ_GROUP` when you have
changed one side. A `FUZZ_GROUP` that names neither group is refused
rather than quietly fuzzing nothing. It is
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

It opens with the target, the **tree it ran over**, the exit code, the
time, and the last `== step ==` the run reached — so that one file
answers "where did it fall over?" without re-running anything. When the
failure is one the repository has met before, the same block also names
**what it is** and prints the command that fixes it: a registry flake to
re-run, a lockfile to re-resolve with `make <scope>:lock`, an example
output to re-render with `make examples:render`. The file is cleared
automatically when that same target next passes. Per-target logs sit
beside it (`.make-logs/<target>.log`); the whole directory is
gitignored.

The tree line is worth reading rather than skipping. Every gate names the
checkout it ran over, because that is the one mistake with no other
symptom: run from the wrong directory, a gate finds a Makefile, a full
source tree and a warm cache, and prints **PASS for the wrong branch**.
If the name is not the tree you are working in, re-run it as
`make -C /path/to/your/tree <target>`.

### Asking the build a question

Not everything is a gate. `make investigate:<thing>` answers the
questions a failure raises rather than settles — each one a command
rather than a document:

| | |
| --- | --- |
| `make investigate:tree` | which checkout do gates run over from here, and what else is checked out |
| `make investigate:docker` | is the daemon healthy — and can it actually pull? (a daemon that answers `docker version` can still pull nothing) |
| `make investigate:gates` | what is running, and how to cancel it (Ctrl-C does not reach the container) |
| `make investigate:last-error` | re-read the last failure with its diagnosis |
| `make engine:coverage-why` | which lines failed the 100% coverage gate |
| `make engine:render` | render one template to PDF with the pack directories already correct |
| `make engine:preview` | the same, to PNG — how to LOOK at a template without a browser |
| `make investigate:pins` | are the cached images the pinned versions, or something that moved |

`make help` lists them beside the gates.

### If the failure does not tell you *what* failed

That is a bug in the gate, not something to work around silently. Add an
entry to [docs/make_issues.md](docs/make_issues.md) — what you ran, what
it showed instead, and what actually answered the question. No approval
or scoring needed; the release engineer works through that list. Say it
while the log is still in front of you, because the next run overwrites
it.

### Do not pipe a gate to `tail`

```bash
make gui:verify | tail -40     # WRONG
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
make gui:lock
```

re-resolves after you edited a `package.json` or `Cargo.toml`; anything
that already satisfies its range stays put. And:

```bash
make gui:update
```

bumps to the newest release each range still allows. That one moves
dependencies you did not name, so read the lockfile diff before
committing it. `make engine:lock` on its own is the engine scope, as it always
was; engine changes stage `engine/Cargo.lock` normally — an old note
said a global gitignore hides it and `git add -f` is needed, which was
a misread of `*.log` in the global excludes.

Neither verb reaches a **transitive** dependency — if the parent's range
is already satisfied, pnpm keeps the version it resolved, which is how a
security advisory can survive a full `update:`. Force it with an
`overrides:` entry in that project's `pnpm-workspace.yaml`
(`pnpm audit --fix=override` writes them) and apply it with `lock:`.
Treat every such entry as temporary: it pins a dependency the tree would
otherwise move past on its own, so drop it once the parent widens.

These write files; they check nothing. Follow them with the scope's
`verify:`.

**Moving a lockfile does not oblige you to touch the SBOMs.** The
committed CycloneDX inventories under `sbom/` describe the last RELEASE,
not every commit — an SBOM is a statement about a released artifact, and
requiring each commit to carry a matching one made every dependency-bump
PR red on arrival for no reader's benefit. `make sbom:generate` is run and its
output committed as part of the release, where `make sbom:check` verifies
it.

What CI does check on your PR is `make sbom:lint`: the detector's own
self-tests, plus the rule that every committed lockfile appears in the map
at the top of `scripts/generate-sbom.sh` — either with an inventory name,
or with `-` and the reason it ships in nothing. **So adding a lockfile
does need you.** One that appears in neither fails the gate rather than
going quietly uninventoried.

If you want to refresh the inventories anyway, it is one command and it is
safe:

```bash
make sbom:generate
```

It is **idempotent**: an inventory whose contents have not changed keeps
its committed bytes rather than being restamped with a new timestamp, so a
bump to one ecosystem produces a one-file diff instead of dirtying all of
them. The run prints `preserved` or `written` per inventory, which is how
you see which one actually moved.

### Version literals

`make version:check` (CI job `versions`, no Docker, seconds) asserts that
every place naming a shojiku release coordinate — a cargo path-dep pin, a
maven dependency on `jp.kengos`, a `PackageReference Include="Shojiku"`,
the npm version, each SDK's version constant, a `shojiku-<semver>` archive
name in an install snippet — equals `[workspace.package]` in
`engine/Cargo.toml`. Only a release bump normally moves these, so most
changes never meet this gate.

Two ways an ordinary change can:

- `VERSION DRIFT` — you added an install snippet or a dependency pinning
  some other version. Use the workspace version.
- `VERSION UNDERCOUNT <rule>` — you REMOVED one of the places a rule
  counts (deleting an example, dropping a snippet). Each rule declares the
  number of hits it is known to produce, so that a rule which silently
  stops matching fails instead of reporting a clean tree. Lower that
  rule's floor in `scripts/check-versions.sh` in the same change.

A line that names a version for a reason that is genuinely historical
takes `version-check-exempt: <reason>`, the same shape as
`line-budget-exempt`.

## Before you open a pull request

1. `make verify` is green. That is the merge bar.
2. Docs that describe what you changed are updated in the same change —
   the code map under [docs/code-map/](docs/code-map/README.md) whenever
   crates, modules, or boundaries move, and the relevant reference page
   under [docs/engine/](docs/engine/README.md) for authorable syntax.
3. Bundled example outputs are refreshed (`make examples:render`) if your
   change alters what they render. The SBOMs are not your job — they are
   refreshed at release — but a lockfile you ADDED needs a row in the map
   in `scripts/generate-sbom.sh`.

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
