# Shojiku local CI mirror.
#
# THESE ARE THE ONLY SANCTIONED WAYS TO CHECK ANYTHING (user rule). Do not
# invent an equivalent; if what you need is missing, ASK and add it here.
# Rulebook: docs/agents/verification.md   Full inventory: make help
#
#   Is it correct?            one PASS/FAIL line, real exit code, log kept
#     make verify               everything CI runs — the merge bar
#     make verify:engine        engine: budget + lint + tests
#     make verify:gui           gui: budget + typecheck + lint + coverage
#     make verify:site          make verify:docker      make verify:sdk:<lang>
#
#   Faster slices while iterating
#     make budget:engine        make lint:engine        make test:engine
#     make budget:gui           make lint:gui           make test:gui [F=<pat>]
#     make quiet T=<target>     same treatment for any target below
#
#   Apply fixes
#     make fmt-fix              rustfmt          make gui-format   biome
#     make examples             re-render the committed example outputs
#     make lock                 after changing a Cargo.toml dependency —
#                               every gate is --locked and will refuse until
#                               you do (then: git add -f engine/Cargo.lock)
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
# A warning rather than an error: every GATE runs in a container regardless,
# and CI is the merge bar, so an old make is a hazard to be named rather than
# a reason to refuse to run.
ifeq ($(firstword $(subst ., ,$(MAKE_VERSION))),3)
$(warning )
$(warning *** GNU Make $(MAKE_VERSION) — CI runs 4.x, and the two differ on)
$(warning *** recipe quoting. A gate can pass here and fail there.)
$(warning *** export PATH="$$(brew --prefix make)/libexec/gnubin:$$PATH")
$(warning )
endif
#
# Target -> CI job (.github/workflows/ci.yml):
#   budget fmt clippy test -> job "rust"
#   coverage          -> job "coverage"  (100% lines, blocking)
#   deny              -> job "deny"
#   docker-* / docker -> job "docker"    (build, render+verify PDF, trivy scan)
#   examples-check    -> job "examples"  (committed outputs == fresh render,
#                                         plus skills/*/template == its example,
#                                         plus no space/tab-indented block scalar)
#   wasm              -> job "wasm"      (build wasm32 bindings + size budget)
#   sdk-ruby          -> job "sdk-ruby"  (rubocop, rspec at 100% coverage, gem
#                                         build/install; engine library injected
#                                         pre-compiled by capi-lib)
#   sdk-python        -> job "sdk-python" (ruff, mypy, pytest at 100% coverage,
#                                         wheel build/install; same injected
#                                         library)
#   sdk-dotnet        -> job "sdk-dotnet" (dotnet format, xunit at 100% line
#                                         coverage via coverlet, pack/restore;
#                                         same injected library)
#   sdk-java          -> job "sdk-java"  (spotless, junit at 100% line coverage
#                                         via jacoco, jar + sources + javadoc;
#                                         same injected library)
#   napi              -> job "napi"      (build the Node addon with its shim
#                                         feature + load it under the node floor)
#   sdk-js            -> job "sdk-js"    (biome, tsc, vitest at 100% coverage,
#                                         pack/install; the injected binary here
#                                         is the ADDON, not the cdylib)
#   sdk-php           -> job "sdk-php"   (php-cs-fixer, phpstan, phpunit at 100%
#                                         line coverage via a clover assertion,
#                                         composer install of the package; the
#                                         injected binary here is the CLI, which
#                                         this SDK drives as a subprocess)
#   sdk-go            -> job "sdk-go"    (gofmt, go vet, golangci-lint, go test
#                                         -race at 100% statement coverage, and
#                                         a build of the package from a scratch
#                                         module; same injected CLI binary)
#
#   verify            -> ALL of the above. Green verify == safe to push.
#   wasm-e2e          -> on-demand browser golden path (Playwright), NOT in verify.
#   fuzz              -> on-demand libFuzzer over the sign/verify parsers, NOT in
#                        verify (the gates run the corpus REPLAY instead, in
#                        engine/verify's tests).
#   gui-e2e           -> on-demand Designer-app golden path (Playwright), NOT in verify.
#
# NOTE (revisit when GitHub Actions is re-enabled): `wasm` is in `verify` for
# now; if timing it shows the wasm32 build slows the gate meaningfully, split it
# to its own CI job (keep the `make wasm` target, drop it from `verify`).
#
# Checking a RESULT ("did it work?") vs debugging a FAILURE are different jobs.
# For the first there is a <verb>:<scope> grid — budget:/lint:/test:/verify: over
# engine/gui/docker (see the table further down; `make help` lists them all):
#
#   make verify:gui     -> is gui/ correct?  (budget + lint + tests, the slow one)
#   make test:engine    -> do the engine tests pass?  (just those)
#   make quiet T=<any>  -> same treatment for any other target
#
# These print ONE PASS/FAIL line and exit with the gate's REAL code. On a
# failure the whole log lands at a FIXED path — $(ERROR_LOG) — headed with the
# target, the exit code and the last `== step ==` reached, so `cat` on that one
# path answers "where did it fall over?" without hunting. It is cleared when the
# same target next passes. Reach for the bare targets (gui, rust, docker …) when
# you are reading output to diagnose something.
#
# Do NOT do `make gui | tail -40`: a pipeline reports the LAST command's status,
# so it exits 0 over a FAILED gate, and tail discards the steps you would need
# to diagnose it. That mistake is the reason the targets above exist. This bites
# HARDEST in a background run: a backgrounded `make verify | tail -30` is
# reported as "completed (exit 0)" while a gate inside it failed, and the pipe
# also costs the only progress signal — an unpiped target writes
# $(LOG_DIR)/<target>.log LIVE, so it can be tailed while it runs. There is
# nothing to shorten in the first place: a <verb>:<scope> target's whole output
# is ONE line.
#
# So: to run a long gate in the BACKGROUND, background `make quiet T=verify`
# ITSELF — nothing else. There is no BG=/--detach flag here on purpose: the
# supervision belongs to whatever backgrounds it (your shell's `&`, an agent
# harness), and the gate lock is scoped to the lifetime of the make process
# that holds it, so a Makefile that detached its own children would have to
# reinvent that ownership. The two ways this has been got wrong, both of which
# reported a RED gate as green:
#   make coverage 2>&1 | tail -20          # exit code is tail's
#   make verify > out.log 2>&1; echo $?    # exit code is echo's — the same
#                                          # trap in suffix form, and the real
#                                          # code is then only in the text
# Neither shortcut buys anything: `quiet` already gives you one line, the full
# log at a known path, and the true exit code.
#
# The traps you cannot read off this file — mount drift, a docker daemon that
# answers `docker version` and still pulls nothing, base-image pull timeouts,
# how to actually cancel a gate, scoped gui/fuzz iteration recipes — live in
# docs/agents/gotchas/docker-make.md. Read it before debugging a confusing gate
# failure cold; most such symptoms are catalogued there rather than being a
# defect in your change. Point-of-use notes on the targets below repeat only the
# trap each one can spring, not that file's contents.
#
# `make <gate> JOBS=N` caps parallelism (cargo --jobs / Vitest --maxWorkers) for
# a machine that `make verify` would otherwise thrash.

# Keep in sync with .github/workflows/ci.yml (RUST_VERSION) and docker/Dockerfile.
RUST_VERSION := 1.97.1
RUST_IMAGE   := rust:$(RUST_VERSION)-slim-bookworm
TRIVY_IMAGE  := aquasec/trivy:latest
SYFT_IMAGE   := anchore/syft:latest
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
# alive. Kill the CONTAINER first (find it by its repo-path mount), then the
# make chain — recipe in docs/agents/gotchas/docker-make.md.
GATE_LOCK  := scripts/gate-lock.sh

IMAGE        := shojiku-ci:$(WORK_TAG)

# The two browser golden paths build their images from shell scripts rather
# than from a recipe here, so their names are declared alongside the other
# session-namespaced ones — both so `images-clean` can name them and so the
# WORK_TAG scheme has a single place to read. The scripts derive the same
# names from $WORK_TAG.
APP_E2E_IMAGE  := shojiku-designer-app-e2e:$(WORK_TAG)
WASM_E2E_IMAGE := shojiku-wasm-e2e:$(WORK_TAG)

# Node image for the gui/ workspace gates (typecheck + lint + coverage). The
# host has no Node toolchain either — like Rust, every gui gate runs in Docker.
NODE_IMAGE := node:24-bookworm-slim

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
#   * a COMPOUND run writes ONE log named after the whole T —
#     `make quiet T="site site-check"` writes site_site-check.log and leaves
#     site-check.log as whatever the last STANDALONE run of that target wrote.
#     Match the log file to the command you actually ran.
#   * ERROR_LOG is cleared only when THAT target next passes, so a deliberately
#     failing smoke (a guard that is supposed to refuse) leaves a FAILED header
#     behind indefinitely. Read its first line — it names the target — before
#     treating it as an outstanding failure.
LOG_DIR   := .make-logs
ERROR_LOG := $(LOG_DIR)/last-error.log

# Parallelism cap for the heavy gates: `make verify JOBS=4`. Unset (the default)
# lets each tool use every core, which is what you want on a big machine and is
# exactly what makes `make verify` thrash a small one. It reaches cargo
# (test/clippy/coverage) and Vitest; the Docker image build is not covered — the
# cargo invocation there lives inside docker/Dockerfile.
JOBS ?=
CARGO_JOBS  := $(if $(JOBS),--jobs $(JOBS))
VITEST_JOBS := $(if $(JOBS),--maxWorkers=$(JOBS))

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
#     cache; symptoms and recovery are in docs/agents/gotchas/docker-make.md.
CARGO_VOLUME  ?= shojiku-cargo
PNPM_VOLUME   ?= shojiku-pnpm
RUSTUP_VOLUME ?= shojiku-rustup

CARGO_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/engine \
	-v "$(CARGO_VOLUME):/usr/local/cargo" \
	-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
	$(RUST_IMAGE) sh -euc

.DEFAULT_GOAL := help
.PHONY: proof proof-python proof-ruby proof-dotnet proof-java proof-js \
        proof-php proof-go
