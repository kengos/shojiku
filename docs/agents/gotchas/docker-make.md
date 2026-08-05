# Docker / make execution traps (shared: engine + gui)

> AI-only. Standards live in `shojiku-rust-professional` /
> `shojiku-node-professional`; this file is the incident list for
> running anything through the Docker wrappers.

## Check `make --version` once, at the start of the session

macOS's `/usr/bin/make` is GNU Make **3.81**, and gates run under it can
pass here and fail in CI ([CONTRIBUTING.md](../../../CONTRIBUTING.md)
names the fix). The Makefile does warn — but it warns as a three-line
banner on EVERY invocation, which is exactly the shape a reader learns to
skip, and the gate still runs and still prints `PASS`. So the warning is
not a reliable interrupt: check the version once yourself, and if it is
3.x use Homebrew's `gmake` (GNU Make 4.x) for every gate in the session
rather than re-reading the banner each time.

## Mount discipline — the single biggest time-sink in this repo

The mount MUST be the absolute repo root, and it MUST stay the same
across every run. `target/` lives in the mount, and each Rust test
binary bakes its compile-time `CARGO_MANIFEST_DIR` absolute path
(fixtures/fonts resolve as `CARGO_MANIFEST_DIR/../../packs`). Both traps
make a *correct* change look broken:

- **cwd drift**: `$(pwd)` mounts whatever the shell's cwd is. A
  `cd …/engine` earlier (cwd persists between tool calls; `cd x && cmd`
  does NOT persist) makes `$(pwd)` mount `engine/` at `/repo`, so the
  repo-root `packs/` is invisible and every font-loading test dies with
  `Pack(NotFound("biz-ud"))` — nothing to do with your code. Use the
  absolute path; for `make`, run `cd /absolute/path/to/repo && make …`
  so `$(CURDIR)` is the repo root. The cheapest tell that you have
  drifted is `make: *** No rule to make target 'quiet'` — there is no
  Makefile where you are standing, and it reads as a broken target
  rather than as a wrong directory. On a DIRECT
  `docker run -v "$PWD:/repo"` the tell is different and reads even less
  like a mount problem: the tool reports NOTHING TO DO over a tree you
  know is full (`go list ./...` → "matched no packages", a bare `ls` →
  no output), because the subpath you mounted now sits one level below
  `/repo` and the path you asked for is empty. `ls /repo` before
  believing the tool.
- **mixing mounts corrupts the cache**: building under an engine-mounted
  layout once bakes a wrong `CARGO_MANIFEST_DIR` into the cached e2e
  test binary; a later correct-mount run *reuses that stale binary* and
  keeps failing. Force a rebuild (`touch layout/tests/e2e/main.rs`, or
  `cargo clean`) under the correct mount to re-bake the path.
- **The same `font pack not found` symptom has a third cause with the
  mount CORRECT**: a hand-run CLI (`cargo run -p shojiku-cli -- render/
  preview …`, e.g. a render-probe) has NO default pack directory — only
  the `make` example targets pass one — so it dies with
  ``font pack `biz-ud` not found in any font dir`` until you add
  `--font-dir /repo/packs/fonts --locale-dir /repo/packs/locale`.
  Two more probe knobs that each cost a loop: the output flag is
  `--output` (not `--out`), and a minimal template still needs the full
  `sections: { body: { type: flow, box: … } }` shape — a bare `body:`
  is an unknown top-level key.
