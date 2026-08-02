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

## Never run two gates at once

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

```sh
docker run -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -v "/abs/repo:/repo" -w /repo/gui \
  -v shojiku-pnpm:/pnpm-store node:24-bookworm-slim sh -euc '
    corepack enable; pnpm config set store-dir /pnpm-store;
    pnpm install --frozen-lockfile >/dev/null 2>&1;
    cd <pkg>; pnpm exec vitest run <files>'
```

The env var silences corepack's update prompt (which otherwise hangs
the run to EXIT=1 with no output); the ABSOLUTE mount avoids the drift
above. Re-run the full `make gui` once before committing (it also runs
lint/format on the final files).

**Use THIS image and store volume, not an improvised pair.** `node_modules`
lives on the repo mount, so an install run under a different base image
leaves another platform's native bindings there and the next run dies with
`Cannot find module './rolldown-binding.<platform>.node'` — which reads
exactly like a broken dependency tree rather than an image mismatch. The
image must be the Makefile's `NODE_IMAGE` and the store must be
`shojiku-pnpm:/pnpm-store`; copy the flags from `PNPM_IN_DOCKER` rather
than typing them from memory.

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

## `make wasm` is not byte-reproducible across host architectures

The pinned Rust container produces a DIFFERENT `shojiku_wasm_bg.wasm`
on an arm64 host than on CI's x86_64 runners (the `.js`/`.d.ts`
outputs match; only the binary differs), while CI runs reproduce each
other byte-for-byte. Anything that byte-compares the wasm — the
`site-check` gate over `site/.data/wasm` — therefore treats the
x86_64 CI build as canonical: on a non-x86 host, refresh from the CI
`wasm-pkg` artifact (`gh run download <run> -n wasm-pkg`) instead of
your local `make wasm` output. Root-causing the nondeterminism is a
filed backlog candidate.

**But do NOT read a stale `site-check` as "just the arm64 thing".** Any
change to a crate the wasm links — `shojiku-layout` especially — moves
the binary for real, and CI's `site` job compares its OWN x86_64
`wasm-pkg` against the committed `site/.data/wasm`, so architecture
cannot be the cause there: the job fails on CI too until the committed
data is refreshed. The two causes look identical locally (`stale:
…/shojiku_wasm_bg.wasm`, `drift 1`), so tell them apart by what the
change touched, not by the message. `site/.data/wasm` had been committed
exactly once and every PR since was docs/site, which is how the first
engine PR after it inherited the surprise.

The refresh has a forced ORDERING, because the canonical bytes only
exist on CI: push the branch and open the PR first, let the `wasm` job
run, then `gh run download <run-id> -n wasm-pkg -D <tmp>`, copy the
files over `engine/wasm/pkg/`, `make site-data`, and commit the
refreshed binary as a second commit on the same PR. (wasm is
architecture-neutral to RUN, so dropping the x86 build into a local
`pkg/` is fine — only its bytes differ.) Expect `make verify` to be red
at `site-check` until that second commit, and remember verify is a
CHAIN: the `sdk-*` and `docker` targets after it never ran, so say so
rather than reporting a clean local bar.