.PHONY: proof-published proof-published-python proof-published-ruby \
        proof-published-dotnet proof-published-java proof-published-js \
        proof-published-crates
.PHONY: proof-deploy site site-lint site-test site-data site-check site-wasm-release site-build \
        site-dev verify\:site lint\:site test\:site
.PHONY: help verify quiet rust budget fmt fmt-fix lock clippy test coverage deny \
        verify\:engine verify\:gui verify\:docker lint\:engine lint\:gui \
        test\:engine test\:gui budget\:engine budget\:gui \
        verify\:sdk\:ruby test\:sdk\:ruby lint\:sdk\:ruby \
        verify\:sdk\:python test\:sdk\:python lint\:sdk\:python \
        verify\:sdk\:dotnet test\:sdk\:dotnet lint\:sdk\:dotnet \
        verify\:sdk\:java test\:sdk\:java lint\:sdk\:java \
        verify\:sdk\:js test\:sdk\:js lint\:sdk\:js \
        verify\:sdk\:php test\:sdk\:php lint\:sdk\:php \
        verify\:sdk\:go test\:sdk\:go lint\:sdk\:go \
        docker docker-build docker-render docker-scan examples examples-check \
        wasm wasm-e2e capi-dist capi-lib cli-dist cli-bin napi napi-lib fuzz \
        sdk-ruby sdk-ruby-test sdk-ruby-lint \
        sdk-python sdk-python-test sdk-python-lint \
        sdk-dotnet sdk-dotnet-test sdk-dotnet-lint \
        sdk-java sdk-java-test sdk-java-lint \
        sdk-js sdk-js-test sdk-js-lint sdk-js-format \
        sdk-php sdk-php-test sdk-php-lint \
        sdk-go sdk-go-test sdk-go-lint \
        gui gui-budget gui-lint gui-test gui-format gui-e2e gui-shot \
        gui-serve gui-dev sbom clean cache-clean images-clean

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_\\:-]+:.*## ' $(MAKEFILE_LIST) \
		| sed -E 's/^([a-zA-Z0-9_\\:-]+):[^#]*## /\1\t/; s/\\//g' \
		| awk -F'\t' '{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## ---- push gate ---------------------------------------------------------

# Order is deliberate. `rust` (fmt/clippy/test) stays first because it is the
# fastest real signal and the most common failure. `wasm` moved AHEAD of
# `coverage`: it is a full wasm32 build rather than a lint, so it does not
# belong before the tests — but a size-budget crossing used to be discovered
# only after paying for the single most expensive step in the run.
verify: rust wasm coverage deny examples-check napi gui site site-check sdk-ruby sdk-python sdk-dotnet sdk-java sdk-js sdk-php sdk-go docker ## Full local CI mirror; green == safe to push
	@echo "\n✅ verify passed — every CI gate is green locally. Safe to push."

## ---- <verb>:<scope> — "did it work?" entry points ----------------------
#
# One question, one command, one answer: PASS/FAIL plus the gate's REAL exit
# code, with the full log kept under $(LOG_DIR) for grepping. The bare targets
# further down stay verbose — reach for those when you are DEBUGGING a failure,
# for these when you are CHECKING a result.
#
#            engine            gui               docker        sdk
#   budget:  budget:engine     budget:gui        —             —
#   lint:    lint:engine       lint:gui          —             lint:sdk:{ruby,python,dotnet,java,js,php,go}
#   test:    test:engine       test:gui          —             test:sdk:{ruby,python,dotnet,java,js,php,go}
#   verify:  verify:engine     verify:gui        verify:docker verify:sdk:{ruby,python,dotnet,java,js,php,go}
#
# verify:<scope> = that scope's whole bar (budget + lint + test + whatever else
# the scope needs — coverage/deny/examples/wasm for engine), so it is the slow
# one; the other three verbs are the fast slices to iterate on. Plain `verify`
# is every scope at once.
#
# The sdk scope nests one level deeper, one entry per language, because each
# has its own toolchain and its own container. Ruby is the reference and was
# built first, python second, then dotnet and java together, then js, then the
# two subprocess ones — php, then go. All seven are in the grid.
# There is no budget: verb there — the per-file line budget is an engine/ and
# gui/ rule, and each SDK's own linter owns that ecosystem's equivalent.
#
# NOTE: each colon in a target NAME must be backslash-escaped in the definition
# (`verify\:gui:`, `verify\:sdk\:js:`) or make reads it as the rule separator.
# Invocation is plain (`make verify:gui`); `help` strips the backslash.

verify\:engine: ## Verify engine/ — budget + lint + tests at 100% coverage, deny, examples, wasm
	@$(MAKE) --no-print-directory quiet T="rust coverage deny examples-check wasm"

verify\:gui: ## Verify gui/ — budget + typecheck + lint (0 warnings) + tests/coverage
	@$(MAKE) --no-print-directory quiet T=gui

verify\:docker: ## Verify the runtime image — build, render a PDF, trivy scan
	@$(MAKE) --no-print-directory quiet T=docker

verify\:site: ## Verify site/ — typecheck + tests (incl. real-wasm) + committed-data check
	@$(MAKE) --no-print-directory quiet T="site site-check"

lint\:site: ## site/ static checks only — tsc typecheck
	@$(MAKE) --no-print-directory quiet T=site-lint

test\:site: ## site/ tests only (vitest incl. the real-wasm integration suite)
	@$(MAKE) --no-print-directory quiet T=site-test

lint\:engine: ## engine/ static checks only — cargo fmt --check + clippy -D warnings
	@$(MAKE) --no-print-directory quiet T="fmt clippy"

lint\:gui: ## gui/ static checks only — tsc typecheck + biome (0 warnings)
	@$(MAKE) --no-print-directory quiet T=gui-lint

test\:engine: ## engine/ tests only; P=<crate> and/or F=<name filter> narrow it
	@$(MAKE) --no-print-directory quiet T=test

test\:gui: ## gui/ tests only (vitest); F=<file pattern> narrows it (no coverage)
	@$(MAKE) --no-print-directory quiet T=gui-test

budget\:engine: ## engine/ per-file .rs line budget + //! role headers
	@$(MAKE) --no-print-directory quiet T=budget

budget\:gui: ## gui/ per-file executable-line budget
	@$(MAKE) --no-print-directory quiet T=gui-budget

verify\:sdk\:ruby: ## Verify sdk/ruby — rubocop + rspec at 100% coverage + gem build/install
	@$(MAKE) --no-print-directory quiet T=sdk-ruby

test\:sdk\:ruby: ## sdk/ruby tests only (rspec), no lint or packaging
	@$(MAKE) --no-print-directory quiet T=sdk-ruby-test

lint\:sdk\:ruby: ## sdk/ruby static checks only (rubocop)
	@$(MAKE) --no-print-directory quiet T=sdk-ruby-lint

verify\:sdk\:python: ## Verify sdk/python — ruff + mypy + pytest at 100% coverage + wheel build/install
	@$(MAKE) --no-print-directory quiet T=sdk-python

test\:sdk\:python: ## sdk/python tests only (pytest), no lint or packaging
	@$(MAKE) --no-print-directory quiet T=sdk-python-test

lint\:sdk\:python: ## sdk/python static checks only (ruff + mypy)
	@$(MAKE) --no-print-directory quiet T=sdk-python-lint

verify\:sdk\:dotnet: ## Verify sdk/dotnet — dotnet format + xunit at 100% line coverage + pack/restore
	@$(MAKE) --no-print-directory quiet T=sdk-dotnet

test\:sdk\:dotnet: ## sdk/dotnet tests only (xunit), no format check or packaging
	@$(MAKE) --no-print-directory quiet T=sdk-dotnet-test

lint\:sdk\:dotnet: ## sdk/dotnet static checks only (dotnet format + analyzers)
	@$(MAKE) --no-print-directory quiet T=sdk-dotnet-lint

verify\:sdk\:java: ## Verify sdk/java — spotless + junit at 100% line coverage + jar/sources/javadoc
	@$(MAKE) --no-print-directory quiet T=sdk-java

test\:sdk\:java: ## sdk/java tests only (junit), no format check or packaging
	@$(MAKE) --no-print-directory quiet T=sdk-java-test

lint\:sdk\:java: ## sdk/java static checks only (spotless + -Xlint -Werror)
	@$(MAKE) --no-print-directory quiet T=sdk-java-lint

verify\:sdk\:js: ## Verify sdk/js — biome + tsc + vitest at 100% coverage + pack/install
	@$(MAKE) --no-print-directory quiet T=sdk-js

test\:sdk\:js: ## sdk/js tests only (vitest), no lint or packaging
	@$(MAKE) --no-print-directory quiet T=sdk-js-test

lint\:sdk\:js: ## sdk/js static checks only (biome + tsc)
	@$(MAKE) --no-print-directory quiet T=sdk-js-lint

verify\:sdk\:php: ## Verify sdk/php — php-cs-fixer + phpstan + phpunit at 100% line coverage + composer install
	@$(MAKE) --no-print-directory quiet T=sdk-php

test\:sdk\:php: ## sdk/php tests only (phpunit + the coverage assertion)
	@$(MAKE) --no-print-directory quiet T=sdk-php-test

lint\:sdk\:php: ## sdk/php static checks only (php-cs-fixer + phpstan)
	@$(MAKE) --no-print-directory quiet T=sdk-php-lint

verify\:sdk\:go: ## Verify sdk/go — gofmt + vet + golangci-lint + go test -race at 100% coverage + module build
	@$(MAKE) --no-print-directory quiet T=sdk-go

test\:sdk\:go: ## sdk/go tests only (go test -race + the coverage assertion)
	@$(MAKE) --no-print-directory quiet T=sdk-go-test

lint\:sdk\:go: ## sdk/go static checks only (gofmt + go vet + golangci-lint)
	@$(MAKE) --no-print-directory quiet T=sdk-go-lint