- The gui side has the same shape: a backgrounded `cd some/dir && cmd &`
  — or ANY earlier `cd some/dir && grep …` — leaves the SHELL's cwd
  there, and the next `$PWD` mount silently mounts the wrong tree. The
  symptoms are corepack prompting to download a different pnpm MAJOR (no
  package.json at the mount root pins it),
  `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, "cd: can't cd to <pkg>", and a
  stray `node_modules`/empty dir left AT the mis-mounted root to clean
  up. Anchor every `$PWD`-mounting run at the repo root explicitly
  (`cd /path/to/repo && docker run -v "$PWD:/repo" …`).

- **Linking an image's dependency store into a MOUNTED source tree needs a
  real `node_modules` beside the package, not `NODE_PATH`** — ESM resolution
  does not consult `NODE_PATH` at all, so a vitest config importing
  `vitest/config` fails to resolve while the same setup works for anything
  still on CJS. The link has to be made by the RECIPE at run time, too: a
  symlink baked into the image is buried by the mount that lands on top of it.

## A daemon that answers `docker version` can still pull nothing

`docker pull` producing ZERO output for tens of minutes — for a 900 MB SDK
image and for `hello-world` alike — is a Docker Desktop VM networking fault,
not a slow registry and not a repository problem. What makes it hard to read
is that every cheap check passes: `docker version` answers, `docker images`
works, and the HOST's own network to the same registries is fine
(`curl https://mcr.microsoft.com/v2/<repo>/tags/list` → 200,
`https://registry-1.docker.io/v2/` → 401, both in under a second). The daemon
reports no proxy either, so there is nothing in `docker info` to blame.

Diagnose it in that order — host `curl` to the registry API, then `docker pull
hello-world` — and if the tiny pull also stalls, stop debugging the image and
**restart or update Docker Desktop**. One stage lost ~25 minutes to this and
was unblocked by a Docker Desktop update alone, with no change to the
Dockerfile that appeared to be failing.

One thing worth ruling out first, because it looks identical: a pull of a tag
that does not exist also hangs silently. Check the tag before blaming the
daemon —
`curl -s https://mcr.microsoft.com/v2/<repo>/tags/list | python3 -c "import
sys,json; print(json.load(sys.stdin)['tags'])"` — which is how the same stage
learned there is no Debian-based .NET 10 image at all.

## A base-image PULL can time out mid-gate

- **`DeadlineExceeded: context deadline exceeded` on a `FROM` line is a
  registry flake, not a gate failure.** `make verify` died at
  `== sdk python image ==` with that error under
  `FROM python:3.11-slim-bookworm`, having already passed rust,
  coverage, deny, examples, wasm, napi, gui and the ruby SDK. Re-running
  the single job (`make quiet T=sdk-python`) passed immediately. The
  tell is the error naming a `FROM` line and a Docker build id rather
  than any step of the gate itself. Re-run the ONE job to confirm, then
  the whole bar for a clean artifact — do not go looking for a code
  cause, and do not treat it as a review finding. (Same family as the
  trivy vuln-DB download flake in `shojiku-release-engineer` § CI.)
- **A `can't find crate for <dep>` in a crate your change never touched
  is the same class.** `make test:engine` died with
  `error[E0463]: can't find crate for clap` in `cli/src/main.rs` — three
  missing extern crates in one unrelated binary — on a tree whose
  previous `test:engine` had passed, and PASSED again on an UNCHANGED
  re-run. The tell is the same one: the error names crates and a file
  nothing in the diff goes near, and the failing crate is not the one you
  edited. Re-run the single gate once before reading a line of code; only
  a failure that REPRODUCES is about the change.

## Never run two gates at once

**`make -n` is NOT a dry run here, and it can kill a running gate.** GNU
make executes any recipe line containing `$(MAKE)` even under `-n` (that
is the documented `+`/`$(MAKE)` recursion rule — the point is to let
sub-makes report what THEY would do). Most of this repo's convenience
targets delegate that way, so `make -n verify` and `make -n quiet
T=budget` really run sub-makes: they take the gate lock, contend with a
gate already running in the tree, and the running `make verify` dies at
whatever target it had reached (`cli-bin`, in the incident) with a lock
message that reads like a stale lock rather than like contention. The
"dry run" also leaves a `# FAILED: <target>` header in
`.make-logs/last-error.log` from its own sub-make, which then looks like
an outstanding failure of the real run.

To check that an edit did not break the Makefile, parse it instead of
pretending to run it: `make help` (it only greps the file), or diff the
change and confirm it touched no recipe line. To see what a target would
do, read the recipe.

