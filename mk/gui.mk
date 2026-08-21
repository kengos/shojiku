# gui/ — the Designer packages (pnpm workspace) and its dev surfaces
#
# Every target defined here is named `gui:<job>` (public) or `_gui-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

gui\:lock: ## Re-resolve gui/pnpm-lock.yaml after a package.json change
	@echo "== gui:lock =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --lockfile-only'

gui\:update: ## Bump gui/ deps within their package.json ranges
	@echo "== gui:update =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm update -r'

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
# Iterating on a few gui test files is much faster than the whole `make gui:verify`,
# but run it under THIS image and THIS store volume — copy the flags below
# rather than improvising a pair. `node_modules` lives on the repo mount, so an
# install under a different base image leaves another platform's native
# bindings there and the next run dies with `Cannot find module
# './rolldown-binding.<platform>.node'`, which reads exactly like a broken
# dependency tree rather than an image mismatch. Do not improvise the scoped
# run: `make gui:test F=<pattern>` is it, and it already carries this recipe
# (COREPACK_ENABLE_DOWNLOAD_PROMPT=0 included — without it corepack blocks on a
# download prompt no one is there to answer). Re-run `make gui:verify` before committing.
PNPM_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/gui \
	-v "$(PNPM_VOLUME):/pnpm-store" \
	-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	$(NODE_IMAGE) sh -euc

gui\:verify: ## gui/ workspace gates: line budget + typecheck + lint (0 warnings) + test/coverage
	@$(call gate,_gui-verify,gui:verify)

_gui-verify: _gui-budget
	@echo "== gui (typecheck + lint + coverage) =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm -r typecheck; \
		pnpm lint; \
		pnpm -r test $(if $(JOBS),-- $(VITEST_JOBS))'

gui\:lint: ## gui/ typecheck + lint only
	@$(call gate,_gui-lint,gui:lint)

_gui-lint:
	@echo "== gui lint =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm -r typecheck; \
		pnpm lint'

# F=<pattern> narrows the run to test files whose path matches, for the
# edit-run-edit loop (`make gui:test F=documentMetaModel`). It deliberately
# drops --coverage: one file cannot meet a 100% workspace threshold, so a
# scoped run that kept it would always fail and teach you to ignore the gate.
# `--passWithNoTests` is what lets it sweep every workspace package when only
# one of them holds a match. The plain form (no F) is the real gate and is what
# `make verify` runs; a narrowed run proves nothing about the others, so finish
# with `make gui:test` before saying tests pass.
gui\:test: ## gui/ vitest only, no budget/typecheck/lint (F=<pattern> narrows, no coverage)
	@$(call gate,_gui-test,gui:test)

_gui-test:
	@echo "== gui test$(if $(F), (F=$(F))) =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		$(if $(F),pnpm -r exec vitest run --passWithNoTests "$(F)",pnpm -r test $(if $(JOBS),-- $(VITEST_JOBS)))'

gui\:budget: ## gui/ per-file executable-line budget (scripts/check-gui-line-budget.sh)
	@$(call gate,_gui-budget,gui:budget)

_gui-budget:
	@echo "== gui line budget =="
	@scripts/check-gui-line-budget.sh

gui\:format: ## Apply Biome formatting/lint fixes across gui/ (writes files)
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm format'

gui\:normalize-examples: ## Rewrite examples/*/*/templates.yml at the Designer's canonical CST fixed point (writes files)
	@echo "== normalize examples =="
	@$(PNPM_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm --filter @shojiku/designer-core normalize:examples'

gui\:e2e: ## Designer-app browser golden path (Playwright in Docker) — on-demand, not in verify
	@$(call gate,_gui-e2e,gui:e2e)

_gui-e2e:
	@echo "== designer-app e2e (browser golden path) =="
	@sh gui/designer-app/e2e/run-e2e.sh

gui\:shot: ## Screenshot the running `make gui:dev` into .shots/ — LOOK at a chrome change
	@echo "== designer screenshots (Playwright in Docker, against gui-dev) =="
	@sh gui/designer-app/e2e/run-shot.sh

# The self-contained Designer-app image (wasm + Vite build + assembled data +
# nginx) — the same image the gui-e2e golden path tests.
GUI_APP_IMAGE := shojiku-designer-app:$(WORK_TAG)
GUI_SERVE_PORT ?= 8788
GUI_DEV_PORT   ?= 5173

gui\:serve: ## Build the Designer-app image and serve it (http://localhost:8788, Ctrl-C stops)
	@echo "== designer-app image (wasm + build + assemble + nginx) =="
	docker build --build-arg PNPM_VERSION=$(PNPM_VERSION) -f gui/designer-app/Dockerfile -t $(GUI_APP_IMAGE) .
	@echo "serving the Designer at http://localhost:$(GUI_SERVE_PORT)/ — Ctrl-C to stop"
	docker run --rm -p $(GUI_SERVE_PORT):80 $(GUI_APP_IMAGE)

gui\:dev: ## Vite dev server (HMR) in Docker for gui/ work (http://localhost:5173, Ctrl-C stops)
	@echo "== designer-app dev server (Vite, HMR) =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	docker run --rm -it -p $(GUI_DEV_PORT):5173 \
		-v "$(CURDIR):/repo" -w /repo/gui \
		-v "$(PNPM_VOLUME):/pnpm-store" \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		$(NODE_IMAGE) sh -euc 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm --filter @shojiku/designer-app assemble; \
		pnpm --filter @shojiku/designer-app dev'
