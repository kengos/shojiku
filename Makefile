# Shojiku local CI mirror.
#
# THESE ARE THE ONLY SANCTIONED WAYS TO CHECK ANYTHING (user rule). Do not
# invent an equivalent; if what you need is missing, ASK and add it here.
# Rulebook: docs/agents/verification.md   Full inventory: make help
#
# Every name is <scope>:<job>, outside-in — the scope you are working in comes
# first, so the grid reads down a column. Each job has exactly ONE name; add
# V=1 to any of them for the raw output instead of the PASS/FAIL line.
#
#   Is it correct?            one PASS/FAIL line, real exit code, log kept
#     make verify               everything CI runs — the merge bar
#     make engine:verify        engine: budget + lint + tests
#     make gui:verify           gui: budget + typecheck + lint + coverage
#     make site:verify          make docker:verify      make sdk:<lang>:verify
#     make make:check           the gate surface itself — a misnamed target, or
#                               any tracked file naming a command that is gone
#     make hooks:verify         the tracked .claude/hooks still decide — and
#                               still let the legitimate spelling through
#
#   Faster slices while iterating
#     make engine:budget        make engine:lint        make engine:test
#     make gui:budget           make gui:lint           make gui:test [F=<pat>]
#     make <any>:<job> V=1      the same run, verbose, for debugging a failure
#     make quiet T=<target>     the PASS/FAIL treatment for anything else
#
#   Apply fixes
#     make engine:format        rustfmt        make gui:format      biome
#     make examples:render      re-render the committed example outputs
#     make sbom:generate        re-generate the committed SBOMs from the
#                               lockfiles. RELEASE-TIME: the inventories
#                               describe the last release, not every commit
#     make <scope>:lock         re-resolve a lockfile after a manifest edit —
#                               every gate is --locked / --frozen-lockfile and
#                               refuses until you do. scope = engine | gui |
#                               site | sdk:js
#                               (engine then: git add engine/Cargo.lock)
#     make <scope>:update       same scopes, but BUMP within the manifest's
#                               ranges — the verb that clears an advisory
#
#   Where did it break?
#     cat .make-logs/last-error.log                always the last failure
#
#   What makes these trustworthy — do not defeat it:
#     * NEVER wrap a gate in a pipe, in `; echo $?`, or in `make -n`.
#       Each has reported a RED gate as green in this repo.
#     * A green `make verify` stays green for changes no gate reads
#       (comments here, docs/agents/**). Re-run the scope, not the mirror.
#
# The host has no Rust toolchain (see shojiku-rust-professional): every gate
# runs inside Docker. Named volumes persist CARGO_HOME/RUSTUP_HOME so the
# toolchain components and cargo subcommands (llvm-cov, deny) install once and
# are cached across runs.
#
# GNU Make 4 or newer, because make itself is the one tool that does NOT run
# in a container and so is the one place local and CI can silently disagree.
# macOS still ships 3.81 (2006 — Apple will not ship a GPLv3 make), and the
# two versions differ on things a recipe can depend on: 3.81 strips a
# backslash-newline inside single quotes before the shell sees it, 4.x passes
# it through. A `node -e '...'` smoke written across two lines therefore
# passed every local run and failed only in CI. Homebrew's make installs as
# `gmake`; put its gnubin directory first to get it as `make`:
#
#     export PATH="$(brew --prefix make)/libexec/gnubin:$PATH"
#
# A hard error, not a warning (user decision — this used to warn, and the
# warning printed as a banner on EVERY invocation, which is exactly the shape
# a reader learns to skip: gates went green under 3.81 and the difference
# surfaced only in CI). `help` — the default goal — is exempt, so a stock-
# macOS first contact still gets the target list and this remedy instead of
# only a refusal.
ifeq ($(firstword $(subst ., ,$(MAKE_VERSION))),3)
ifneq ($(filter-out help,$(MAKECMDGOALS)),)
$(error GNU Make $(MAKE_VERSION) — CI runs 4.x, and the two differ on recipe quoting: a gate can pass here and fail there. Use Homebrew make: export PATH="$$(brew --prefix make)/libexec/gnubin:$$PATH")
endif
endif

