# site/ — the homepage (VitePress + the live wasm renderer)
#
# Every target defined here is named `site:<job>` (public) or `_site-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

site\:lock: ## Re-resolve site/pnpm-lock.yaml after a package.json change
	@echo "== site:lock =="
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --lockfile-only'

site\:update: ## Bump site/ deps within their package.json ranges
	@echo "== site:update =="
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm update -r'

## ---- site (the homepage — site/, VitePress + the live wasm renderer) ----

# Run a pnpm/node command over site/ in the pinned Node image (the gui macro's
# sibling; site/ is a standalone pnpm project, not a gui workspace member).
SITE_IN_DOCKER = $(GATE_LOCK) docker run --rm \
	-v "$(CURDIR):/repo" -w /repo/site \
	-v "$(PNPM_VOLUME):/pnpm-store" \
	-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	$(NODE_IMAGE) sh -euc

# The scope's whole bar: the gates plus the committed-data drift check. The
# gates run typecheck and tests in ONE container, which is why they are a
# private aggregate rather than site:lint + site:test back to back.
site\:verify: ## Verify site/ — typecheck + tests (incl. real-wasm) + committed-data check
	@$(call gate,_site-verify,site:verify)

_site-verify: _site-gates _site-check

_site-gates:
	@echo "== site (typecheck + tests) =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm typecheck; \
		pnpm test'

site\:lint: ## site/ typecheck only
	@$(call gate,_site-lint,site:lint)

_site-lint:
	@echo "== site typecheck =="
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm typecheck'

site\:test: ## site/ vitest only
	@$(call gate,_site-test,site:test)

_site-test:
	@echo "== site tests =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	@$(SITE_IN_DOCKER) 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		pnpm test'

# site-data/site-check skip the pnpm install for speed, so in a fresh worktree
# they would die inside Node with a bare ERR_MODULE_NOT_FOUND naming no
# remedy. Name it here instead.
_site-node-modules:
	@test -d site/node_modules || { \
		echo "site/node_modules missing — run 'make site:verify' once in this tree (it installs first; site:data/site:check skip the install for speed)" >&2; \
		exit 1; \
	}

site\:data: _site-node-modules ## Refresh the committed README gallery section from examples/gallery.yml
	@echo "== site data refresh =="
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts'

# No wasm build: site/.data/wasm is pinned by the sha256 digests recorded in
# site/.data/wasm-source.json, so this says the same thing on every host
# architecture. Rebuilding to compare is what made the homepage track HEAD.
site\:check: ## Fail if the committed site inputs drift (README gallery + the site engine pin)
	@$(call gate,_site-check,site:check)

_site-check: _site-node-modules
	@echo "== site data check =="
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts --check'

site\:wasm-release: ## RELEASE ONLY: re-pin site/.data/wasm to the released engine (engine/wasm/pkg)
	@echo "== site engine re-pin =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	@$(SITE_IN_DOCKER) 'node scripts/refresh-data.ts --release-wasm'

# The Pages build STAGES site/.data/wasm (a RELEASED engine build) into
# engine/wasm/pkg (build-pages.sh needs it there for the designer-app
# assemble), which is also what the site's own tests load as "a fresh build of
# HEAD". This recipe therefore backs pkg up first and restores it after —
# pass, fail, or a leftover from an interrupted earlier run (a surviving
# backup is always the pre-swap truth, so it is restored before a new backup
# is taken). If no pkg existed before, the staged copy is REMOVED so the next
# gate's `test -d` rebuilds HEAD instead of silently testing the released
# engine. Running `bash scripts/build-pages.sh` directly (not via make) still
# leaves the swap in place — that path is the Pages deploy's, which runs on a
# fresh checkout and never runs a later gate.
site\:build: ## The full Pages build locally (site + /designer/) into site/.vitepress/dist
	@$(call gate,_site-build,site:build)

_site-build:
	@echo "== site build (Pages mirror) =="
	@if [ -d engine/wasm/.pkg-pre-site-build ]; then \
		echo "== restoring engine/wasm/pkg from an interrupted site-build =="; \
		rm -rf engine/wasm/pkg; \
		mv engine/wasm/.pkg-pre-site-build engine/wasm/pkg; \
	fi
	@if [ -d engine/wasm/pkg ]; then cp -R engine/wasm/pkg engine/wasm/.pkg-pre-site-build; fi
	@$(SITE_IN_DOCKER) 'bash scripts/build-pages.sh'; rc=$$?; \
	rm -rf engine/wasm/pkg; \
	if [ -d engine/wasm/.pkg-pre-site-build ]; then \
		mv engine/wasm/.pkg-pre-site-build engine/wasm/pkg; \
		echo "== engine/wasm/pkg restored (the build staged the RELEASED engine there) =="; \
	fi; \
	exit $$rc

site\:dev: ## VitePress dev server in Docker (http://localhost:5174, Ctrl-C stops)
	@echo "== site dev server =="
	@test -d engine/wasm/pkg || $(MAKE) _engine-wasm
	docker run --rm -it -p 5174:5174 \
		-v "$(CURDIR):/repo" -w /repo/site \
		-v "$(PNPM_VOLUME):/pnpm-store" \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		$(NODE_IMAGE) sh -euc 'npm install -g pnpm@$(PNPM_VERSION) >/dev/null 2>&1; \
		pnpm config set store-dir /pnpm-store; \
		pnpm install --frozen-lockfile; \
		node scripts/assemble-data.ts; \
		pnpm exec vitepress dev --host --port 5174'
