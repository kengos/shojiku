# .claude/hooks/ — the tracked Claude Code hooks, and the gate over them.
#
# The hooks are the deterministic half of the development rules: rules that
# were carried as prose in the skills, broken anyway by sessions that had them
# in front of them, and moved into a control that decides instead of reminding.
# They are tracked because settings are read from the WORKING DIRECTORY, and
# every cycle works in a git worktree — an untracked hook is a hook that never
# fires where the work happens.
#
# Every target defined here is named `hooks:<job>` (public) or `_hooks-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.

.PHONY: hooks\:verify _hooks-verify

hooks\:verify: ## Fail if a hook stopped deciding, or stopped letting the legitimate spelling through (no Docker)
	@$(call gate,_hooks-verify,hooks:verify)

_hooks-verify:
	@echo "== hooks self-test =="
	@./scripts/check-hooks.sh
