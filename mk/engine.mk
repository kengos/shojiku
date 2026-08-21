# engine/ — the Rust workspace: gates, artifacts, lockfile
#
# Every target defined here is named `engine:<job>` (public) or `_engine-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

## ---- lock:<scope> / update:<scope> — the four lockfiles -----------------
#
# These WRITE files. They belong to the "Apply fixes" half of the surface, not
# the gate grid, and deliberately do NOT go through `quiet`:
# you want to read what moved, and a PASS line would invite reading them as
# gates. They prove nothing — run the scope's `verify:` afterwards.
#
# Two verbs, because these are not the same request:
#
#   lock:<scope>    re-resolve after a MANIFEST edit. A dependency that
#                   already satisfies its range does not move.
#   update:<scope>  bump to the newest release each range still allows — the
#                   advisory-clearing verb. It moves things you did not name,
#                   so read the lockfile diff before committing it.
#
# The scopes are the four lockfiles: engine/Cargo.lock and the three pnpm
# projects (gui/ is a 3-member workspace, site/ and sdk/js/ are standalone).
#
# minimumReleaseAge (7 days, in each pnpm-workspace.yaml) applies at
# RESOLUTION here, so `update:` will decline a fix published this week and
# leave the older version in place. That is the supply-chain guard working;
# the escape hatch is a per-package minimumReleaseAgeExclude entry, never
# lowering the window.

engine\:update: ## Bump engine/ deps within their Cargo.toml ranges (then: git add -f engine/Cargo.lock)
	@echo "== engine:update =="
	$(CARGO_IN_DOCKER) 'cargo update'
	@echo "engine/Cargo.lock updated — stage it with: git add -f engine/Cargo.lock"

## ---- engine -----------------------------------------------------------

# The scope's WHOLE bar, which is why it is the slow one; engine:budget /
# engine:fmt / engine:clippy / engine:test are the fast slices to iterate on.
# Same member set the old `verify:engine` ran, in the same order.
engine\:verify: ## Verify engine/ — budget + lint + tests at 100% coverage, deny, examples, wasm
	@$(call gate,_engine-verify,engine:verify)

_engine-verify: _engine-lint _engine-coverage _engine-deny _reference-check _examples-check _engine-wasm


engine\:lint: ## engine/ line budget + //! headers + fmt --check + clippy -D warnings
	@$(call gate,_engine-lint,engine:lint)

_engine-lint: _engine-budget _engine-fmt _engine-clippy

engine\:budget: ## .rs line budget + //! header check (scripts/check-line-budget.sh)
	@$(call gate,_engine-budget,engine:budget)

_engine-budget:
	@echo "== line budget =="
	@scripts/check-line-budget.sh

engine\:fmt: ## cargo fmt --check
	@$(call gate,_engine-fmt,engine:fmt)

_engine-fmt:
	@echo "== fmt =="
	$(CARGO_IN_DOCKER) 'rustup component add rustfmt >/dev/null 2>&1; \
		cargo fmt --all -- --check'

engine\:format: ## cargo fmt (apply formatting)
	$(CARGO_IN_DOCKER) 'rustup component add rustfmt >/dev/null 2>&1; \
		cargo fmt --all'

# The one place the workspace is resolved WITHOUT `--locked`, and the reason
# it has to exist: every gate passes `--locked` (the committed lockfile is
# authoritative), so the first gate after a dependency is added or removed
# dies with "cannot update the lock file ... because --locked was passed".
# Without a target for it the only way forward is a hand-built `docker run`
# reproducing CARGO_IN_DOCKER's mount and both cache volumes by hand — which
# is exactly the mount discipline CARGO_IN_DOCKER above exists to encode, and
# getting it wrong is the single biggest time-sink in this repository.
#
# `cargo metadata` resolves and writes the lockfile without compiling
# anything, so this is seconds rather than a build. It updates only what the
# manifest change requires; it is NOT `cargo update`, which would bump
# unrelated dependencies.
engine\:lock: ## Re-resolve engine/Cargo.lock after a Cargo.toml edit (then: git add engine/Cargo.lock)
	@echo "== engine:lock =="
	$(CARGO_IN_DOCKER) 'cargo metadata --format-version 1 >/dev/null'
	@echo "engine/Cargo.lock refreshed — stage it with: git add -f engine/Cargo.lock"

engine\:clippy: ## cargo clippy -D warnings (matches CI flags; JOBS=N caps parallelism)
	@$(call gate,_engine-clippy,engine:clippy)

_engine-clippy:
	@echo "== clippy =="
	$(CARGO_IN_DOCKER) 'rustup component add clippy >/dev/null 2>&1; \
		cargo clippy --workspace --all-targets --all-features --locked $(CARGO_JOBS) -- -D warnings'

# Judging a run by eye: count `test result: FAILED` rather than parsing the
# result lines by field position (`FAILED. 553 passed; 1 failed` has been
# mis-read as green). Cargo STOPS at the first failing binary, so FEWER
# `test result:` lines than usual is itself the tell that something failed
# early — the PASS/FAIL line from `make engine:test` is the reliable answer.
#
# P=<crate> and F=<name filter> narrow the run for the edit-run-edit loop
# (`make engine:test P=shojiku-layout`, `… F=document_meta`, or both) — the
# whole workspace is ~4 min and a crate is ~30 s, which is the gap that used
# to get filled with a hand-typed `docker run … cargo test -p …`. A narrowed
# run SKIPS the capi cdylib link below and proves nothing about the crates it
# did not build, so finish with a plain `make engine:test` before saying the
# tests pass. P takes several crates: P="shojiku-core shojiku-layout".
engine\:test: ## cargo test --workspace --locked + link the capi cdylib (P=<crate> F=<filter> narrow it)
	@$(call gate,_engine-test,engine:test)