# `make -n` is NOT a dry run here: GNU make still executes recipe lines
# containing $(MAKE) (the documented recursion rule), so a "dry" run takes
# the gate lock, contends with a running gate, and has killed one mid-run.
# Refuse it outright — read the recipe, or use `make help`.
ifneq (,$(findstring n,$(firstword -$(MAKEFLAGS))))
$(error `make -n` executes this Makefile's $$(MAKE) delegations for real (it can take the gate lock and kill a running gate). Read the recipe instead, or run `make help`)
endif
#
# Target -> CI job (.github/workflows/ci.yml):
#   engine:lint       -> job "rust"      (budget + fmt --check + clippy)
#   engine:coverage   -> job "coverage"  (100% lines, blocking)
#   engine:deny       -> job "deny"
#   docker:*          -> job "docker"    (build, render+verify PDF, trivy scan)
#   examples:check    -> job "examples"  (committed outputs == fresh render,
#                                         plus skills/*/template == its example,
#                                         plus no space/tab-indented block scalar)
#   version:check     -> job "versions" (every release coordinate — cargo pins,
#                                         maven/nuget/npm deps, artifact names,
#                                         the per-language version constants —
#                                         equals [workspace.package]. No Docker,
#                                         seconds)
#   sbom:lint         -> job "sbom"      (the detector still detects, and every
#                                         committed lockfile is either
#                                         inventoried or declared not to be.
#                                         No Docker, seconds)
#   sbom:check        -> NO ci.yml job   (drift against the lockfiles. An SBOM
#                                         describes a RELEASE, so this runs at
#                                         release time — see the release
#                                         checklist — rather than reddening
#                                         every dependabot PR that moves a
#                                         lockfile, which dependabot cannot fix)
#   make:check        -> job "versions" (the make surface's own invariant: no
#                                         misnamed target, no doc or script
#                                         naming a target that does not exist.
#                                         No Docker, seconds)
#   hooks:verify      -> job "versions" (the tracked .claude/hooks still decide.
#                                         Both halves: every deny case blocked,
#                                         and the legitimate spelling beside it
#                                         allowed — a hook that quietly stops
#                                         deciding removes a control without
#                                         reddening anything. No Docker, seconds)
#   engine:wasm       -> job "wasm"      (build wasm32 bindings + size budget)
#   sdk:ruby:verify  -> job "sdk-ruby"  (rubocop, rspec at 100% coverage, gem
#                                         build/install; engine library injected
#                                         pre-compiled by engine:capi-lib)
#   sdk:python:verify -> job "sdk-python" (ruff, mypy, pytest at 100% coverage,
#                                         wheel build/install; same injected
#                                         library)
#   sdk:dotnet:verify -> job "sdk-dotnet" (dotnet format, xunit at 100% line
#                                         coverage via coverlet, pack/restore;
#                                         same injected library)
#   sdk:java:verify  -> job "sdk-java"  (spotless, junit at 100% line coverage
#                                         via jacoco, jar + sources + javadoc;
#                                         same injected library)
#   engine:napi       -> job "napi"      (build the Node addon with its shim
#                                         feature + load it under the node floor)
#   sdk:js:verify    -> job "sdk-js"    (biome, tsc, vitest at 100% coverage,
#                                         pack/install; the injected binary here
#                                         is the ADDON, not the cdylib)
#   sdk:php:verify   -> job "sdk-php"   (php-cs-fixer, phpstan, phpunit at 100%
#                                         line coverage via a clover assertion,
#                                         composer install of the package; the
#                                         injected binary here is the CLI, which
#                                         this SDK drives as a subprocess. Also
#                                         checks sdk/php's license copies against
#                                         the root originals — they are what the
#                                         Packagist package ships, and nothing
#                                         else compares them)
#   sdk:go:verify    -> job "sdk-go"    (gofmt, go vet, golangci-lint, go test
#                                         -race at 100% statement coverage, and
#                                         a build of the package from a scratch
#                                         module; same injected CLI binary)
#
#   verify            -> ALL of the above. Green verify == safe to push.
#   engine:wasm-e2e   -> on-demand browser golden path (Playwright), NOT in verify.
#   engine:fuzz       -> on-demand libFuzzer over the untrusted-input parsers,
#                        NOT in verify. Two groups (FUZZ_GROUP=sign|wire): the
#                        PDF/CMS readers, and the authored-wire doors. The
#                        gates run the corpus REPLAY instead — engine/verify's
#                        tests plus engine/core's and engine/formatter's
#                        `fuzz_corpus` suites.
#   gui:e2e           -> on-demand Designer-app golden path (Playwright), NOT in verify.
#
# NOTE: `engine:wasm` is in `verify` because a size-budget crossing is cheap to
# discover and expensive to discover late; CI gives it its own job either way.
#
# Checking a RESULT ("did it work?") vs debugging a FAILURE are different jobs,
# and here they are the same command: a <scope>:<job> target is quiet, and the
# same target with V=1 is the raw output.
#
#   make gui:verify     -> is gui/ correct?  (budget + lint + tests, the slow one)
#   make engine:test    -> do the engine tests pass?  (just those)
#   make gui:verify V=1 -> the same run, verbose, when you need to read it
#   make quiet T=<any>  -> the PASS/FAIL treatment for anything else
#
# Without V these print ONE PASS/FAIL line and exit with the gate's REAL code. On
# a failure the whole log lands at a FIXED path — $(ERROR_LOG) — headed with the
# target, the exit code and the last `== step ==` reached, so `cat` on that one
# path answers "where did it fall over?" without hunting. It is cleared when the
# same target next passes.
#
# Do NOT do `make gui:verify | tail -40`: a pipeline reports the LAST command's
# status, so it exits 0 over a FAILED gate, and tail discards the steps you
# would need to diagnose it. That mistake is the reason the targets above exist. This bites
# HARDEST in a background run: a backgrounded `make verify | tail -30` is
# reported as "completed (exit 0)" while a gate inside it failed, and the pipe
# also costs the only progress signal — an unpiped target writes
# $(LOG_DIR)/<target>.log LIVE, so it can be tailed while it runs. There is
# nothing to shorten in the first place: a <scope>:<job> target's whole output
# is ONE line.
#
# So: to run a long gate in the BACKGROUND, background `make quiet T=verify`
# ITSELF — nothing else. There is no BG=/--detach flag here on purpose: the
# supervision belongs to whatever backgrounds it (your shell's `&`, an agent
# harness), and the gate lock is scoped to the lifetime of the make process
# that holds it, so a Makefile that detached its own children would have to
# reinvent that ownership. The two ways this has been got wrong, both of which
# reported a RED gate as green:
#   make engine:coverage 2>&1 | tail -20   # exit code is tail's
#   make verify > out.log 2>&1; echo $?    # exit code is echo's — the same
#                                          # trap in suffix form, and the real
#                                          # code is then only in the text
# Neither shortcut buys anything: `quiet` already gives you one line, the full
# log at a known path, and the true exit code.
#
# A confusing failure explains ITSELF — you should never have to go and read a
# separate catalogue to find out what a gate's output meant. Every FAIL block
# carries three things: which TREE it ran over (the drift that otherwise goes
# green), WHERE it broke (scripts/gate-culprits.sh names the file), and WHAT IT
# IS (scripts/gate-diagnose.sh names the cause and prints the command that fixes
# it — a registry flake to re-run, a lockfile to re-resolve, an output to
# re-render). The same block is kept at .make-logs/last-error.log.
#
# What that leaves is the questions a failure raises rather than answers, and
# each of those is a command rather than a paragraph: `make investigate:tree`
# (which tree do gates run over from here?), `investigate:docker` (a daemon that
# answers `docker version` can still pull nothing), `investigate:gates` (what is
# running, and how do I stop it?), `engine:coverage-why`, `engine:render`,
# `engine:preview`, `investigate:pins`. See mk/investigate.mk.
#
# `make <gate> JOBS=N` caps parallelism (cargo --jobs / Vitest --maxWorkers) for
# a machine that `make verify` would otherwise thrash.

# Keep in sync with .github/workflows/ci.yml (RUST_VERSION) and docker/Dockerfile.
RUST_VERSION := 1.97.1
RUST_IMAGE   := rust:$(RUST_VERSION)-slim-bookworm
TRIVY_IMAGE  := aquasec/trivy:latest
# Pinned to a DIGEST, and the pin is load-bearing: `make sbom:check` compares
# the committed inventories against a fresh scan byte-for-byte, so a floating
# tag would red the gate on a tree nobody touched the day anchore changes a
# cataloger. (`latest` had already moved to v1.50.0 while the committed files
# recorded 1.46.0.) The digest, not just the tag, because a tag is mutable and
# this image GENERATES a supply-chain artifact: tag-only would leave the
# generator itself substitutable, which is the same class of gap the rest of
# this change closes. Same form as the distroless runtime base in
# docker/Dockerfile. Dependabot cannot parse a Makefile, so bumping it is
# manual — as with RUST_VERSION. TRIVY_IMAGE above stays floating on purpose:
# a scanner's value IS a fresh vulnerability database, and it feeds no
# committed artifact.
SYFT_IMAGE   := anchore/syft:v1.46.0@sha256:473a60e3a58e29aca3aedb3e99e787bb4ef273917e44d10fcbea4330a07320bb
# Parallel-session isolation. Image tags, container names and host ports are
# GLOBAL to the docker daemon — a second worktree building the same tag retags
# the first session's image out from under it, and a fixed container name lets
# one session `docker rm -f` another session's running container. Neither a
# worktree nor a separate cache volume prevents that.
#
# WORK_TAG namespaces every LOCALLY BUILT image. The default keeps today's
# names byte-for-byte, so the tags quoted in README/docs stay correct; a
# parallel session sets WORK_TAG=<work item code> and deletes its images when
# the work completes (images rebuild from the layer cache in seconds — cache
# VOLUMES stay shared on purpose, because rebuilding those costs minutes).
WORK_TAG   ?= local
# Version-tagged images keep their bare `:<version>` tag by default and take a
# suffix only when a session opts in.
SDK_SUFFIX := $(if $(filter-out local,$(WORK_TAG)),-$(WORK_TAG))
# One gate at a time per working tree (scripts/gate-lock.sh explains why).
# Re-entrant, so `make quiet T=verify` holds it once for the whole run, and
# keyed by working tree, so separate worktrees still run gates in parallel —
# which is the point of isolating a parallel session in one. Set
# SHOJIKU_GATE_DIR to a shared path and `ls` shows every running gate across
# every tree.
#
# `make -n` does NOT keep you out of this: GNU make runs any recipe line
# containing $(MAKE) even under -n, so `make -n verify` really takes the lock
# and can kill a gate already running in this tree. To check an edit here,
# `make help` (it only greps the file) or read the recipe.
#
# Cancelling a gate started from an AGENT HARNESS is not Ctrl-C: `kill -INT` on
# the top-level make does not reach the `docker run` under the recipe, so the
# container keeps compiling and the lock stays held while `ps` says the make is
# alive. Kill the CONTAINER first, then the make chain — `make investigate:gates`
# prints both, and the commands to stop them.
GATE_LOCK  := scripts/gate-lock.sh

IMAGE        := shojiku-ci:$(WORK_TAG)

# The two browser golden paths build their images from shell scripts rather
# than from a recipe here, so their names are declared alongside the other
# session-namespaced ones — both so `clean:images` can name them and so the
# WORK_TAG scheme has a single place to read. The scripts derive the same
# names from $WORK_TAG.
APP_E2E_IMAGE  := shojiku-designer-app-e2e:$(WORK_TAG)
WASM_E2E_IMAGE := shojiku-wasm-e2e:$(WORK_TAG)

# Node image for the gui/ workspace gates (typecheck + lint + coverage). The
# host has no Node toolchain either — like Rust, every gui gate runs in Docker.
NODE_IMAGE := node:26-bookworm-slim

# The node SDK's gates run on the package's FLOOR (docs/agents/sdk.md), not on
# the newest release: a package that only works on the latest node has not
# actually supported the version it claims. Same rule as ruby 3.3 and python
# 3.11 for their images.
NODE_FLOOR_IMAGE := node:22-bookworm-slim

# Where `make quiet` parks full gate logs (gitignored). ERROR_LOG is the FIXED
# path a failure always lands at — read that one file instead of working out
# which target failed and where. It carries a header (target, exit code, time,
# the last `== step ==` reached) and then the whole log, and is removed when the
# same target next passes. A recipe cannot export a variable into the calling
# shell, so this is a file rather than $ERROR; `cat $(ERROR_LOG)` is the idiom.
#
# Two ways to misread these logs, both of which have reported a green run as red
# (and, worse, the reverse):
#   * a SCOPE AGGREGATE writes ONE log, named after the command you typed:
#     `make engine:verify` writes engine_verify.log and does NOT refresh
#     engine_lint.log, engine_coverage.log or any other member's stand-alone
#     log — those keep whatever their last stand-alone run wrote. Match the log
#     file to the command you actually ran; `$(ERROR_LOG)` is keyed the same
#     way and is the one that is cleared on a pass.
#   * ERROR_LOG is cleared only when THAT target next passes, so a deliberately
#     failing smoke (a guard that is supposed to refuse) leaves a FAILED header
#     behind indefinitely. Read its first line — it names the target — before
#     treating it as an outstanding failure.
LOG_DIR   := .make-logs
ERROR_LOG := $(LOG_DIR)/last-error.log

# Which TREE did that PASS/FAIL describe? Every gate line says so, because this
# is the one way to drift that has no other tell. A cwd drift into a non-repo
# announces itself (`No rule to make target`); a drift into the PRIMARY CHECKOUT
# does not — it has a Makefile, a full source tree and a warm engine/target, so
# the gate runs to completion and prints PASS for main while you believe you
# gated your branch. An agent harness that resets cwd between tool calls makes
# that the DEFAULT outcome for a worktree session, not an accident. The fix is
# `make -C /abs/path/to/worktree <target>`; this line is what makes forgetting
# it visible instead of silent. It also covers the non-gate targets, which hide
# it better because they print no PASS line to be wrong about: a bare
# `make gui:serve` serves the primary checkout, and the feature under review is
# simply absent.
TREE_ID = $(notdir $(CURDIR))@$(shell git -C $(CURDIR) symbolic-ref --quiet --short HEAD 2>/dev/null \
	|| git -C $(CURDIR) rev-parse --short HEAD 2>/dev/null || echo '?')

# Parallelism cap for the heavy gates: `make verify JOBS=4`. Unset (the default)
# lets each tool use every core, which is what you want on a big machine and is
# exactly what makes `make verify` thrash a small one. It reaches cargo
# (test/clippy/coverage) and Vitest; the Docker image build is not covered — the
# cargo invocation there lives inside docker/Dockerfile.
JOBS ?=
CARGO_JOBS  := $(if $(JOBS),--jobs $(JOBS))
VITEST_JOBS := $(if $(JOBS),--maxWorkers=$(JOBS))

# ONE NAME PER JOB, and verbosity is a FLAG rather than a second name. Every
# gate below is a two-line PUBLIC target that hands off to `gate`; the recipe
# itself lives in a private `_<scope>-<job>` target carrying no `##`, so it
# never reaches `make help` and never has to be typed.
#
#   make gui:lint        quiet — one PASS/FAIL line, real exit code, log kept
#   make gui:lint V=1    verbose — the raw output, for debugging a failure
#
# The two used to be separate targets one punctuation mark apart (`gui:lint`
# and `gui:lint`), which is exactly the shape that gets picked wrong under
# pressure. NAME is what keeps the private spelling out of the PASS line, the
# log file name and the $(ERROR_LOG) header: the user sees `gui:lint`
# throughout, and `make quiet T=<x>` on its own still labels itself <x>.
gate = $(MAKE) --no-print-directory $(if $(V),$(1),quiet T=$(1) NAME=$(2))

# wasm-bindgen CLI must match the crate version pinned in engine/Cargo.toml.
WASM_BINDGEN_VERSION := 0.2.126
# wasm-opt (binaryen) shrinks the bindgen output before the budget check.
# Pinned like wasm-bindgen, and fetched as the upstream RELEASE tarball into
# the persistent cargo volume: the `wasm-opt` CRATE builds binaryen from C++
# source, which the slim rust image has no toolchain for, and Debian's package
# would be version-pinned only by the distro. Arch-aware — an Apple Silicon
# builder runs the aarch64 image — and CHECKSUM-pinned per arch, so a
# recut/compromised release cannot silently become the tool that rewrites the
# module we ship (a version tag alone is not an integrity check).
WASM_OPT_VERSION := 123
WASM_OPT_SHA256_x86_64 := e959f2170af4c20c552e9de3a0253704d6a9d2766e8fdb88e4d6ac4bae9388fe
WASM_OPT_SHA256_aarch64 := 4b6bd61ba6cd3b18c993b4657d93426c782f9b91b74be0d38018cd8be1319376
# Size budget for the browser bindings (raw / gzip bytes) — a build over
# budget fails, so a dep that balloons the module is caught, not a footnote.
# Raw was 5 MiB from the wasm introduction until engine FEATURE growth
# (the ruby/tate-chu-yoko vocabulary) crossed it by 0.12%; raised to 5.5 MiB —
# feature growth earns a deliberate bump, a dep balloon does not.
# The gzip budget (the bytes that actually travel) went 1.5 -> 1.6 MiB when
# the PDF backend joined the browser build: adding `wasm-opt -Oz` to this
# target paid for most of that dep (it also cut the pre-PDF module by 37%
# raw / 11% gzip), and the remainder buys client-side rendering of the real
# deliverable. Net transfer 1.39 MB -> 1.63 MB.
# Then a user decision: tolerate up to gzip 3MB, and BUILD A LOADING EXPERIENCE
# to pay for it — the two ship together, because raising the budget first would
# leave a 2MB+ module reaching users with nothing covering the wait. What the
# raise buys is room for the PDF backend's neighbours, not licence for duplicate
# deps; the standing rule above still holds (feature growth earns a bump, a dep
# balloon does not). Raw moves in the same step because it trips FIRST: 5.5 MiB
# raw is ~1.9 MB gzip, so a gzip-only raise would have changed nothing. At the
# raise the module measured raw=4752252 gzip=1668242 (this target's own line).
WASM_MAX_RAW  := 8388608
WASM_MAX_GZIP := 3145728

# Run a cargo/rustup command in the pinned toolchain image with persistent
# cargo + rustup homes. Named volumes are pre-populated from the image on first
# use, so the cargo/rustc shims survive while installs accumulate.
#
# Both homes are OVERRIDABLE, and docker takes either form in `-v src:dst`: a
# bare name is a named volume, an absolute path is a host bind mount. CI passes
# paths so a restored cache lands where the container will look, which is what
# lets the pipeline run these very targets instead of a hand-copied set of
# cargo flags that drifts from them. `engine/target/` needs no such switch —
# it is inside the repository mount, so it is already on the host.
#
# MOUNT DISCIPLINE — the single biggest time-sink in this repo, and the reason
# this uses $(CURDIR) rather than $(pwd). Copy these flags for an ad-hoc cargo
# run; do not retype them:
#   * mount the REPO ROOT at /repo and let -w select the subdirectory. A
#     `cd engine` first, or a `$(pwd)` mount taken from the wrong cwd, makes a
#     CORRECT change look broken: font-loading tests answer
#     `Pack(NotFound("biz-ud"))`, and because the path is baked in at compile
#     time via CARGO_MANIFEST_DIR the wrong mount POISONS the cached test
#     binary — it keeps failing after you fix the mount until you force a
#     rebuild.
#   * keep the mount IDENTICAL across runs. Mixing mounts corrupts the shared
#     cache, and the symptom outlives the fix: the stale test binary keeps
#     failing under a CORRECT mount. Recovery is to re-bake the path —
#     `touch engine/layout/tests/e2e/main.rs` for one suite, or
#     `docker volume rm shojiku-cargo` to start the cache over.
CARGO_VOLUME  ?= shojiku-cargo
PNPM_VOLUME   ?= shojiku-pnpm
RUSTUP_VOLUME ?= shojiku-rustup

CARGO_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/engine \
	-v "$(CARGO_VOLUME):/usr/local/cargo" \
	-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
	$(RUST_IMAGE) sh -euc

.DEFAULT_GOAL := help

# One file per scope, each holding both halves of its jobs: the public
# `<scope>:<job>` wrappers and the private `_<scope>-<job>` recipes. `make help`
# lists them all because it reads $(MAKEFILE_LIST), and `make make:check`
# refuses a target filed under the wrong scope. What stays in THIS file is the
# shared machinery above, `help`/`quiet`/`verify`, and the gates that belong to
# no single scope (reference, examples, sbom, version, clean, make).
#
# Order matters only for `:=` variables read across files — the shared ones are
# all defined above this point.
include mk/engine.mk
include mk/gui.mk
include mk/site.mk
include mk/sdk.mk
include mk/docker.mk
include mk/hooks.mk
include mk/proof.mk

# The investigation surface. Not gates — they print state, they check nothing —
# so they live in their own file. See mk/investigate.mk for why they exist.
include mk/investigate.mk
.PHONY: _docker-build _docker-render _docker-scan _docker-verify _engine-budget \
        _engine-capi-dist _engine-capi-lib _engine-cli-bin _engine-cli-dist \
        _engine-clippy _engine-coverage _engine-deny _engine-fmt _engine-fuzz \
        _engine-lint _engine-napi _engine-test _engine-verify _engine-wasm \
        _engine-wasm-e2e _examples-check _gui-budget _gui-e2e _gui-lint _gui-test \
        _gui-verify _make-check _proof _proof-deploy _proof-dotnet _proof-go \
        _proof-java _proof-js _proof-php _proof-published _proof-published-crates \
        _proof-published-dotnet _proof-published-java _proof-published-js \
        _proof-published-php _proof-published-python _proof-published-ruby \
        _proof-python _proof-ruby _reference-check _sbom-check _sbom-lint \
        _sdk-dotnet-lint _sdk-dotnet-test _sdk-dotnet-verify _sdk-go-lint \
        _sdk-go-test _sdk-go-verify _sdk-java-lint _sdk-java-test _sdk-java-verify \
        _sdk-js-lint _sdk-js-test _sdk-js-verify _sdk-php-lint _sdk-php-test \
        _sdk-php-verify _sdk-python-lint _sdk-python-test _sdk-python-verify \
        _sdk-ruby-lint _sdk-ruby-test _sdk-ruby-verify _site-build _site-check \
        _site-gates _site-lint _site-node-modules _site-test _site-verify _verify \
        _version-check clean clean\:cache clean\:images docker\:build \
        docker\:render docker\:scan docker\:verify engine\:budget \
        engine\:capi-dist engine\:capi-lib engine\:cli-bin engine\:cli-dist \
        engine\:clippy engine\:coverage engine\:coverage-why engine\:deny \
        engine\:fmt engine\:format engine\:fuzz engine\:lint engine\:lock \
        engine\:napi engine\:preview engine\:render engine\:test engine\:update \
        engine\:verify engine\:wasm \
        engine\:wasm-e2e examples\:check examples\:render gui\:budget gui\:dev \
        gui\:e2e gui\:format gui\:lint gui\:lock gui\:normalize-examples \
        gui\:serve gui\:shot gui\:test gui\:update gui\:verify help make\:check \
        proof proof\:deploy proof\:dotnet proof\:go proof\:java proof\:js \
        proof\:php proof\:published proof\:published\:crates \
        proof\:published\:dotnet proof\:published\:java proof\:published\:js \
        proof\:published\:php proof\:published\:python proof\:published\:ruby \
        proof\:python proof\:ruby quiet reference\:check reference\:generate \
        sbom\:check sbom\:generate sbom\:lint sdk\:dotnet\:lint sdk\:dotnet\:test \
        sdk\:dotnet\:verify sdk\:go\:lint sdk\:go\:test sdk\:go\:verify \
        sdk\:java\:lint sdk\:java\:test sdk\:java\:verify sdk\:js\:format \
        sdk\:js\:lint sdk\:js\:lock sdk\:js\:test sdk\:js\:update sdk\:js\:verify \
        sdk\:php\:lint sdk\:php\:test sdk\:php\:verify sdk\:python\:lint \
        sdk\:python\:test sdk\:python\:verify sdk\:ruby\:lint sdk\:ruby\:test \
        sdk\:ruby\:verify site\:build site\:check site\:data site\:dev site\:lint \
        site\:lock site\:test site\:update site\:verify site\:wasm-release verify \
        version\:check

help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_\\:-]+:.*## ' $(MAKEFILE_LIST) \
		| sed -E 's/^([a-zA-Z0-9_\\:-]+):[^#]*## /\1\t/; s/\\//g' \
		| awk -F'\t' '{printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