**This is now enforced, not just advised**: `scripts/gate-lock.sh` wraps
every containerised gate and refuses a second one in the SAME working
tree, naming the holder (command, pid, start time). It is keyed by
working tree, so separate worktrees still run gates in parallel — which
is the point of isolating a parallel session in one. `SHOJIKU_GATE_DIR`
puts the marker somewhere shared so `ls` shows every running gate across
every tree; it is re-entrant (`make quiet T=verify` holds it once for the
whole run), and it releases on an INTERACTIVE Ctrl-C. If a crash ever
leaves one behind, the error message prints the exact `rm -rf` to clear
it.

**Cancelling a gate you started from an agent harness is not Ctrl-C, and
`kill -INT` on the top-level make does NOT stop it.** The signal does not
reach the `docker run` under the recipe: the container keeps compiling,
the lock stays held, and `ps` on the make pid still answers alive — so a
run you believe you cancelled goes on owning the tree. Kill the CONTAINER
first, then the make chain:

```sh
docker ps -q | xargs -r docker inspect \
  --format '{{.Name}} | {{range .Mounts}}{{.Source}} {{end}}' | grep <repo path>
docker kill <the container name that printed>
kill -INT <make pids, innermost first>
```

Then confirm BOTH: `ls $SHOJIKU_GATE_DIR` is empty and the inspect sweep
finds no container still mounting the tree. Cancelling is worth doing
rather than waiting whenever the tree is about to change — a mid-run
scope decision (a review finding, an answer that widens the change)
makes the in-flight `verify` stale the moment you edit, and its ~10
minutes are already spent.

**Before running that `rm -rf`, TEST that the holder is dead** — clearing
a LIVE holder's lock causes precisely the `engine/target` corruption the
lock exists to prevent, and the message itself cannot tell the two cases
apart. Two checks, both needed: `ps -p <the pid the message names>` must
come back empty, AND no container may still be mounting the tree —

```sh
docker ps -q | xargs -r docker inspect \
  --format '{{.Name}} | {{.Config.Image}} | {{range .Mounts}}{{.Source}} {{end}}' \
  | grep <repo path>
```

The two answers can disagree, which is why one alone will not do: a stale
lock naming a dead `site-build` pid was found while two unrelated day-old
`pnpm … dev` containers were still mounted on that same tree — so "is
anything running?" answered no by pid and yes by container. Neither
container was a gate, so the lock really was stale; but the pid check
alone would have been believed too readily, and the container check alone
would have blocked a clear that was safe.

**What the lock does NOT cover — the global docker namespace.** Image
tags, container names and host ports belong to the daemon, not to a tree
or a volume, so two worktrees still collide there. `WORK_TAG` namespaces
every locally built image (and the designer e2e's container name and
port); the default reproduces today's names exactly, so the tags quoted
in README and docs stay correct. A parallel session sets
`WORK_TAG=<work item code>` and removes its images when the work
completes. The sharpest case was the designer e2e: it used a FIXED
container name with `docker rm -f` plus a `trap … EXIT`, so a second
session actively killed the first's running container — and the victim
reported "server never came up", which reads like a flaky test.

**Cache volumes stay SHARED on purpose.** Deleting a per-session
`shojiku-cargo` costs a crate re-download plus a `cargo-llvm-cov`
recompile (minutes, every cycle), while an image rebuilds from the layer
cache in seconds. `CARGO_VOLUME` / `RUSTUP_VOLUME` / `PNPM_VOLUME` are
overridable if a session ever needs true isolation — but that is an
escape hatch, and whatever it creates has to be cleaned up: seven
orphaned `shojiku-*` volumes (≈2 GB, oldest a month old) were found and
reaped on one machine.

- The browser-smoke prep step `rm -rf gui/*/coverage` is a GATE-KILLER
  when a gui gate is running in the background: vitest dies mid-run with
  "Something removed the coverage directory … Vitest created earlier",
  which reads like a vitest bug rather than your own cleanup. Sequence
  them — smoke prep only while no gate is in flight.

- **The gates share named Docker volumes and one `engine/target`, so a
  second gate started while one is running corrupts both.** The tell is
  a cargo error that blames a test rather than your code:
  `error: test failed, to rerun pass -p <crate> --lib` /
  `could not execute process … (never executed)` /
  `No such file or directory (os error 2)` — the binary the runner was
  about to execute was deleted underneath it by the other run. Nothing
  is wrong with the change; re-run the gate alone. This is easy to hit
  from an agent harness, where a "quick" second command lands while a
  long gate is still going in the background.

