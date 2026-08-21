# `make investigate:<thing>` — the questions that used to need a prose catalogue.
#
# WHY THIS FILE EXISTS (user rule): a trap you meet through make must be
# solvable through make. Reading a Makefile and then opening a separate
# incident document to find out what its failure MEANT is a detour, and the
# document is the half that goes stale. So: the gate says what broke
# (gate-culprits.sh), why (gate-diagnose.sh), and these targets answer the
# follow-up questions — each one a command, not a paragraph.
#
# It is a separate file rather than more Makefile because none of these are
# gates. Nothing here checks anything: they print state. `make help` picks them
# up through $(MAKEFILE_LIST), so they are listed beside the gates without
# being mistaken for them.

.PHONY: investigate\:tree investigate\:last-error investigate\:docker \
        investigate\:coverage investigate\:render investigate\:gates \
        investigate\:pins

investigate\:tree: ## Which tree do gates run over from HERE? (the drift that goes green)
	@printf 'a gate started from this directory runs over:\n'
	@printf '  path   %s\n  branch %s\n  head   %s\n' \
		"$(CURDIR)" \
		"$$(git -C $(CURDIR) symbolic-ref --quiet --short HEAD 2>/dev/null || echo '(detached)')" \
		"$$(git -C $(CURDIR) log --oneline -1 2>/dev/null || echo '(no commits)')"
	@printf '\nuncommitted here:\n'
	@if [ -n "$$(git -C $(CURDIR) status --porcelain 2>/dev/null)" ]; then \
		git -C $(CURDIR) status --short | sed 's/^/  /' | head -20; \
	else echo "  (clean)"; fi
	@printf '\nevery checkout of this repository:\n'
	@git -C $(CURDIR) worktree list | sed 's/^/  /'
	@primary=$$(git -C $(CURDIR) worktree list --porcelain | awk '/^worktree /{print $$2; exit}'); \
	count=$$(git -C $(CURDIR) worktree list | wc -l | tr -d ' '); \
	if [ "$$primary" = "$(CURDIR)" ] && [ "$$count" -gt 1 ]; then \
		printf '\nNOTE: you are in the PRIMARY checkout and %s other tree(s) exist.\n' "$$(($$count - 1))"; \
		printf '      A gate run from here reports on THIS tree. If you meant a worktree,\n'; \
		printf '      name it: make -C /abs/path/to/worktree <target>\n'; \
	fi

investigate\:last-error: ## Re-read the last failure — target, tree, diagnosis, where it broke
	@if [ ! -f "$(ERROR_LOG)" ]; then \
		printf 'no %s — nothing has failed since the last time that target passed.\n' "$(ERROR_LOG)"; \
	else \
		sed -n '1,/^$$/p' "$(ERROR_LOG)"; \
		printf -- '--- full failure log: %s ---\n' "$(ERROR_LOG)"; \
	fi

investigate\:docker: ## Daemon healthy AND able to pull? (a daemon that answers can still pull nothing)
	@printf 'daemon:\n'
	@docker version --format '  client {{.Client.Version}}  server {{.Server.Version}}' 2>&1 | head -2 \
		|| printf '  NOT ANSWERING — start Docker Desktop\n'
	@printf '\nregistries, from the HOST (this is not the daemon):\n'
	@printf '  docker hub  %s\n' "$$(curl -s -o /dev/null -w '%{http_code} in %{time_total}s' https://registry-1.docker.io/v2/ || echo unreachable)"
	@printf '  mcr         %s\n' "$$(curl -s -o /dev/null -w '%{http_code} in %{time_total}s' https://mcr.microsoft.com/v2/ || echo unreachable)"
	@printf '\nthe question the checks above cannot answer — can the DAEMON pull?\n'
	@docker rmi hello-world >/dev/null 2>&1 || true
	@docker pull hello-world >/dev/null 2>&1 & \
	pid=$$!; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		kill -0 $$pid 2>/dev/null || break; sleep 1; \
	done; \
	if kill -0 $$pid 2>/dev/null; then \
		kill $$pid 2>/dev/null; \
		printf '  STALLED — over 20s for a 13 kB image.\n'; \
		printf '  That is a Docker Desktop VM networking fault, not a slow registry:\n'; \
		printf '  restart or update Docker Desktop. Nothing in this repo will fix it.\n'; \
	else \
		printf '  ok — a real pull completed.\n'; \
	fi

investigate\:gates: ## Is another gate running in this tree, and who holds the lock?
	@lock="$(CURDIR)/.make-logs/gates"; \
	if [ -d "$$lock" ] && [ -n "$$(ls -A "$$lock" 2>/dev/null)" ]; then \
		printf 'lock held in this tree:\n'; \
		for d in "$$lock"/*.running; do \
			[ -d "$$d" ] || continue; \
			printf '  %s\n' "$$(basename "$$d")"; \
			[ -f "$$d/owner" ] && sed 's/^/    /' "$$d/owner"; \
		done; \
		printf '\nIf nothing is really running, the holder died mid-gate:\n'; \
		printf '  rm -rf %s/*.running\n' "$$lock"; \
	else \
		printf 'no gate lock held in this tree.\n'; \
	fi
	@printf '\nmake processes on this machine:\n'
	@pgrep -fl 'g?make' 2>/dev/null | grep -v pgrep | sed 's/^/  /' || printf '  (none)\n'
	@printf '\ngate containers running against a checkout of this repo:\n'
	@docker ps --format '{{.ID}}\t{{.Image}}\t{{.Status}}' 2>/dev/null \
		| grep -E 'shojiku|rust|node' | sed 's/^/  /' | head -10 \
		|| printf '  (none, or the daemon is not answering)\n'
	@printf '\nTo CANCEL a gate: Ctrl-C is not enough from an agent harness — `kill -INT`\n'
	@printf 'on the top-level make never reaches the `docker run` under the recipe, so\n'
	@printf 'the container keeps compiling and the lock stays held while ps says the\n'
	@printf 'make is alive. Kill the CONTAINER first, then the make chain:\n'
	@printf '  docker kill <id from above>\n'
	@printf '  pkill -f "make.*$(notdir $(CURDIR))"      # or kill the pid listed above\n'
	@printf '  rm -rf %s/.make-logs/gates/*.running       # only if the lock outlived it\n' "$(CURDIR)"

investigate\:pins: ## Are the cached images the pinned versions, or something that moved?
	@printf 'pinned by this Makefile, and what is cached for that tag:\n'
	@for img in $(RUST_IMAGE) $(NODE_IMAGE); do \
		digest=$$(docker inspect "$$img" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}(built locally, no digest){{end}}' 2>/dev/null); \
		if [ -n "$$digest" ]; then printf '  %-42s %s\n' "$$img" "$$digest"; \
		else printf '  %-42s NOT CACHED — the next gate pulls it\n' "$$img"; fi; \
	done
	@printf '\nA tag that MOVED upstream still matches the name and not the bytes.\n'
	@printf 'The registry answers in one second, and a stalled `docker pull` never\n'
	@printf 'had to be part of the question:\n'
	@printf '  curl -s https://hub.docker.com/v2/repositories/<repo>/tags/<tag> | \\\n'
	@printf '    python3 -c "import sys,json; print(json.load(sys.stdin)[\x27digest\x27])"\n'