## ---- push gate ---------------------------------------------------------

# Order is deliberate. `engine:lint` (budget/fmt/clippy) stays first because it
# is the fastest real signal and the most common failure. `engine:wasm` moved
# AHEAD of `engine:coverage`: it is a full wasm32 build rather than a lint, so it
# belong before the tests — but a size-budget crossing used to be discovered
# only after paying for the single most expensive step in the run.
verify: ## Full local CI mirror; green == safe to push
	@$(call gate,_verify,verify)

_verify: _make-check _engine-lint _engine-wasm _engine-coverage _engine-deny _reference-check _examples-check _sbom-lint _version-check _engine-napi _gui-verify _site-gates _site-check _sdk-ruby-verify _sdk-python-verify _sdk-dotnet-verify _sdk-java-verify _sdk-js-verify _sdk-php-verify _sdk-go-verify _docker-verify
	@echo "\n✅ verify passed — every CI gate is green locally. Safe to push."

# NAME labels the run; it defaults to T so `make quiet T=<x>` is unchanged.
RUN_NAME = $(if $(NAME),$(NAME),$(T))

quiet: ## Run ANY target this way: make quiet T=engine:test (same PASS/FAIL + exit code)
	@if [ -z "$(T)" ]; then \
		echo "usage: make quiet T=<target>    e.g. make quiet T=gui:verify / T=verify" >&2; \
		exit 2; \
	fi
	@mkdir -p $(LOG_DIR)
	@# A HAND-TYPED compound (make quiet T="a b") writes ONE combined log, and
	@# each member's stand-alone log would otherwise keep whatever an EARLIER run
	@# wrote — a stale FAIL beside a passing compound has been read back as a red
	@# gate. Delete those up front: an absent log cannot be misread.
	@#
	@# This does NOT reach a scope aggregate. `engine:verify` is one target whose
	@# members are PREREQUISITES, so T is a single name and there is nothing here
	@# to delete; its members' stand-alone logs stay as they were. Read the log
	@# named after the command you ran — which is what NAME makes it — rather
	@# than a member's.
	@for t in $(T); do rm -f "$(LOG_DIR)/$$(echo "$$t" | tr ':/' '__').log"; done
	@log="$(LOG_DIR)/$$(echo '$(RUN_NAME)' | tr ' :/' '___').log"; \
	if $(GATE_LOCK) $(MAKE) --no-print-directory $(T) > "$$log" 2>&1; then \
		if [ -f "$(ERROR_LOG)" ] && head -1 "$(ERROR_LOG)" | grep -qx "# FAILED: $(RUN_NAME)"; then \
			rm -f "$(ERROR_LOG)"; \
		fi; \
		printf '\033[32mPASS\033[0m %s  [%s] — full log (%s lines): %s\n' \
			'$(RUN_NAME)' '$(TREE_ID)' "$$(wc -l < "$$log" | tr -d ' ')" "$$log"; \
	else \
		code=$$?; \
		step=$$(grep -E '^== ' "$$log" | tail -1); \
		culprits=$$(scripts/gate-culprits.sh "$$log"); \
		diagnosis=$$(scripts/gate-diagnose.sh "$$log"); \
		{ echo "# FAILED: $(RUN_NAME)"; \
		  echo "# tree: $(TREE_ID) ($(CURDIR))"; \
		  echo "# exit $$code at $$(date '+%Y-%m-%d %H:%M:%S')"; \
		  echo "# last step: $${step:-(none reported)}"; \
		  echo "# full log: $$log"; \
		  if [ -n "$$diagnosis" ]; then echo; echo "# diagnosis:"; echo "$$diagnosis" | sed 's/^/#   /'; fi; \
		  if [ -n "$$culprits" ]; then echo; echo "# where:"; echo "$$culprits" | sed 's/^/#   /'; fi; \
		  echo; cat "$$log"; } > "$(ERROR_LOG)"; \
		printf '\033[31mFAIL\033[0m %s  [%s] (exit %s)\n  last step : %s\n  error log : %s  <- always this path\n  full log  : %s\n' \
			'$(RUN_NAME)' '$(TREE_ID)' "$$code" "$${step:-(none reported)}" "$(ERROR_LOG)" "$$log"; \
		if [ -n "$$diagnosis" ]; then \
			printf -- '--- what this is ---\n%s\n' "$$diagnosis"; \
		fi; \
		if [ -n "$$culprits" ]; then \
			printf -- '--- where it broke ---\n%s\n' "$$culprits"; \
		else \
			printf -- '--- last 40 lines ---\n'; tail -40 "$$log"; \
		fi; \
		exit $$code; \
	fi

