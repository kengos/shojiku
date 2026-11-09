# Secrets — gitleaks with `.gitleaks.toml`: the commit hook's setup, and a scan
# of the whole git history.
#
# The git pre-commit hook `.githooks/pre-commit` scans the staged content of
# each commit, in every clone where `make secrets:install` has installed it.
# `secrets:scan` scans every commit already made, including commits made in a
# clone without the hook and commits that git records without running the hook
# (cherry-pick, rebase, revert, am, `--no-verify`). No CI job runs it; run it by
# hand. gitleaks runs in a container with no network and the scanned directory
# mounted read-only.
#
# Every target defined here is named `secrets:<job>` (public) or
# `_secrets-<job>` (private, carrying the recipe). `make make:check` enforces
# exactly that.

.PHONY: secrets\:install _secrets-install secrets\:scan _secrets-scan

# The gitleaks image is pinned only in `.githooks/pre-commit`, because git runs
# the installed copy of that hook without this Makefile. GITLEAKS_IMAGE reads
# that pin from the file as committed in HEAD, or in origin/main when HEAD has
# no such file (the version `secrets:install` installs), or else from the
# working tree, so the hook, `secrets:install` and `secrets:scan` run the same
# gitleaks image. Dependabot updates neither
# `.githooks/pre-commit` nor this Makefile: to bump, change the tag and the
# digest together (`docker buildx imagetools inspect
# zricethezav/gitleaks:<vX.Y.Z>`, the top-level `Digest:`), commit, and run
# `make secrets:install`.
GITLEAKS_IMAGE = $(shell { git show HEAD:.githooks/pre-commit 2>/dev/null || git show origin/main:.githooks/pre-commit 2>/dev/null || cat .githooks/pre-commit 2>/dev/null; } | sed -n "s/^IMAGE='\(.*\)'$$/\1/p")

# The history is in the git COMMON directory: in a worktree, `.git` is a file
# that points into the main checkout's git directory. Only that directory is
# mounted, at a fixed container path, so the scan is the same from any
# worktree. (A container path equal to the host path, `-v $(CURDIR):$(CURDIR)`,
# was tried first: Docker Desktop on macOS served it as an empty directory on
# some runs.)
HISTORY_GIT_DIR = $(shell git rev-parse --path-format=absolute --git-common-dir)

secrets\:install: ## Install the gitleaks commit hooks from HEAD (or origin/main) into this clone's shared hooks directory and pull the pinned image
	@$(call gate,_secrets-install,secrets:install)

# The hooks are installed as committed in HEAD, or in origin/main when HEAD
# has no `.githooks/` (a checkout that has fetched but not yet merged the
# commit adding them); `.claude/hooks/guard-bash.sh` compares the installed
# copies with the same two versions. An uncommitted edit of `.githooks/` is
# not installed. The shared hooks directory (`git rev-parse
# --git-common-dir`/hooks) is used by every worktree
# of the clone and by every branch, a branch that predates `.githooks/`
# included. Run this again after a commit that changes `.githooks/`.
_secrets-install:
	@echo "== install the commit hooks from HEAD (or origin/main) =="
	@test -n "$(GITLEAKS_IMAGE)" || { echo "no IMAGE= line in .githooks/pre-commit"; exit 1; }
	@d=$$(mktemp -d "$$(git rev-parse --absolute-git-dir)/hooks-install.XXXXXX") && \
	trap 'rm -rf "$$d"' EXIT && \
	ref=HEAD && { git cat-file -e HEAD:.githooks/pre-commit 2>/dev/null || ref=origin/main; } && \
	git show "$$ref:.githooks/pre-commit" > "$$d/pre-commit" && \
	git show "$$ref:.githooks/pre-merge-commit" > "$$d/pre-merge-commit" && \
	./scripts/install-commit-hooks.sh "$$d" .
	@echo "== docker pull the pinned gitleaks image =="
	docker pull -q $(GITLEAKS_IMAGE)

secrets\:scan: ## gitleaks over the whole history (Docker, no network; no CI job runs it), after checking generated secrets are still reported
	@$(call gate,_secrets-scan,secrets:scan)