_engine-test:
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
engine\:coverage: ## cargo llvm-cov, blocking at 100% lines (names the offending lines on failure)
	@$(call gate,_engine-coverage,engine:coverage)

_engine-coverage:
	@echo "== coverage (100% lines) =="
	@$(CARGO_IN_DOCKER) 'rm -f lcov.info; \
		rustup component add llvm-tools-preview >/dev/null 2>&1; \
		command -v cargo-llvm-cov >/dev/null 2>&1 || cargo install cargo-llvm-cov --locked; \
		cargo llvm-cov --workspace --locked --fail-under-lines 100 $(CARGO_JOBS) \
			--lcov --output-path lcov.info' \
	|| { code=$$?; \
	     echo; echo "-- which lines? (scripts/coverage-why.sh) --"; \
	     $(MAKE) --no-print-directory engine:coverage-why || true; \
	     exit $$code; }

engine\:coverage-why: ## Name the lines that failed the coverage gate (reads engine/lcov.info; no re-run)
	@scripts/coverage-why.sh

## ---- job: deny ---------------------------------------------------------

# `--all-features` is load-bearing, not thoroughness: without it cargo-deny
# does NOT traverse an optional dependency that no enabled feature turns on,
# so a rejected licence rides in unseen. Proven by negative control —
# webpki-roots (CDLA-Permissive-2.0, which the allowlist rejects) added as an
# OPTIONAL dep passes this gate and fails it the moment it is made
# non-optional. Two feature-gated trees depend on the flag: engine/napi's
# `shim` (which the npm package ships) and engine/core's `schema`.
engine\:deny: ## cargo deny check advisories licenses bans sources (ALL features — see above)
	@$(call gate,_engine-deny,engine:deny)

_engine-deny:
	@echo "== cargo deny =="
	$(CARGO_IN_DOCKER) 'command -v git >/dev/null 2>&1 || \
			{ apt-get update -qq && apt-get install -y -qq git >/dev/null; }; \
		command -v cargo-deny >/dev/null 2>&1 || cargo install cargo-deny --locked; \
		cargo deny --all-features check advisories licenses bans sources'

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
engine\:wasm: ## Build the browser WASM bindings (engine/wasm/pkg) + assert size budget
	@$(call gate,_engine-wasm,engine:wasm)

_engine-wasm:
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

engine\:wasm-e2e: ## Browser golden path (Playwright in Docker) — on-demand, not in verify
	@$(call gate,_engine-wasm-e2e,engine:wasm-e2e)

_engine-wasm-e2e:
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

engine\:capi-dist: ## Build the C ABI cdylib for the platform matrix + checksums (on-demand)
	@$(call gate,_engine-capi-dist,engine:capi-dist)

_engine-capi-dist:
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

engine\:cli-dist: ## Build the `shojiku` CLI for the platform matrix + checksums (on-demand)
	@$(call gate,_engine-cli-dist,engine:cli-dist)

_engine-cli-dist:
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

# Where `make engine:capi-lib` parks the HOST-architecture cdylib the SDK images
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
engine\:capi-lib: ## Build the host-arch C ABI cdylib into dist/capi/local (SDK gates load it)
	@$(call gate,_engine-capi-lib,engine:capi-lib)

_engine-capi-lib:
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
engine\:napi: ## Build the Node addon (engine/napi with the shim feature) into dist/napi/local
	@$(call gate,_engine-napi,engine:napi)

_engine-napi:
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
engine\:cli-bin: ## Build the host-arch `shojiku` CLI into dist/cli/local (subprocess SDK gates run it)
	@$(call gate,_engine-cli-bin,engine:cli-bin)

_engine-cli-bin:
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
#   make engine:fuzz                           every target, 60s each
#   make engine:fuzz FUZZ_TARGET=cms_container one target
#   make engine:fuzz FUZZ_SECS=600             longer runs
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

engine\:fuzz: ## Fuzz the sign/verify parsers (nightly+libFuzzer; FUZZ_TARGET=<name> FUZZ_SECS=<n>)
	@$(call gate,_engine-fuzz,engine:fuzz)

_engine-fuzz:
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

engine\:render: ## Render one template with the pack dirs already right: TPL=<file.yml> [PARAMS=<file.json>]
	@if [ -z "$(TPL)" ]; then \
		echo 'usage: make engine:render TPL=examples/business/invoice-ja/template.yml [PARAMS=…/params.json]' >&2; \
		echo '  A hand-run CLI has NO default pack directory — only this target passes one,' >&2; \
		echo '  which is why an ad-hoc `cargo run -p shojiku-cli` dies with `font pack not found`.' >&2; \
		exit 2; \
	fi
	@$(CARGO_IN_DOCKER) 'cargo build --release -p shojiku-cli'
	@$(GATE_LOCK) docker run --rm \
		-v "$(CURDIR):/repo" -w /repo \
		-e SHOJIKU_FONT_DIR=/repo/packs/fonts \
		-e SHOJIKU_LOCALE_DIR=/repo/packs/locale \
		$(RUST_IMAGE) ./engine/target/release/shojiku render \
			--template "$(TPL)" \
			$(if $(PARAMS),--params "$(PARAMS)",) \
			--output /repo/.make-logs/engine-render.pdf
	@printf 'wrote .make-logs/engine-render.pdf\n'