## ---- job: reference ----------------------------------------------------

# The key catalog is derived from the parser, so the parser is the only source
# of its structure. This pair mirrors site:data/site:check: one target
# regenerates, the other fails on drift. Both build engine/core's non-default
# `schema` feature, which is also the only place the hand-written JsonSchema
# impls and their tests are compiled at all.
reference\:generate: ## Regenerate the key catalog AND the reference's generated tables
	@echo "== reference data refresh =="
	$(CARGO_IN_DOCKER) 'cargo run -p shojiku-authoring --bin reference-gen \
		--features schema --locked $(CARGO_JOBS)'

# Runs the schema TESTS as well as the drift comparison: the drift check alone
# is an idempotence claim, and would protect a wrong artifact exactly as
# faithfully as a right one. The hand-written schemas are pinned against the
# real parser in engine/core's own suite.
reference\:check: ## Fail if the key catalog drifts, or a hand-written schema lies
	@$(call gate,_reference-check,reference:check)

_reference-check:
	@echo "== reference schema tests =="
	$(CARGO_IN_DOCKER) 'cargo test -p shojiku-core --features schema --locked $(CARGO_JOBS) ;\
		cargo test -p shojiku-authoring --features schema --locked $(CARGO_JOBS)'

## ---- examples ----------------------------------------------------------