## Image pinning

- Read `RUST_VERSION` from the Makefile before copy-pasting an ad-hoc
  cargo command — the tag drifts, and a mismatched image builds in a
  separate target cache, silently doubling compile time.
- **Iterating on gui test files in Docker? Use the SAME pinned image
  `make` uses (`node:24-bookworm-slim`).** The shared `gui/node_modules`
  holds platform-native binaries (rolldown/oxc); an `alpine` (musl)
  image links musl bindings that then fail the glibc `make gui` with
  `Cannot find native binding` — recovery is a full
  `pnpm install --frozen-lockfile --force`, a ~2-min loop for a shortcut
  that saved nothing.

## Cross-compiling inside the toolchain image

- **`--no-install-recommends` drops the cross libc, and the failure
  lands in a build script.** `apt-get install gcc-x86-64-linux-gnu`
  without `libc6-dev-amd64-cross` gives you a compiler with no target
  headers, so `ring` (which compiles C) dies with
  `bits/libc-header-start.h: No such file or directory` deep inside
  `cc-rs` — not at install time, where you would look. Name the
  `libc6-dev-<arch>-cross` package explicitly beside every cross gcc.
- **Which cross toolchain you need depends on the BUILDER's
  architecture, not the target list.** An Apple Silicon machine runs an
  arm64 container, so aarch64 is native and x86_64 is the cross; an x86
  builder is the other way round. Pick with
  `case $(dpkg --print-architecture)` rather than installing a fixed
  pair — the wrong guess either fails to install or silently builds the
  native target twice.

## A compound `quiet` run does NOT refresh the per-target logs

`make quiet T="site site-check"` (what `verify:site` delegates to)
writes ONE log, `.make-logs/site_site-check.log`. The per-target
`.make-logs/site-check.log` is left exactly as whatever the last
STANDALONE run of that target wrote — which, right after you have
deliberately induced a failure to prove a gate has teeth, is a FAILING
log sitting next to a passing compound gate. Reading it back is how a
green run gets reported as red (and the reverse is worse). Match the
log file to the command you actually ran, and re-run the target
standalone if you want its own log to reflect the current state.

`.make-logs/last-error.log` has the same shape: it is cleared when that
TARGET next passes, so a deliberately-failing smoke (a guard that is
SUPPOSED to refuse) leaves a FAILED header behind indefinitely. Read its
first line — it names the target — before treating it as an outstanding
failure.

## Exit codes: never pipe a gate