quiet: ## Run ANY target this way: make quiet T=gui (same PASS/FAIL + real exit code)
	@if [ -z "$(T)" ]; then \
		echo "usage: make quiet T=<target>    e.g. make quiet T=gui / T=verify / T=\"fmt clippy\"" >&2; \
		exit 2; \
	fi
	@mkdir -p $(LOG_DIR)
	@log="$(LOG_DIR)/$$(echo '$(T)' | tr ' /' '__').log"; \
	if $(GATE_LOCK) $(MAKE) --no-print-directory $(T) > "$$log" 2>&1; then \
		if [ -f "$(ERROR_LOG)" ] && head -1 "$(ERROR_LOG)" | grep -qx "# FAILED: $(T)"; then \
			rm -f "$(ERROR_LOG)"; \
		fi; \
		printf '\033[32mPASS\033[0m %s — full log (%s lines): %s\n' \
			'$(T)' "$$(wc -l < "$$log" | tr -d ' ')" "$$log"; \
	else \
		code=$$?; \
		step=$$(grep -E '^== ' "$$log" | tail -1); \
		culprits=$$(scripts/gate-culprits.sh "$$log"); \
		{ echo "# FAILED: $(T)"; \
		  echo "# exit $$code at $$(date '+%Y-%m-%d %H:%M:%S')"; \
		  echo "# last step: $${step:-(none reported)}"; \
		  echo "# full log: $$log"; \
		  if [ -n "$$culprits" ]; then echo; echo "# where:"; echo "$$culprits" | sed 's/^/#   /'; fi; \
		  echo; cat "$$log"; } > "$(ERROR_LOG)"; \
		printf '\033[31mFAIL\033[0m %s (exit %s)\n  last step : %s\n  error log : %s  <- always this path\n  full log  : %s\n' \
			'$(T)' "$$code" "$${step:-(none reported)}" "$(ERROR_LOG)" "$$log"; \
		if [ -n "$$culprits" ]; then \
			printf -- '--- where it broke ---\n%s\n' "$$culprits"; \
		else \
			printf -- '--- last 40 lines ---\n'; tail -40 "$$log"; \
		fi; \
		exit $$code; \
	fi

## ---- job: rust ---------------------------------------------------------

rust: budget fmt clippy ## line budget + fmt + clippy (CI job "rust"; tests run in coverage)

budget: ## .rs line budget + //! header check (scripts/check-line-budget.sh)
	@echo "== line budget =="
	@scripts/check-line-budget.sh

fmt: ## cargo fmt --check
	@echo "== fmt =="
	$(CARGO_IN_DOCKER) 'rustup component add rustfmt >/dev/null 2>&1; \
		cargo fmt --all -- --check'

fmt-fix: ## cargo fmt (apply formatting)
	$(CARGO_IN_DOCKER) 'rustup component add rustfmt >/dev/null 2>&1; \
		cargo fmt --all'

# The one place the workspace is resolved WITHOUT `--locked`, and the reason
# it has to exist: every gate passes `--locked` (the committed lockfile is
# authoritative), so the first gate after a dependency is added or removed
# dies with "cannot update the lock file ... because --locked was passed".
# Without a target for it the only way forward is a hand-built `docker run`
# reproducing CARGO_IN_DOCKER's mount and both cache volumes by hand — which
# is exactly the mount discipline docs/agents/gotchas/docker-make.md calls
# the single biggest time-sink in this repo.
#
# `cargo metadata` resolves and writes the lockfile without compiling
# anything, so this is seconds rather than a build. It updates only what the
# manifest change requires; it is NOT `cargo update`, which would bump
# unrelated dependencies.
lock: ## Refresh engine/Cargo.lock after a Cargo.toml dependency change (then: git add -f engine/Cargo.lock)
	@echo "== lock =="
	$(CARGO_IN_DOCKER) 'cargo metadata --format-version 1 >/dev/null'
	@echo "engine/Cargo.lock refreshed — stage it with: git add -f engine/Cargo.lock"

clippy: ## cargo clippy -D warnings (matches CI flags; JOBS=N caps parallelism)
	@echo "== clippy =="
	$(CARGO_IN_DOCKER) 'rustup component add clippy >/dev/null 2>&1; \
		cargo clippy --workspace --all-targets --all-features --locked $(CARGO_JOBS) -- -D warnings'

# Judging a run by eye: count `test result: FAILED` rather than parsing the
# result lines by field position (`FAILED. 553 passed; 1 failed` has been
# mis-read as green). Cargo STOPS at the first failing binary, so FEWER
# `test result:` lines than usual is itself the tell that something failed
# early — the PASS/FAIL line from `make test:engine` is the reliable answer.
#
# P=<crate> and F=<name filter> narrow the run for the edit-run-edit loop
# (`make test:engine P=shojiku-layout`, `… F=document_meta`, or both) — the
# whole workspace is ~4 min and a crate is ~30 s, which is the gap that used
# to get filled with a hand-typed `docker run … cargo test -p …`. A narrowed
# run SKIPS the capi cdylib link below and proves nothing about the crates it
# did not build, so finish with a plain `make test:engine` before saying the
# tests pass. P takes several crates: P="shojiku-core shojiku-layout".
test: ## cargo test --workspace --locked + link the capi cdylib (P=<crate> F=<filter> narrow it)
	@echo "== test$(if $(P), P=$(P))$(if $(F), F=$(F)) =="
	$(CARGO_IN_DOCKER) 'cargo test $(if $(P),$(foreach p,$(P),-p $(p)),--workspace) --locked $(CARGO_JOBS) $(F)'
	@$(if $(or $(P),$(F)),echo "== capi cdylib link SKIPPED (narrowed run) ==",:)
ifeq ($(strip $(P)$(F)),)
	@echo "== capi cdylib link =="
	@# `cargo test` builds only the rlib the test harness links; nothing in
	@# the gate grid would otherwise LINK the shared library that is the
	@# capi crate's actual deliverable, so a cdylib-only link failure could
	@# reach main green. One dev-profile link (deps are already compiled by
	@# the test step) closes that; the release cross matrix stays on-demand
	@# in capi-dist.
	$(CARGO_IN_DOCKER) 'cargo build -p shojiku-capi --locked $(CARGO_JOBS) \
		&& ls target/debug/*shojiku_capi.* >/dev/null'
endif

## ---- job: coverage -----------------------------------------------------

# The `rm -f lcov.info` is load-bearing, not tidiness. When the gate fails
# because a TEST DOES NOT COMPILE, cargo llvm-cov never writes a report — and
# coverage-why.sh would then read the PREVIOUS run's file and confidently
# reprint uncovered lines that a compile error means nothing ever reached.
# Deleting it first makes that case say so instead of lying with precision.
coverage: ## cargo llvm-cov, blocking at 100% lines (names the offending lines on failure)
	@echo "== coverage (100% lines) =="
	@$(CARGO_IN_DOCKER) 'rm -f lcov.info; \
		rustup component add llvm-tools-preview >/dev/null 2>&1; \
		command -v cargo-llvm-cov >/dev/null 2>&1 || cargo install cargo-llvm-cov --locked; \
		cargo llvm-cov --workspace --locked --fail-under-lines 100 $(CARGO_JOBS) \
			--lcov --output-path lcov.info' \
	|| { code=$$?; \
	     echo; echo "-- which lines? (scripts/coverage-why.sh) --"; \
	     $(MAKE) --no-print-directory coverage-why || true; \
	     exit $$code; }

coverage-why: ## Name the lines that failed the coverage gate (reads engine/lcov.info; no re-run)
	@scripts/coverage-why.sh

## ---- job: deny ---------------------------------------------------------

deny: ## cargo deny check advisories licenses bans sources
	@echo "== cargo deny =="
	$(CARGO_IN_DOCKER) 'command -v git >/dev/null 2>&1 || \
			{ apt-get update -qq && apt-get install -y -qq git >/dev/null; }; \
		command -v cargo-deny >/dev/null 2>&1 || cargo install cargo-deny --locked; \
		cargo deny check advisories licenses bans sources'

## ---- job: sdk-php ------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
PHP_VER ?= 8.3
PHP_IMAGE := shojiku-sdk-php:$(PHP_VER)$(SDK_SUFFIX)