examples\:render: ## Re-render every example's committed output.pdf + preview-*.png
	@$(CARGO_IN_DOCKER) 'cargo build --release -p shojiku-cli'
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo \
		$(RUST_IMAGE) ./scripts/render-examples.sh

examples\:check: ## Fail if committed example outputs drift, a skill's template drifts, or a block scalar is space-indented
	@$(call gate,_examples-check,examples:check)

_examples-check:
	@echo "== skill template sync =="
	@./scripts/check-skill-template-sync.sh
	@echo "== block scalar indentation =="
	@./scripts/check-example-text-indent.sh
	@$(CARGO_IN_DOCKER) 'cargo build --release -p shojiku-cli'
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo \
		$(RUST_IMAGE) ./scripts/render-examples.sh --check

## ---- sbom ---------------------------------------------------------------

sbom\:generate: ## Regenerate the committed CycloneDX SBOMs from the lockfiles (idempotent)
	@SYFT_IMAGE=$(SYFT_IMAGE) scripts/generate-sbom.sh

version\:check: ## Fail if a release coordinate disagrees with the workspace version (no Docker)
	@$(call gate,_version-check,version:check)

_version-check:
	@echo "== version check =="
	@./scripts/check-versions.sh

sbom\:lint: ## Self-test the SBOM detector and check every lockfile is declared (no Docker)
	@$(call gate,_sbom-lint,sbom:lint)