- **Inside a gate RECIPE, `sh -euc 'a && b; c'` greens over a failed `b`.**
  POSIX suppresses errexit for a failing command inside an `&&`/`||`
  (AND-OR) list, so the chain does not abort; `c` then runs and ITS
  status becomes the recipe's. An SDK gate shipped this way for one run
  and printed **PASS while the linter had failed and the test suite had
  never executed** — the packaging step after the `;` succeeded and
  spoke for the whole recipe. Write gate recipes **one command per
  line** (`cmd ;\` per line): a SIMPLE command's failure does abort
  under `-e`. Proof in two lines —
  `sh -euc 'false && true; echo R'` prints R and exits 0, while
  `sh -euc 'false; echo R'` exits 1. A pure AND-OR chain with nothing
  after it happens to fail-closed (the failing step is the last command
  executed), which is exactly why the bug returns silently the day
  someone appends a step. The tell is a PASS over a log whose test
  section is simply absent — check the log names its test count, not
  just its PASS line.
- **Never pipe a gate whose exit code guards the next step**: in
  `make budget 2>&1 | tail -1 && git commit …` the chain sees TAIL's
  exit code, so a red gate sails through to the commit (this shipped a
  315-line file past the budget once).
- **This includes background runs**: a backgrounded
  `make verify | tail -30` reports "completed (exit 0)" while a gate
  inside it failed — the notification carries the PIPE's exit code, and
  the truncated output may not even show which gate died. The pipe also
  costs the only progress signal: the background output file stays
  EMPTY until the pipeline ends, whereas the unpiped target writes
  `.make-logs/<target>.log` live and can be tailed while it runs. And
  there is nothing to shorten in the first place — a `verb:scope`
  target's whole output is ONE PASS/FAIL line.
- **The fix is a target, not a shell incantation.** `make verify:gui` /
  `test:engine` / `budget:gui` … and `make quiet T=<any target>` (grid
  in [CONTRIBUTING.md](../../../CONTRIBUTING.md)) print one PASS/FAIL
  line and exit with the gate's REAL code, backgrounded or not. A
  failure is then `cat .make-logs/last-error.log`, which names the
  target, the exit code and the last `== step ==` reached — no piping,
  no hunting for which gate died.
- **A trailing `; echo …$?` is the same trap in suffix form**: the
  compound's exit is the echo's 0, so a backgrounded
  `make coverage > log; echo "exit: $?"` reports success while the log
  ends in `make: *** Error 1`. Make the gate the LAST command; read its
  result from the log, not the wrapper.
- On a FAILING containerized run, `sh -euc '… | tail'` exits nonzero
  before showing anything, and a `grep` for markers that don't occur
  exits 1 itself — write test output to a file inside the container and
  end the script with `tail -60 /tmp/out.txt; true`, or each red run
  costs extra blind loops. **Redirecting to the file is not enough on
  its own**: under `-e` the failing command aborts the script before the
  `tail` ever runs, so the whole invocation returns bare "exit 101" with
  no output — indistinguishable from a container that died. Neutralize
  the command itself (`cargo test … > /tmp/out.txt 2>&1 || true; tail …`)
  or drop `-e` (`sh -uc`). The same applies to every diagnostic `grep`
  you chain afterwards: `grep -c "FAILED"` printing the `0` you wanted
  still exits 1 and kills the rest of the line.

## Scoped gui test iteration (faster than the ~2-min `make gui`)

**`make test:gui F=<pattern>`.** It runs vitest across the workspace
against test files whose path matches, WITHOUT coverage — one file
cannot meet a 100% workspace threshold, so a scoped run that kept the
threshold would always fail and teach you to ignore the gate.

This used to be a hand-written `docker run … pnpm exec vitest run`, and
that recipe is deliberately gone: a correctness check comes from a make
target and nothing else (`docs/agents/verification.md`). The reason it
had to be exact is the reason it should not be typed at all —
`node_modules` lives on the repo mount, so an install under a different
base image leaves another platform's native bindings there and the next
run dies with `Cannot find module './rolldown-binding.<platform>.node'`,
which reads exactly like a broken dependency tree rather than an image
mismatch. The target carries the right image (`NODE_IMAGE`), the right
store volume (`shojiku-pnpm:/pnpm-store`), the absolute repo-root mount
and `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (without which the run hangs to
`EXIT=1` with no output).

A narrowed run proves nothing about the packages it skipped: finish with
`make test:gui` — or `make verify:gui`, which also lints and typechecks
the files you just changed — before saying the tests pass.

## Judging a `make test` run

Judge success by `grep -c "test result: FAILED"` — and remember cargo
STOPS at the first failing binary, so fewer "test result:" lines than
usual means a hidden failure. Field-position arithmetic over the result
lines once mis-parsed `FAILED. 553 passed; 1 failed` as green.

## Fuzzing through the toolchain image (`make fuzz`)

- **The FIRST corpus argument is the WRITABLE one.** `cargo fuzz run
  <target> corpus/<target>` does not "read the seeds" — it writes every
  input it keeps back into that directory, and one 200k-run probe put 291
  hash-named files into the hand-curated committed corpus. Pass a working
  directory first and the curated one after
  (`cargo fuzz run t /work/t corpus/t`); the later dirs are read-only
  seeds.
- **Never put that working directory on the repo bind mount.** libFuzzer
  writes a file per NEW/REDUCE — thousands a minute — and on the Docker
  Desktop mount that alone turned a 20-second budget into a six-minute run
  that looked exactly like a hang (corpus files stopped appearing while
  the process burned 100% CPU). A named volume is both fast and
  persistent, like the cargo/rustup ones.
- **`-max_total_time` can overshoot enormously.** One target twice ran
  past ten minutes on a fifteen-second budget while its own `exec/s`
  figure implied ~10 seconds had passed, then behaved normally on the next
  run. Wrap each run in a wall-clock `timeout -s INT` (SIGINT lets
  libFuzzer save its corpus) and treat 124/130 as "budget reached" — a
  real crash still exits with libFuzzer's own non-zero status.
- **The pinned rust image has `gcc` but no `g++` and no `clang`**, and
  `libfuzzer-sys` compiles libFuzzer from C++ source, so the fuzz
  container installs `g++` before anything else. Same family as the
  cross-libc trap above: the failure lands inside a build script rather
  than at install time.
- `cargo fuzz` finds its crate through `--fuzz-dir <abs path>`, so the
  fuzz crate does not have to sit under the crate it fuzzes — which is
  what lets ONE out-of-workspace crate carry targets for two crates.

## `make site-build` replaces `engine/wasm/pkg` with the SITE's engine

`site/scripts/build-pages.sh` stages the committed `site/.data/wasm` into
`engine/wasm/pkg` (the designer-app's assemble reads that path, and it is
gitignored). That directory is also what `liveRenderer.test.ts` loads as
"a fresh build of HEAD", so **after a `make site-build`, `make site` is
silently testing the RELEASED engine, not HEAD** — a green run proving
less than it looks like it does.

This only became consequential once `site/.data/wasm` deliberately
STOPPED tracking HEAD: before that the two were near enough that the
swap was invisible. `make verify` is unaffected (it does not run
`site-build`), and CI cannot hit it (separate jobs, fresh checkouts that
download the `wasm-pkg` artifact) — it bites the human who runs
`site-build` and then a gate in the same tree. Re-run `make wasm`, or
keep a copy, before trusting a later `make site`.

The tell is subtle and worth recognising: `make site-wasm-release`
suddenly SUCCEEDS where it refused minutes earlier. It is not a broken
guard — the guard compares bytes, `pkg` now holds the site's own bytes,
and the no-op re-pin is a legitimate allowed case. Check what is in
`pkg` (`shasum -a 256 engine/wasm/pkg/shojiku_wasm_bg.wasm`) before
concluding anything about the refusal logic.

## `make wasm` is not byte-reproducible across host architectures

The pinned Rust container produces a DIFFERENT `shojiku_wasm_bg.wasm`
on an arm64 host than on CI's x86_64 runners (the `.js`/`.d.ts`
outputs match; only the binary differs), while CI runs reproduce each
other byte-for-byte. Root-causing the nondeterminism is a filed backlog
candidate.