# The first SUBPROCESS SDK, so the injected binary is the `shojiku` CLI
# (`make cli-bin`) rather than a library the package loads — but everything
# else is the shape the other five gates already have. The sidecar
# sdk/php/Dockerfile.dockerignore is what lets this build see dist/ at all;
# the root .dockerignore excludes sdk/ and never mentioned dist/cli/local.
#
# The package is installed from its own artifact into a scratch directory
# through a `path` repository with packagist turned OFF: composer resolves
# nothing over the network, which is both faster and the honest test — this
# package has no dependencies, and a gate that reached a registry would be
# proving something else.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk-php: cli-bin ## sdk/php gates: php-cs-fixer + phpstan + phpunit at 100% coverage + composer install
	@echo "== sdk php image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@echo "== sdk php (php-cs-fixer + phpstan + phpunit + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		php-cs-fixer check --diff ;\
		phpstan analyse --no-progress --memory-limit=512M ;\
		phpunit ;\
		php tools/coverage-gate.php ;\
		composer validate --strict ;\
		cp -r /repo/sdk/php /tmp/build ;\
		rm -rf /tmp/build/build /tmp/build/.phpunit.cache ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		export COMPOSER_ROOT_VERSION=1.0.0 ;\
		composer init --no-interaction --name=shojiku/consumer --quiet ;\
		composer config repositories.local path /tmp/build ;\
		composer config repositories.packagist.org false ;\
		composer require --no-interaction --quiet "shojiku/shojiku:@dev" ;\
		php -r "require \"vendor/autoload.php\"; exit(class_exists(\Shojiku\Client::class) ? 0 : 1);"'

sdk-php-test: cli-bin ## sdk/php phpunit + coverage assertion (what `make test:sdk:php` runs)
	@echo "== sdk php test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		phpunit ;\
		php tools/coverage-gate.php'

# cli-bin even for lint: the image COPYs the binary in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-php-lint: cli-bin ## sdk/php php-cs-fixer + phpstan (what `make lint:sdk:php` runs)
	@echo "== sdk php lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PHP_VERSION=$(PHP_VER) -f sdk/php/Dockerfile -t $(PHP_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/php $(PHP_IMAGE) sh -euc '\
		php-cs-fixer check --diff ;\
		phpstan analyse --no-progress --memory-limit=512M'

## ---- job: sdk-go -------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
GO_VER ?= 1.25
GO_IMAGE := shojiku-sdk-go:$(GO_VER)$(SDK_SUFFIX)

# The second SUBPROCESS SDK, so it shares php's injected binary (`make
# cli-bin`) rather than the cdylib the four FFI SDKs load. The sidecar
# sdk/go/Dockerfile.dockerignore is what lets this build see dist/ at all; the
# root .dockerignore excludes sdk/ and never mentioned dist/cli/local.
#
# The package is built from a scratch module through a `replace` directive with
# the module proxy turned OFF: nothing is resolved over the network, which is
# both faster and the honest test — this package has no dependencies, and a
# gate that reached a proxy would be proving something else. It is the go form
# of php's `path` repository with packagist disabled.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk-go: cli-bin ## sdk/go gates: gofmt + vet + golangci-lint + go test -race at 100% coverage + module build
	@echo "== sdk go image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@echo "== sdk go (gofmt + vet + golangci-lint + go test + module build) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		gofmt -l . > /tmp/fmt.txt ;\
		if [ -s /tmp/fmt.txt ]; then echo "gofmt would rewrite:"; cat /tmp/fmt.txt; exit 1; fi ;\
		go vet ./... ;\
		golangci-lint run ;\
		go test ./... -race -coverprofile=/tmp/cover.out ;\
		go tool cover -func=/tmp/cover.out | awk "/^total:/ {print; if (\$$3 != \"100.0%\") exit 1}" ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		export GOFLAGS=-mod=mod GOPROXY=off ;\
		go mod init consumer ;\
		go mod edit -require=github.com/kengos/shojiku/sdk/go@v0.0.0 ;\
		go mod edit -replace=github.com/kengos/shojiku/sdk/go=/repo/sdk/go ;\
		printf "package main\n\nimport shojiku \"github.com/kengos/shojiku/sdk/go\"\n\nfunc main() { _, _ = shojiku.NewClient() }\n" > main.go ;\
		go build ./...'

sdk-go-test: cli-bin ## sdk/go go test -race + coverage assertion (what `make test:sdk:go` runs)
	@echo "== sdk go test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		go test ./... -race -coverprofile=/tmp/cover.out ;\
		go tool cover -func=/tmp/cover.out | awk "/^total:/ {print; if (\$$3 != \"100.0%\") exit 1}"'

# cli-bin even for lint: the image COPYs the binary in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-go-lint: cli-bin ## sdk/go gofmt + go vet + golangci-lint (what `make lint:sdk:go` runs)
	@echo "== sdk go lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg GO_VERSION=$(GO_VER) -f sdk/go/Dockerfile -t $(GO_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/go $(GO_IMAGE) sh -euc '\
		gofmt -l . > /tmp/fmt.txt ;\
		if [ -s /tmp/fmt.txt ]; then echo "gofmt would rewrite:"; cat /tmp/fmt.txt; exit 1; fi ;\
		go vet ./... ;\
		golangci-lint run'

## ---- job: docker -------------------------------------------------------

docker: docker-build docker-render docker-scan ## build + render-verify + trivy scan

docker-build: ## Build the runtime image (docker/Dockerfile)
	@echo "== docker build =="
	docker build -f docker/Dockerfile -t $(IMAGE) .

docker-render: ## Render the bundled example and assert it is a PDF
	@echo "== docker render + verify =="
	@docker run --rm $(IMAGE) > out.pdf 2> stderr.txt; \
	if [ -s stderr.txt ]; then echo "render emitted diagnostics:"; cat stderr.txt; exit 1; fi; \
	head -c 5 out.pdf | grep -q '%PDF-' || { echo "not a PDF"; exit 1; }; \
	echo "rendered $$(wc -c < out.pdf) bytes -> out.pdf"

docker-scan: ## Trivy scan of the image (mirrors CI: fixable CVEs fail)
	@echo "== trivy scan =="
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock $(TRIVY_IMAGE) \
		image --exit-code 1 --ignore-unfixed \
		--severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL $(IMAGE)

## ---- examples ----------------------------------------------------------

examples: ## Re-render every example's committed output.pdf + preview-*.png
	@$(CARGO_IN_DOCKER) 'cargo build --release -p shojiku-cli'
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo \
		$(RUST_IMAGE) ./scripts/render-examples.sh

examples-check: ## Fail if committed example outputs drift, a skill's template drifts, or a block scalar is space-indented
	@echo "== skill template sync =="
	@./scripts/check-skill-template-sync.sh
	@echo "== block scalar indentation =="
	@./scripts/check-example-text-indent.sh
	@$(CARGO_IN_DOCKER) 'cargo build --release -p shojiku-cli'
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo \
		$(RUST_IMAGE) ./scripts/render-examples.sh --check

## ---- wasm --------------------------------------------------------------

# NOT byte-reproducible across host architectures: the pinned container emits a
# different shojiku_wasm_bg.wasm on an arm64 host than on CI's x86_64 runners
# (the .js/.d.ts outputs match — only the binary differs), while CI runs
# reproduce each other exactly. Nothing in `make verify` compares those bytes,
# so this only matters at the release-time re-pin — see site-wasm-release.
#
# `engine/wasm/pkg` is gitignored, so it holds whatever the last local build
# left. Two consumers read it as "a build of HEAD" and will quietly disagree
# with you otherwise: the gui integration suites dynamic-import it (a stale pkg
# reds the whole wasm suite with parse errors that look like GUI regressions),
# and the designer-app dev server serves an assembled COPY taken at startup.
# Re-run this after every engine edit batch, and re-assemble (or restart the
# dev server) before judging a capability-gated feature in the browser.
wasm: ## Build the browser WASM bindings (engine/wasm/pkg) + assert size budget
	@echo "== wasm build (size-budgeted) =="
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo/engine \
		-v "$(CARGO_VOLUME):/usr/local/cargo" \
		-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
		$(RUST_IMAGE) sh -euc '\
		rustup target add wasm32-unknown-unknown >/dev/null 2>&1; \
		command -v wasm-bindgen >/dev/null 2>&1 || \
			cargo install wasm-bindgen-cli --version =$(WASM_BINDGEN_VERSION) --locked; \
		command -v wasm-opt >/dev/null 2>&1 || { \
			apt-get update -qq >/dev/null && \
			apt-get install -y -qq --no-install-recommends curl ca-certificates >/dev/null && \
			arch=$$(uname -m) && \
			rel=binaryen-version_$(WASM_OPT_VERSION) && \
			case $$arch in \
				x86_64) want=$(WASM_OPT_SHA256_x86_64) ;; \
				aarch64) want=$(WASM_OPT_SHA256_aarch64) ;; \
				*) echo "no pinned wasm-opt checksum for $$arch"; exit 1 ;; \
			esac && \
			curl -fsSL -o /tmp/$$rel.tar.gz \
				"https://github.com/WebAssembly/binaryen/releases/download/version_$(WASM_OPT_VERSION)/$$rel-$$arch-linux.tar.gz" && \
			echo "$$want  /tmp/$$rel.tar.gz" | sha256sum -c - && \
			tar -xzf /tmp/$$rel.tar.gz -C /usr/local/cargo && \
			ln -sf /usr/local/cargo/$$rel/bin/wasm-opt /usr/local/cargo/bin/wasm-opt; \
		}; \
		cargo build -p shojiku-wasm --profile wasm-release \
			--target wasm32-unknown-unknown --locked; \
		wasm-bindgen --target web --out-dir /repo/engine/wasm/pkg \
			target/wasm32-unknown-unknown/wasm-release/shojiku_wasm.wasm; \
		wasm-opt -Oz /repo/engine/wasm/pkg/shojiku_wasm_bg.wasm \
			-o /repo/engine/wasm/pkg/shojiku_wasm_bg.wasm; \
		raw=$$(stat -c %s /repo/engine/wasm/pkg/shojiku_wasm_bg.wasm); \
		gz=$$(gzip -9 -c /repo/engine/wasm/pkg/shojiku_wasm_bg.wasm | wc -c); \
		echo "wasm size: raw=$${raw} bytes gzip=$${gz} bytes (budget raw<=$(WASM_MAX_RAW) gzip<=$(WASM_MAX_GZIP))"; \
		[ "$$raw" -le $(WASM_MAX_RAW) ] || { echo "raw over budget"; exit 1; }; \
		[ "$$gz" -le $(WASM_MAX_GZIP) ] || { echo "gzip over budget"; exit 1; }'

wasm-e2e: ## Browser golden path (Playwright in Docker) — on-demand, not in verify
	@echo "== wasm e2e (browser golden path) =="
	@sh engine/wasm/e2e/run-e2e.sh

## ---- capi (the C ABI cdylib the FFI SDKs load) -------------------------

# The platform matrix the python/ruby/c#/java SDKs ship a binary from.
#
# darwin is deliberately absent: an Apple target cannot be linked from a Linux
# container, and this repository has no local toolchain to fall back on, so
# macOS artifacts are produced on a macOS runner at release time. What IS here
# builds anywhere Docker runs, cross-compilers and all, which is what makes it
# a gate you can run rather than a pipeline you can only read.
#
# Windows is the mingw (`-gnu`) target rather than MSVC: the SDKs load this
# through P/Invoke, JNA, ctypes and fiddle, none of which cares which toolchain
# produced a plain C ABI, and `-gnu` is the one a Linux container can link.
#
# On-demand, like wasm-e2e: three release builds of the whole engine is not
# something `make verify` should pay for on every run.
#
# The cross libc packages are named explicitly rather than left to apt's
# recommends: `ring` compiles C, so a cross gcc without its target headers
# fails deep inside a build script (`bits/libc-header-start.h: No such file`)
# rather than at install time. Which pair is needed depends on the BUILDER's
# architecture — an Apple Silicon machine cross-compiles x86_64, an x86 one
# cross-compiles arm64 — so the recipe picks by `dpkg --print-architecture`
# instead of assuming.
CAPI_TARGETS := x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-pc-windows-gnu
CAPI_DIST := dist/capi

capi-dist: ## Build the C ABI cdylib for the platform matrix + checksums (on-demand)
	@echo "== capi dist ($(CAPI_TARGETS)) =="
	@mkdir -p $(CAPI_DIST)
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo/engine \
		-v "$(CARGO_VOLUME):/usr/local/cargo" \
		-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
		$(RUST_IMAGE) sh -euc '\
		apt-get update -qq >/dev/null; \
		case $$(dpkg --print-architecture) in \
			arm64) cross="gcc-x86-64-linux-gnu libc6-dev-amd64-cross" ;; \
			amd64) cross="gcc-aarch64-linux-gnu libc6-dev-arm64-cross" ;; \
			*) echo "no cross toolchain mapping for this builder"; exit 1 ;; \
		esac; \
		echo "== capi toolchains ($$cross mingw) =="; \
		apt-get install -y -qq $$cross gcc-mingw-w64-x86-64 >/dev/null; \
		for target in $(CAPI_TARGETS); do \
			echo "== capi build $$target =="; \
			rustup target add $$target >/dev/null 2>&1; \
			CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc \
			CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
			CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc \
			CC_x86_64_unknown_linux_gnu=x86_64-linux-gnu-gcc \
			CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
			CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc \
			cargo build -p shojiku-capi --release --locked --target $$target $(CARGO_JOBS); \
			out=/repo/$(CAPI_DIST)/$$target; mkdir -p $$out; \
			for ext in so dylib dll; do \
				for lib in target/$$target/release/*shojiku_capi.$$ext; do \
					[ -f "$$lib" ] && cp "$$lib" $$out/; \
				done; \
			done; \
			count=$$(ls $$out | wc -l); \
			[ "$$count" -eq 1 ] || { \
				echo "expected one loadable library for $$target, found $$count"; \
				ls $$out; exit 1; }; \
		done; \
		cp /repo/engine/capi/include/shojiku.h /repo/$(CAPI_DIST)/; \
		echo "== capi checksums =="; \
		cd /repo/$(CAPI_DIST) && find . -type f ! -name SHA256SUMS \
			-exec sha256sum {} + | sort -k2 > SHA256SUMS; \
		echo "artifacts:"; cat SHA256SUMS'
	@echo "capi artifacts in $(CAPI_DIST)/ (uncommitted; SHA256SUMS beside them)"

# The prebuilt CLI binaries the SUBPROCESS SDKs (php, go) tell users to
# install. Same shape and same reasoning as `capi-dist` above — including
# the builder-architecture cross-libc pick, since the CLI reaches `ring`
# through the signing crates and so compiles C exactly as the cdylib does.
# On-demand: this is release plumbing, not something `make verify` pays for.
#
# Neither subprocess SDK ever downloads one of these. Installing the binary
# is the user's explicit act; these artifacts are what a GitHub Release
# offers them, and the checksums are how they check what they got.
#
# The two macOS targets are missing here for the same reason as capi's:
# they cannot be linked from a container, so a release runner produces them.
CLI_TARGETS := x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-pc-windows-gnu
CLI_DIST := dist/cli

cli-dist: ## Build the `shojiku` CLI for the platform matrix + checksums (on-demand)
	@echo "== cli dist ($(CLI_TARGETS)) =="
	@mkdir -p $(CLI_DIST)
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo/engine \
		-v "$(CARGO_VOLUME):/usr/local/cargo" \
		-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
		$(RUST_IMAGE) sh -euc '\
		apt-get update -qq >/dev/null; \
		case $$(dpkg --print-architecture) in \
			arm64) cross="gcc-x86-64-linux-gnu libc6-dev-amd64-cross" ;; \
			amd64) cross="gcc-aarch64-linux-gnu libc6-dev-arm64-cross" ;; \
			*) echo "no cross toolchain mapping for this builder"; exit 1 ;; \
		esac; \
		echo "== cli toolchains ($$cross mingw) =="; \
		apt-get install -y -qq $$cross gcc-mingw-w64-x86-64 >/dev/null; \
		for target in $(CLI_TARGETS); do \
			echo "== cli build $$target =="; \
			rustup target add $$target >/dev/null 2>&1; \
			CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=x86_64-linux-gnu-gcc \
			CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
			CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc \
			CC_x86_64_unknown_linux_gnu=x86_64-linux-gnu-gcc \
			CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
			CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc \
			cargo build -p shojiku-cli --bin shojiku --release --locked --target $$target $(CARGO_JOBS); \
			out=/repo/$(CLI_DIST)/$$target; mkdir -p $$out; \
			found=0; \
			for bin in target/$$target/release/shojiku target/$$target/release/shojiku.exe; do \
				[ -f "$$bin" ] && { cp "$$bin" $$out/; found=1; }; \
			done; \
			[ "$$found" -eq 1 ] || { echo "no shojiku binary for $$target"; exit 1; }; \
		done; \
		echo "== cli checksums =="; \
		cd /repo/$(CLI_DIST) && find . -type f ! -name SHA256SUMS \
			-exec sha256sum {} + | sort -k2 > SHA256SUMS; \
		echo "artifacts:"; cat SHA256SUMS'
	@echo "cli artifacts in $(CLI_DIST)/ (uncommitted; SHA256SUMS beside them)"

## ---- job: sdk-ruby -----------------------------------------------------

# Where `make capi-lib` parks the HOST-architecture cdylib the SDK images
# load. Under the same gitignored tree as the release matrix, in its own
# subdirectory so a `capi-dist` run and a gate run never overwrite each other.
CAPI_LOCAL := $(CAPI_DIST)/local
# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
RUBY_VER ?= 3.3
RUBY_IMAGE := shojiku-sdk-ruby:$(RUBY_VER)$(SDK_SUFFIX)

# CAPI_PREBUILT=1 accepts a library that is already in place instead of
# building one. The seven SDK gates each depend on this target, so in a
# pipeline that runs them as parallel jobs the engine would otherwise be
# built seven times over; CI builds it once, passes it between jobs as an
# artifact, and sets this. It is deliberately opt-IN — a stale library
# silently satisfying a local gate is exactly the failure this repository
# spent a cycle on, so nothing infers "prebuilt" from the file's presence.
capi-lib: ## Build the host-arch C ABI cdylib into dist/capi/local (SDK gates load it)
	@echo "== capi lib (host arch) =="
	@mkdir -p $(CAPI_LOCAL)
	@if [ "$(CAPI_PREBUILT)" = "1" ]; then \
		ls $(CAPI_LOCAL)/*shojiku_capi.* >/dev/null 2>&1 || { \
			echo "CAPI_PREBUILT=1 but $(CAPI_LOCAL)/ carries no library"; exit 1; }; \
		echo "using the prebuilt library in $(CAPI_LOCAL)/"; \
		exit 0; \
	fi; \
	$(CARGO_IN_DOCKER) 'cargo build -p shojiku-capi --release --locked $(CARGO_JOBS); \
		for ext in so dylib dll; do \
			for lib in target/release/*shojiku_capi.$$ext; do \
				[ -f "$$lib" ] && cp "$$lib" /repo/$(CAPI_LOCAL)/; \
			done; \
		done; \
		count=$$(ls /repo/$(CAPI_LOCAL) | wc -l); \
		[ "$$count" -eq 1 ] || { \
			echo "expected one loadable library, found $$count"; \
			ls /repo/$(CAPI_LOCAL); exit 1; }'
	@echo "engine library: $(CAPI_LOCAL)/"

## ---- job: napi ---------------------------------------------------------

# Where the host-architecture Node addon lands, beside the cdylib and
# gitignored the same way. A `.node` file is an ordinary dynamic library under
# a name node's loader recognises, so this is a rename rather than a repack.
NAPI_LOCAL := dist/napi/local

# The addon is the node SDK's deliverable and the ONE build that turns the
# `shim` feature on. Everything else in the grid builds this crate WITHOUT it
# — which is the point: `cargo test`/`llvm-cov` never compile the N-API
# marshalling glue, so it stays out of the 100% coverage surface exactly as
# engine/wasm's wasm-bindgen shim does.
#
# `clippy` (which passes --all-features) DOES lint the shim, so this target
# does not repeat it; what only this target can prove is that the shim LINKS
# and that node can load what comes out.
# NAPI_PREBUILT=1 is the addon's half of the CAPI_PREBUILT switch above, with
# the same reasoning and the same opt-IN discipline. Only the BUILD is
# skipped: the node load check below still runs, which is exactly what you
# want over an addon that traveled as a pipeline artifact.
napi: ## Build the Node addon (engine/napi with the shim feature) into dist/napi/local
	@echo "== napi addon (host arch) =="
	@mkdir -p $(NAPI_LOCAL)
	@if [ "$(NAPI_PREBUILT)" = "1" ]; then \
		[ -f "$(NAPI_LOCAL)/shojiku.node" ] || { \
			echo "NAPI_PREBUILT=1 but $(NAPI_LOCAL)/shojiku.node is missing"; exit 1; }; \
		echo "using the prebuilt addon in $(NAPI_LOCAL)/"; \
		exit 0; \
	fi; \
	$(CARGO_IN_DOCKER) 'cargo build -p shojiku-napi --release --locked \
		--features shim $(CARGO_JOBS); \
		found=0; \
		for ext in so dylib dll; do \
			for lib in target/release/*shojiku_napi.$$ext; do \
				[ -f "$$lib" ] && cp "$$lib" /repo/$(NAPI_LOCAL)/shojiku.node && found=1; \
			done; \
		done; \
		[ "$$found" -eq 1 ] || { echo "no loadable addon was produced"; exit 1; }'
	@echo "== napi load check (node $(NODE_FLOOR_IMAGE)) =="
	@# ONE LINE, deliberately. A backslash-newline inside these single quotes
	@# is not a shell continuation, so what follows reaches the interpreter
	@# verbatim — fine for the recipes whose quoted body IS shell (the shell
	@# joins the lines itself), fatal here because JavaScript has no such
	@# continuation and node dies on the stray backslash. GNU Make 3.81, which
	@# macOS still ships, strips the pair before the shell sees it and hides
	@# the whole problem; Make 4.x on a Linux runner does not, so this failed
	@# only in CI.
	@docker run --rm -v "$(CURDIR)/$(NAPI_LOCAL):/addon:ro" $(NODE_FLOOR_IMAGE) \
		node -e 'const a=require("/addon/shojiku.node"); if (a.abiVersion() !== 1) { throw new Error("unexpected ABI revision"); } console.log("addon loads; abi", a.abiVersion());'
	@echo "engine addon: $(NAPI_LOCAL)/shojiku.node"

# Alias kept beside capi-lib's name so the two injected-binary steps read as a
# pair in the SDK image recipes.
napi-lib: napi ## Alias for `napi` — the addon the sdk/js gate image loads

## ---- job: cli-bin ------------------------------------------------------

# Where the host-architecture `shojiku` BINARY lands for the SUBPROCESS SDKs'
# gate images, under the same gitignored tree as the release matrix and in its
# own subdirectory so a `cli-dist` run and a gate run never overwrite each
# other. `capi-lib` for the four FFI SDKs, `napi` for node, this for php/go:
# the same rule three times over — the engine is built ONCE through the pinned
# Rust image and injected already compiled, and no language image compiles
# Rust.
CLI_LOCAL := $(CLI_DIST)/local

# CLI_PREBUILT=1 is the subprocess SDKs' half of the CAPI_PREBUILT switch
# above, with the same reasoning and the same opt-IN discipline.
cli-bin: ## Build the host-arch `shojiku` CLI into dist/cli/local (subprocess SDK gates run it)
	@echo "== cli bin (host arch) =="
	@mkdir -p $(CLI_LOCAL)
	@if [ "$(CLI_PREBUILT)" = "1" ]; then \
		[ -x "$(CLI_LOCAL)/shojiku" ] || { \
			echo "CLI_PREBUILT=1 but $(CLI_LOCAL)/shojiku is missing or not executable"; \
			exit 1; }; \
		echo "using the prebuilt binary in $(CLI_LOCAL)/"; \
		exit 0; \
	fi; \
	$(CARGO_IN_DOCKER) 'cargo build -p shojiku-cli --bin shojiku --release --locked \
		$(CARGO_JOBS); \
		cp target/release/shojiku /repo/$(CLI_LOCAL)/'
	@echo "engine binary: $(CLI_LOCAL)/shojiku"

## ---- job: install proofs (scripts/install-proof/) -----------------------

# What no SDK gate can prove: that a package reaches the engine THROUGH ITS
# OWN PACKAGING. Every gate injects the engine; these embed the host-arch
# payload the way a release does, build the real package, install it into a
# CLEAN floor-version container and render through it. One platform on
# purpose — the defect class is about SHAPE, and shape does not vary across
# the matrix. Needs network (each proof installs its packaging toolchain), so
# `verify` does not include them; CI runs them as their own job matrix.
proof-python: capi-lib ## Install proof: wheel with the cdylib as package data
	@PYTHON_VER=$(PYTHON_VER) sh scripts/install-proof/python.sh
proof-ruby: capi-lib ## Install proof: platform gem carrying the cdylib
	@RUBY_VER=$(RUBY_VER) sh scripts/install-proof/ruby.sh
proof-dotnet: capi-lib ## Install proof: nupkg with a RID native asset
	@DOTNET_VER=$(DOTNET_VER) sh scripts/install-proof/dotnet.sh
proof-java: capi-lib ## Install proof: platform classifier jar on a consumer classpath
	@JAVA_VER=$(JAVA_VER) GATE_IMG=$(JAVA_IMAGE) sh scripts/install-proof/java.sh
proof-js: napi ## Install proof: napi addon inside a platform package
	@NODE_VER=$(NODE_VER) sh scripts/install-proof/js.sh
proof-php: cli-bin ## Install proof: composer package driving a PATH-found CLI
	@PHP_VER=$(PHP_VER) sh scripts/install-proof/php.sh
proof-go: cli-bin ## Install proof: go module driving a PATH-found CLI
	@GO_VER=$(GO_VER) sh scripts/install-proof/go.sh

proof: proof-python proof-ruby proof-dotnet proof-java proof-js proof-php proof-go ## All seven install proofs

# PUBLISHED-install proofs: the same question asked of the REGISTRY copy
# instead of a package built here. They take no artifact prerequisite — the
# point is that nothing local is involved — and they only mean anything once
# the version is actually published. SHOJIKU_VERSION=x.y.z pins one;
# unset takes whatever the registry calls latest. php and go are absent
# because their SDKs are not published (Packagist deferred; go is a repo tag),
# and crates is absent until crates.io has a first publish.
proof-published-python: ## Published-install proof: pip install shojiku from PyPI
	@PYTHON_VER=$(PYTHON_VER) sh scripts/install-proof/published-python.sh
proof-published-ruby: ## Published-install proof: gem install shojiku from rubygems.org
	@RUBY_VER=$(RUBY_VER) sh scripts/install-proof/published-ruby.sh
proof-published-dotnet: ## Published-install proof: dotnet add package Shojiku from nuget.org
	@DOTNET_VER=$(DOTNET_VER) sh scripts/install-proof/published-dotnet.sh
proof-published-java: ## Published-install proof: jp.kengos:shojiku from Maven Central
	@sh scripts/install-proof/published-java.sh
proof-published-js: ## Published-install proof: npm install shojiku from npmjs.com
	@NODE_VER=$(NODE_VER) sh scripts/install-proof/published-js.sh
proof-published-crates: ## Published-install proof: cargo install shojiku-cli from crates.io
	@RUST_VER=$(RUST_VERSION) sh scripts/install-proof/published-crates.sh

proof-published: proof-published-python proof-published-ruby proof-published-dotnet proof-published-java proof-published-js proof-published-crates ## All published-install proofs

# The engine library is INJECTED already compiled (capi-lib above); no
# language image ever builds Rust. The sidecar sdk/ruby/Dockerfile.dockerignore
# is what lets this build see sdk/ at all — the root .dockerignore excludes it.
sdk-ruby: capi-lib ## sdk/ruby gates: rubocop + rspec at 100% coverage + gem build/install
	@echo "== sdk ruby image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@echo "== sdk ruby (rubocop + rspec + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) sh -euc '\
		bundle exec rake lint spec ;\
		cd /tmp ;\
		cp -r /repo/sdk/ruby /tmp/build ;\
		cd /tmp/build ;\
		gem build shojiku.gemspec ;\
		gem install --local --no-document shojiku-*.gem ;\
		ruby -e "require \"shojiku\"; Shojiku::Client"'

sdk-ruby-test: capi-lib ## sdk/ruby rspec only (what `make test:sdk:ruby` runs)
	@echo "== sdk ruby test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) bundle exec rake spec

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-ruby-lint: capi-lib ## sdk/ruby rubocop only (what `make lint:sdk:ruby` runs)
	@echo "== sdk ruby lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg RUBY_VERSION=$(RUBY_VER) -f sdk/ruby/Dockerfile -t $(RUBY_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/ruby \
		-e BUNDLE_GEMFILE=/gem/Gemfile $(RUBY_IMAGE) bundle exec rake lint

## ---- job: sdk-python ---------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
PYTHON_VER ?= 3.11
PYTHON_IMAGE := shojiku-sdk-python:$(PYTHON_VER)$(SDK_SUFFIX)

# Same shape as sdk-ruby: the engine library is INJECTED already compiled
# (capi-lib); no language image ever builds Rust. The sidecar
# sdk/python/Dockerfile.dockerignore is what lets this build see dist/ at all —
# the root .dockerignore excludes sdk/ and never mentioned dist/capi/local.
#
# The wheel is built and installed in a scratch directory, NOT on the mount:
# installing from /repo would let the source tree satisfy the import and prove
# nothing about the artifact. The import check runs with PYTHONPATH cleared for
# the same reason.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain (POSIX: an AND-OR list), so
# `lint && test; package` reports the PACKAGE step's status and greens over a
# failed test run. This recipe shipped that way for one run and reported PASS
# while ruff had failed and pytest had never executed.
sdk-python: capi-lib ## sdk/python gates: ruff + mypy + pytest at 100% coverage + wheel build/install
	@echo "== sdk python image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@echo "== sdk python (ruff + mypy + pytest + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) sh -euc '\
		ruff format --check . ;\
		ruff check . ;\
		mypy ;\
		pytest ;\
		cp -r /repo/sdk/python /tmp/build ;\
		cd /tmp/build ;\
		python -m build --wheel --outdir /tmp/wheel ;\
		pip install --no-cache-dir --no-index /tmp/wheel/shojiku-*.whl ;\
		cd /tmp ;\
		PYTHONPATH= python -c "import shojiku; shojiku.Client"'

sdk-python-test: capi-lib ## sdk/python pytest only (what `make test:sdk:python` runs)
	@echo "== sdk python test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) pytest

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-python-lint: capi-lib ## sdk/python static checks only (ruff + mypy)
	@echo "== sdk python lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg PYTHON_VERSION=$(PYTHON_VER) -f sdk/python/Dockerfile -t $(PYTHON_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/python $(PYTHON_IMAGE) sh -euc '\
		ruff format --check . ;\
		ruff check . ;\
		mypy'

## ---- job: sdk-dotnet ---------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
DOTNET_VER ?= 10.0
DOTNET_IMAGE := shojiku-sdk-dotnet:$(DOTNET_VER)$(SDK_SUFFIX)

# Same shape as sdk-ruby and sdk-python: the engine library is INJECTED already
# compiled (capi-lib); no language image ever builds Rust. The sidecar
# sdk/dotnet/Dockerfile.dockerignore is what lets this build see the project
# manifests at all — the root .dockerignore excludes sdk/ and never mentioned
# dist/capi/local.
#
# The package is built and restored in a scratch directory, NOT on the mount:
# packing from /repo would leave obj/ and bin/ artifacts in the working tree,
# and restoring the package where the project already satisfies the reference
# would prove nothing about the artifact.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED for
# a failing command inside an `&&` chain (POSIX: an AND-OR list), so
# `format && test; pack` reports the PACK step's status and greens over a failed
# test run.
sdk-dotnet: capi-lib ## sdk/dotnet gates: dotnet format + xunit at 100% line coverage + pack/restore
	@echo "== sdk dotnet image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@echo "== sdk dotnet (format + test + pack) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) sh -euc '\
		dotnet format --verify-no-changes ;\
		dotnet test ;\
		cp -r /repo/sdk/dotnet /tmp/build ;\
		cd /tmp/build ;\
		dotnet pack Shojiku/Shojiku.csproj -c Release -o /tmp/pkg ;\
		ls /tmp/pkg/Shojiku.*.nupkg'

sdk-dotnet-test: capi-lib ## sdk/dotnet xunit only (what `make test:sdk:dotnet` runs)
	@echo "== sdk dotnet test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) dotnet test

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-dotnet-lint: capi-lib ## sdk/dotnet format + analyzers only (what `make lint:sdk:dotnet` runs)
	@echo "== sdk dotnet lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg DOTNET_VERSION=$(DOTNET_VER) -f sdk/dotnet/Dockerfile -t $(DOTNET_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/dotnet $(DOTNET_IMAGE) sh -euc '\
		dotnet format --verify-no-changes ;\
		dotnet build Shojiku/Shojiku.csproj'

## ---- job: sdk-java -----------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
JAVA_VER ?= 21
JAVA_IMAGE := shojiku-sdk-java:$(JAVA_VER)$(SDK_SUFFIX)

# Same shape again. Two things this one had to get right beyond the others:
#
#   * `mvn -o` (offline) is what keeps a gate run from resolving a different
#     plugin than the change was tested against — but `dependency:go-offline`
#     alone does NOT fetch surefire's test-framework PROVIDER, which surefire
#     picks at test time. The image therefore runs the whole `verify` lifecycle
#     once over a throwaway test; see sdk/java/Dockerfile.
#   * `mvn verify` already IS the full bar here: spotless (validate), the
#     compiler's -Xlint -Werror, surefire, jacoco's 100% LINE rule, and the
#     sources + javadoc jars Maven Central requires. So the packaging step other
#     SDKs bolt on is not separate — it is the same lifecycle, and the jar list
#     below is what proves it produced all three.
sdk-java: capi-lib ## sdk/java gates: spotless + junit at 100% line coverage + jar/sources/javadoc
	@echo "== sdk java image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@echo "== sdk java (spotless + junit + jacoco + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) sh -euc '\
		mvn -B -o verify ;\
		ls target/shojiku-*.jar target/shojiku-*-sources.jar target/shojiku-*-javadoc.jar'

sdk-java-test: capi-lib ## sdk/java junit only (what `make test:sdk:java` runs)
	@echo "== sdk java test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) \
		mvn -B -o -Dspotless.check.skip=true -Djacoco.skip=true test

# capi-lib even for lint: the image COPYs the library in, so it cannot build
# without one. Cheap after the first run — cargo has nothing to redo.
sdk-java-lint: capi-lib ## sdk/java spotless + compiler lint only (what `make lint:sdk:java` runs)
	@echo "== sdk java lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION=$(JAVA_VER) -f sdk/java/Dockerfile -t $(JAVA_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/java $(JAVA_IMAGE) \
		mvn -B -o spotless:check test-compile

## ---- fuzzing (on-demand, NOT in verify) --------------------------------
#
# Coverage-guided fuzzing of the parsers that read attacker-chosen bytes: the
# shared PDF reader, the whole verifier, and the two DER-side parsers a
# mutating fuzzer would otherwise never reach. Deliberately out of `verify`:
# fuzzing has no natural end, so a gate would either be useless (a few
# seconds) or unbearable. What CI runs instead is the corpus REPLAY in
# engine/verify's tests — every committed seed through the same entry points.
#
# engine/fuzz is outside the workspace (nightly + libFuzzer + a sanitizer
# runtime), so this target owns its whole toolchain: nightly, a C++ compiler
# (libfuzzer-sys builds libFuzzer from source), and cargo-fuzz. All three
# persist in the named volumes except g++, which is a per-run apt install.
#
#   make fuzz                                  every target, 60s each
#   make fuzz FUZZ_TARGET=cms_container        one target
#   make fuzz FUZZ_SECS=600                    longer runs
#
# Each target is ALSO wrapped in a wall-clock `timeout`, because libFuzzer's
# own `-max_total_time` has been seen to overshoot enormously: `trust_anchors`
# twice ran past ten minutes on a fifteen-second budget while its own exec/s
# figure implied only ~10 seconds had passed, then behaved normally on the
# next run. Whatever the cause, an on-demand target that might run for ten
# minutes reads as a hang, so the wall clock is the real bound. SIGINT lets
# libFuzzer save its corpus on the way out, and 124/130 mean "budget reached"
# rather than failure — a real crash exits with libFuzzer's own non-zero
# status and stops the loop.
#
# A crash lands in engine/fuzz/artifacts/<target>/ (on the repo mount, where
# you can read it); turn it into a committed corpus file — the replay tests
# then guard it — rather than committing the artifact.
#
# Two things to know before hand-rolling a `cargo fuzz run` outside this
# target: the FIRST corpus argument is the WRITABLE one (pass the volume path
# first and the committed seeds after, or libFuzzer writes its finds into the
# repo mount), and the pinned rust image has `gcc` but no `g++`/`clang` — a
# fuzz dependency needing a C++ compiler fails at build time, not at run time.
#
# The WORKING corpus lives in a named volume, not on the repo mount, and that
# is a performance decision rather than tidiness: libFuzzer writes a file per
# NEW/REDUCE, which is thousands of small writes a minute, and on a bind mount
# that turned a 20-second budget into a six-minute run that looked exactly
# like a hang. It persists across runs like the cargo/rustup volumes do;
# `docker volume rm shojiku-fuzz-corpus` starts over.
FUZZ_TARGETS := pdf_document verify_document contents_window cms_container trust_anchors
FUZZ_TARGET  ?=
FUZZ_SECS    ?= 60

fuzz: ## Fuzz the sign/verify parsers (nightly+libFuzzer; FUZZ_TARGET=<name> FUZZ_SECS=<n>)
	@echo "== fuzz ($(FUZZ_SECS)s per target) =="
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo/engine/fuzz \
		-v "$(CARGO_VOLUME):/usr/local/cargo" \
		-v "$(RUSTUP_VOLUME):/usr/local/rustup" \
		-v shojiku-fuzz-corpus:/fuzz-corpus \
		$(RUST_IMAGE) sh -euc '\
		command -v g++ >/dev/null 2>&1 || { \
			apt-get update -qq >/dev/null && \
			apt-get install -y -qq g++ >/dev/null; }; \
		rustup toolchain install nightly --profile minimal >/dev/null 2>&1; \
		command -v cargo-fuzz >/dev/null 2>&1 || cargo install cargo-fuzz --locked; \
		cargo +nightly run --example seed; \
		for target in $(if $(FUZZ_TARGET),$(FUZZ_TARGET),$(FUZZ_TARGETS)); do \
			echo "== fuzz $$target =="; \
			mkdir -p /fuzz-corpus/$$target; \
			status=0; \
			timeout -s INT $$(( $(FUZZ_SECS) * 4 + 60 )) \
				cargo +nightly fuzz run --fuzz-dir /repo/engine/fuzz "$$target" \
				/fuzz-corpus/$$target corpus/$$target \
				-- -max_total_time=$(FUZZ_SECS) || status=$$?; \
			[ $$status -eq 0 ] || [ $$status -eq 124 ] || [ $$status -eq 130 ] \
				|| exit $$status; \
		done'

## ---- job: sdk-js -------------------------------------------------------

# Floor from docs/agents/sdk.md. CI also runs the newest supported line;
# the tag carries the version so the two do not overwrite each other.
NODE_VER ?= 22
JS_IMAGE := shojiku-sdk-js:$(NODE_VER)$(SDK_SUFFIX)

# Same shape as the other four SDK gates, with one difference that is the whole
# reason node needed its own transport: the injected binary is the NATIVE ADDON
# (`make napi`), not the shared cdylib — node has no stdlib FFI to load one
# with. The sidecar sdk/js/Dockerfile.dockerignore is what lets this build see
# sdk/ and dist/ at all; the root .dockerignore excludes both.
#
# The tarball is packed and installed in a scratch directory, NOT on the mount:
# installing from /repo would let the source tree satisfy the import and prove
# nothing about the artifact.
#
# ONE COMMAND PER LINE, deliberately. Under `sh -euc`, errexit is SUPPRESSED
# for a failing command inside an `&&` chain, so `lint && test; package` would
# report the PACKAGE step's status and green over a failed test run.
sdk-js: napi ## sdk/js gates: biome + tsc + vitest at 100% coverage + pack/install
	@echo "== sdk js image =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@echo "== sdk js (biome + tsc + vitest + package) =="
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run lint ;\
		pnpm run typecheck ;\
		pnpm run test ;\
		cp -r /repo/sdk/js /tmp/build ;\
		cd /tmp/build ;\
		rm -rf node_modules ;\
		pnpm install --ignore-scripts --frozen-lockfile ;\
		pnpm run build ;\
		pnpm pack --pack-destination /tmp/pack ;\
		mkdir -p /tmp/consumer ;\
		cd /tmp/consumer ;\
		npm init -y >/dev/null ;\
		npm install --no-audit --no-fund /tmp/pack/shojiku-*.tgz ;\
		node --input-type=module -e "import { Client } from \"shojiku\"; if (typeof Client !== \"function\") { throw new Error(\"the package does not export Client\"); }"'

sdk-js-test: napi ## sdk/js vitest only (what `make test:sdk:js` runs)
	@echo "== sdk js test =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run test'

# napi even for lint: the image COPYs the addon in, so it cannot build without
# one. Cheap after the first run — cargo has nothing to redo.
sdk-js-lint: napi ## sdk/js static checks only (biome + tsc)
	@echo "== sdk js lint =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run lint ;\
		pnpm run typecheck'

sdk-js-format: napi ## Apply biome fixes to sdk/js (the seconds-cheap format pass)
	@echo "== sdk js format =="
	@DOCKER_BUILDKIT=1 docker build -q --build-arg NODE_VERSION=$(NODE_VER) --build-arg PNPM_VERSION=$(PNPM_VERSION_SDK) -f sdk/js/Dockerfile -t $(JS_IMAGE) . >/dev/null
	@docker run --rm -v "$(CURDIR):/repo" -w /repo/sdk/js $(JS_IMAGE) sh -euc '\
		ln -sfn /pkg/node_modules node_modules ;\
		pnpm run format'

## ---- job: gui ----------------------------------------------------------

# The pnpm version is declared ONCE, by `packageManager` in each workspace's
# package.json, and read back out here. corepack used to be what acted on that
# declaration; Node stopped bundling corepack at 25, so pnpm is installed
# directly instead — the declaration stays the single source of truth, only the
# mechanism that honours it changed.
PNPM_VERSION     := $(shell sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' gui/package.json)
PNPM_VERSION_SDK := $(shell sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' sdk/js/package.json)

# Run a pnpm command over the gui/ workspace in the pinned Node image. A named
# volume persists the pnpm store across runs (like the cargo/rustup volumes).
# pnpm is installed at the version gui/package.json pins (see PNPM_VERSION).
#
# Iterating on a few gui test files is much faster than the whole `make gui`,
# but run it under THIS image and THIS store volume — copy the flags below
# rather than improvising a pair. `node_modules` lives on the repo mount, so an
# install under a different base image leaves another platform's native
# bindings there and the next run dies with `Cannot find module
# './rolldown-binding.<platform>.node'`, which reads exactly like a broken
# dependency tree rather than an image mismatch. The full scoped-iteration
# recipe (and why COREPACK_ENABLE_DOWNLOAD_PROMPT=0 is load-bearing) is in
# docs/agents/gotchas/docker-make.md; re-run `make gui` before committing.
PNPM_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/gui \
	-v "$(PNPM_VOLUME):/pnpm-store" \
	-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	$(NODE_IMAGE) sh -euc

gui: gui-budget ## gui/ workspace gates: line budget + typecheck + lint (0 warnings) + test/coverage
	@echo "== gui (typecheck + lint + coverage) =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm -r typecheck; \
		pnpm lint; \
		pnpm -r test $(if $(JOBS),-- $(VITEST_JOBS))'

gui-lint: ## gui/ typecheck + lint only (what `make lint:gui` runs)
	@echo "== gui lint =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm -r typecheck; \
		pnpm lint'

# F=<pattern> narrows the run to test files whose path matches, for the
# edit-run-edit loop (`make test:gui F=documentMetaModel`). It deliberately
# drops --coverage: one file cannot meet a 100% workspace threshold, so a
# scoped run that kept it would always fail and teach you to ignore the gate.
# `--passWithNoTests` is what lets it sweep every workspace package when only
# one of them holds a match. The plain form (no F) is the real gate and is what
# `make verify` runs; a narrowed run proves nothing about the others, so finish
# with `make test:gui` before saying tests pass.
gui-test: ## gui/ vitest only, no budget/typecheck/lint (F=<pattern> narrows, no coverage)
	@echo "== gui test$(if $(F), (F=$(F))) =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		$(if $(F),pnpm -r exec vitest run --passWithNoTests "$(F)",pnpm -r test $(if $(JOBS),-- $(VITEST_JOBS)))'

gui-budget: ## gui/ per-file executable-line budget (scripts/check-gui-line-budget.sh)
	@echo "== gui line budget =="
	@scripts/check-gui-line-budget.sh

gui-format: ## Apply Biome formatting/lint fixes across gui/ (writes files)
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install; \
		pnpm format'

gui-e2e: ## Designer-app browser golden path (Playwright in Docker) — on-demand, not in verify
	@echo "== designer-app e2e (browser golden path) =="
	@sh gui/designer-app/e2e/run-e2e.sh

gui-shot: ## Screenshot the running `make gui-dev` into .shots/ — LOOK at a chrome change
	@echo "== designer screenshots (Playwright in Docker, against gui-dev) =="
	@sh gui/designer-app/e2e/run-shot.sh

# The self-contained Designer-app image (wasm + Vite build + assembled data +
# nginx) — the same image the gui-e2e golden path tests.
GUI_APP_IMAGE := shojiku-designer-app:$(WORK_TAG)
GUI_SERVE_PORT ?= 8788
GUI_DEV_PORT   ?= 5173

gui-serve: ## Build the Designer-app image and serve it (http://localhost:8788, Ctrl-C stops)
	@echo "== designer-app image (wasm + build + assemble + nginx) =="
	docker build --build-arg PNPM_VERSION=$(PNPM_VERSION) -f gui/designer-app/Dockerfile -t $(GUI_APP_IMAGE) .
	@echo "serving the Designer at http://localhost:$(GUI_SERVE_PORT)/ — Ctrl-C to stop"
	docker run --rm -p $(GUI_SERVE_PORT):80 $(GUI_APP_IMAGE)

gui-dev: ## Vite dev server (HMR) in Docker for gui/ work (http://localhost:5173, Ctrl-C stops)
	@echo "== designer-app dev server (Vite, HMR) =="
	@test -d engine/wasm/pkg || $(MAKE) wasm
	docker run --rm -it -p $(GUI_DEV_PORT):5173 \
		-v "$(CURDIR):/repo" -w /repo/gui \
		-v "$(PNPM_VOLUME):/pnpm-store" \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		$(NODE_IMAGE) sh -euc 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm --filter @shojiku/designer-app assemble; \
		pnpm --filter @shojiku/designer-app dev'

proof-deploy: ## Run every deploy-recipe proof against the public registries (network; on demand)
	@for l in python ruby node dotnet java; do scripts/install-proof/deploy-$$l.sh || exit 1; done

## ---- site (the homepage — site/, VitePress + the live wasm renderer) ----

# Run a pnpm/node command over site/ in the pinned Node image (the gui macro's
# sibling; site/ is a standalone pnpm project, not a gui workspace member).
SITE_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/site \
	-v "$(PNPM_VOLUME):/pnpm-store" \
	-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	$(NODE_IMAGE) sh -euc

site: ## site/ gates: typecheck + tests/coverage (integration suite needs `make wasm` once)
	@echo "== site (typecheck + tests) =="
	@test -d engine/wasm/pkg || $(MAKE) wasm
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm typecheck; \
		pnpm test'

site-lint: ## site/ typecheck only (what `make lint:site` runs)
	@echo "== site typecheck =="
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm typecheck'

site-test: ## site/ vitest only (what `make test:site` runs)
	@echo "== site tests =="
	@test -d engine/wasm/pkg || $(MAKE) wasm
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm test'

site-data: ## Refresh the committed README gallery section from examples/gallery.yml
	@echo "== site data refresh =="
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts'

# No wasm build: site/.data/wasm is pinned by the sha256 digests recorded in
# site/.data/wasm-source.json, so this says the same thing on every host
# architecture. Rebuilding to compare is what made the homepage track HEAD.
site-check: ## Fail if the committed site inputs drift (README gallery + the site engine pin)
	@echo "== site data check =="
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts --check'

site-wasm-release: ## RELEASE ONLY: re-pin site/.data/wasm to the released engine (engine/wasm/pkg)
	@echo "== site engine re-pin =="
	@test -d engine/wasm/pkg || $(MAKE) wasm
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts --release-wasm'

# WARNING — this STAGES site/.data/wasm (a RELEASED engine build) into
# engine/wasm/pkg, which is also what the site's own tests load as "a fresh
# build of HEAD". So after a `make site-build`, a later `make site` in the same
# tree is silently testing the RELEASED engine, not your changes — a green run
# proving less than it looks like it does. `make verify` is unaffected (it does
# not run this) and CI cannot hit it (fresh checkouts); it bites the human who
# runs both in one tree. Re-run `make wasm` before trusting a later gate. The
# tell: `make site-wasm-release` suddenly SUCCEEDS where it refused minutes
# earlier — that is the guard comparing the site's own bytes against
# themselves, not a fixed problem.
site-build: ## The full Pages build locally (site + /designer/) into site/.vitepress/dist
	@echo "== site build (Pages mirror) =="
	@$(SITE_IN_DOCKER) 'bash scripts/build-pages.sh'

site-dev: ## VitePress dev server in Docker (http://localhost:5174, Ctrl-C stops)
	@echo "== site dev server =="
	@test -d engine/wasm/pkg || $(MAKE) wasm
	docker run --rm -it -p 5174:5174 \
		-v "$(CURDIR):/repo" -w /repo/site \
		-v "$(PNPM_VOLUME):/pnpm-store" \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		$(NODE_IMAGE) sh -euc 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		node scripts/assemble-data.ts; \
		pnpm exec vitepress dev --host --port 5174'

## ---- sbom ---------------------------------------------------------------

sbom: ## Regenerate CycloneDX SBOMs under sbom/ (engine, gui, sdk/js when present)
	@SYFT_IMAGE=$(SYFT_IMAGE) scripts/generate-sbom.sh

## ---- housekeeping ------------------------------------------------------

clean: ## Remove local artifacts (out.pdf, lcov.info, stderr.txt)
	rm -f out.pdf stderr.txt engine/lcov.info

cache-clean: ## Drop the persistent cargo/rustup/pnpm Docker volumes
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
# to rebuild, not seconds. `cache-clean` above is the deliberate way to drop
# those.
BUILT_IMAGES := $(IMAGE) $(GUI_APP_IMAGE) $(APP_E2E_IMAGE) $(WASM_E2E_IMAGE) \
                $(PHP_IMAGE) $(GO_IMAGE) $(RUBY_IMAGE) $(PYTHON_IMAGE) \
                $(DOTNET_IMAGE) $(JAVA_IMAGE) $(JS_IMAGE)

images-clean: ## Remove the docker images this tree's gates build (keeps the cache volumes)
	@docker rmi $(BUILT_IMAGES) 2>/dev/null || true
	@echo "removed this tree's built images (WORK_TAG=$(WORK_TAG)); cache volumes kept — 'make cache-clean' drops those"