_sbom-lint:
	@echo "== sbom lint =="
	@./scripts/check-sbom.sh --lint

sbom\:check: ## Fail if a committed SBOM drifts from its lockfile (release-time; see sbom:lint)
	@$(call gate,_sbom-check,sbom:check)

_sbom-check:
	@echo "== sbom check =="
	@SYFT_IMAGE=$(SYFT_IMAGE) ./scripts/check-sbom.sh

## ---- the make surface itself -------------------------------------------

# The invariant that keeps the split from rotting, and the only gate that can
# see a doc teaching a command that no longer exists. Four rules, one shared
# detector, self-tested against a known-bad fixture before it reads the tree.
# No Docker, seconds — it rides CI's `versions` job.
make\:check: ## Fail if a target is misnamed for its file, or a doc/script names a target that does not exist
	@$(call gate,_make-check,make:check)

_make-check:
	@echo "== make surface =="
	@scripts/check-make-namespace.sh

## ---- housekeeping ------------------------------------------------------

clean: ## Remove local artifacts (out.pdf, lcov.info, stderr.txt)
	rm -f out.pdf stderr.txt engine/lcov.info

clean\:cache: ## Drop the persistent cargo/rustup/pnpm Docker volumes
	-docker volume rm $(CARGO_VOLUME) $(RUSTUP_VOLUME) $(PNPM_VOLUME)