**`site-check` no longer trips on this, and an ordinary engine PR no
longer refreshes anything.** `site/.data/wasm` holds a RELEASED engine
build pinned by the sha256 digests in `site/.data/wasm-source.json`, so
the gate compares the committed bytes against that RECORD rather than
against a fresh local build — the same answer on every host. A gate that
rebuilds to compare is what forced the old dance, and it also quietly
made the homepage serve unreleased code, because "committed == a build of
HEAD" is exactly what it enforced.

What remains architecture-sensitive is the RELEASE-time re-pin, which is
rare (once per release) and deliberate. The canonical bytes are the
x86_64 CI build, so on a non-x86 host: let the release commit's `wasm`
job run, `gh run download <run-id> -n wasm-pkg -D <tmp>`, copy the files
over `engine/wasm/pkg/`, then `make site-wasm-release`. (wasm is
architecture-neutral to RUN, so dropping the x86 build into a local
`pkg/` is fine — only its bytes differ.)

That target refuses to run at the wrong moment rather than trusting the
procedure: it stops when the version being pinned to is not one
`CHANGELOG.md` lists as released, and — the one no downstream check could
ever see — when the version has NOT moved but the bytes have, since same
version + different build is by definition a build nobody released. A
mid-cycle `make site-wasm-release` therefore fails loudly instead of
silently re-pointing the site at HEAD.