# The first step checks that the allowlists in .gitleaks.toml do not hide a
# real credential. It writes one generated value for each of four rules into
# generated.txt: generic-api-key, the rule the allowlists apply to, and
# github-pat, aws-access-token and private-key, which no allowlist applies to.
# Beside it, allowed.txt holds one example of each allowlisted shape. gitleaks
# must report each of the four rules exactly once in generated.txt, and nothing
# in allowed.txt.
#
# The temporary directory is created inside the git directory, as the commit
# hook's is, because a Docker VM such as Colima shares only $HOME with the
# host. The generated api_key alternates letters and digits: gitleaks's
# generic-api-key rule ignores a value made only of letters, or one that
# contains a common English word, and a fully random value could be either.
#
# gitleaks's `git` mode exits 0 having scanned nothing when `git log` fails
# inside the container (an empty mount, for example), so the history step
# fails unless gitleaks reports at least one scanned commit and no ERR line.
#
# The history step passes `.gitleaksignore`, the fingerprints of findings in
# commits made before the hook existed; a fingerprint names one commit, file
# and line, so it never covers a later commit. Both the history scan and the
# commit hook pass `--ignore-gitleaks-allow`, so gitleaks's inline marker
# `gitleaks:allow` hides no value.
_secrets-scan:
	@echo "== gitleaks: generated secrets are still reported =="
	@test -n "$(GITLEAKS_IMAGE)" || { echo "no IMAGE= line in .githooks/pre-commit"; exit 1; }
	@d=$$(mktemp -d "$$(git rev-parse --absolute-git-dir)/gitleaks-selftest.XXXXXX") && \
	trap 'rm -rf "$$d"' EXIT && mkdir "$$d/scan" && \
	rnd() { head -c 4096 /dev/urandom | LC_ALL=C tr -dc "$$1" | head -c "$$2"; } && \
	{ printf 'token = "ghp_%s"\n' "$$(rnd A-Za-z0-9 36)"; \
	  printf 'aws_access_key_id = AKIA%s\n' "$$(rnd A-Z2-7 16)"; \
	  printf 'api_key = "%s"\n' "$$(i=0; while [ $$i -lt 16 ]; do rnd A-Za-z 1; rnd 0-9 1; i=$$((i + 1)); done)"; \
	  printf -- '-----BEGIN %s KEY-----\n%s\n%s\n-----END %s KEY-----\n' \
		PRIVATE "$$(rnd A-Za-z0-9+/ 64)" "$$(rnd A-Za-z0-9+/ 64)" PRIVATE; \
	} > "$$d/scan/generated.txt" && \
	printf 'signer(key: "rsa2048.enc.pem")\ndocKey="invoices/monthly"\n' > "$$d/scan/allowed.txt" && \
	docker run --rm --network none -v "$$d/scan:/scan:ro" -v "$(CURDIR)/.gitleaks.toml:/gitleaks.toml:ro" \
		$(GITLEAKS_IMAGE) dir /scan --config /gitleaks.toml --redact --no-banner --no-color \
		--report-format json --report-path - > "$$d/report.json" 2> "$$d/gitleaks.log"; \
	got=$$(jq -r '[.[] | "\(.File | ltrimstr("/scan/")) \(.RuleID)"] | sort | if length == 0 then "nothing" else join(", ") end' "$$d/report.json" 2>/dev/null); \
	want='generated.txt aws-access-token, generated.txt generic-api-key, generated.txt github-pat, generated.txt private-key'; \
	if [ "$$got" = "$$want" ]; then echo "reported: $$got"; \
	else cat "$$d/gitleaks.log"; echo "reported: $${got:-<no JSON report>}"; echo "expected: $$want"; exit 1; fi
	@echo "== gitleaks: history =="
	@d=$$(mktemp -d "$$(git rev-parse --absolute-git-dir)/gitleaks-history.XXXXXX") && \
	trap 'rm -rf "$$d"' EXIT && \
	{ docker run --rm --network none \
		-v "$(HISTORY_GIT_DIR):/repo.git:ro" -v "$(CURDIR)/.gitleaks.toml:/gitleaks.toml:ro" \
		-v "$(CURDIR)/.gitleaksignore:/gitleaksignore:ro" \
		$(GITLEAKS_IMAGE) git /repo.git --config /gitleaks.toml --gitleaks-ignore-path /gitleaksignore \
		--max-archive-depth=8 --ignore-gitleaks-allow \
		--redact --verbose --no-banner --no-color 2> "$$d/history.log"; rc=$$?; } ; \
	cat "$$d/history.log"; \
	if grep -q ' ERR ' "$$d/history.log"; then echo "gitleaks could not read the history (an ERR line above)"; exit 1; fi; \
	if ! grep -Eq ' [1-9][0-9]* commits scanned' "$$d/history.log"; then echo "gitleaks scanned no commit"; exit 1; fi; \
	exit $$rc