# The images a local gate run leaves behind. They are cheap to lose — each
# rebuilds from the layer cache in seconds — but there are eleven of them and
# together they run to gigabytes, so a machine that has run `make verify` a few
# times accumulates silently with nothing offering to clean up.
#
# Deliberately driven off the same variables the gates BUILD with, rather than
# a `docker images` name pattern: that makes it WORK_TAG-aware for free, so a
# parallel session removes exactly its own images and cannot reach another
# session's. It also means a renamed image cannot be missed here.
#
# Cache VOLUMES are NOT touched — they are shared on purpose and cost minutes
# to rebuild, not seconds. `clean:cache` above is the deliberate way to drop
# those.
BUILT_IMAGES := $(IMAGE) $(GUI_APP_IMAGE) $(APP_E2E_IMAGE) $(WASM_E2E_IMAGE) \
                $(PHP_IMAGE) $(GO_IMAGE) $(RUBY_IMAGE) $(PYTHON_IMAGE) \
                $(DOTNET_IMAGE) $(JAVA_IMAGE) $(JS_IMAGE)

clean\:images: ## Remove the docker images this tree's gates build (keeps the cache volumes)
	@docker rmi $(BUILT_IMAGES) 2>/dev/null || true
	@echo "removed this tree's built images (WORK_TAG=$(WORK_TAG)); cache volumes kept — 'make clean:cache' drops those"
