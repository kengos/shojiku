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

.PHONY: hooks\:verify _hooks-verify hooks\:codes _hooks-codes

hooks\:verify: ## Fail if a hook stopped deciding, or stopped letting the legitimate spelling through (no Docker)
	@$(call gate,_hooks-verify,hooks:verify)

_hooks-verify:
	@echo "== hooks self-test =="
	@./scripts/check-hooks.sh
	@echo "== work-item codes in the tracked tree =="
	@./scripts/check-work-item-codes.sh

# The same rule as `guard-edit.sh`'s code check, from the other end. The hook
# stops a code being WRITTEN and fires only for an edit made through Claude
# Code; this sweeps what is already there, which is how two dozen of them came
# to sit in the tree with every gate green. Filed here rather than in its own
# scope because it IS the hook's rule — they have to match the same families or
# they are two rules wearing one name.
hooks\:codes: ## Sweep the tracked tree for work-item codes (the hook's rule, from the other end)
	@$(call gate,_hooks-codes,hooks:codes)

_hooks-codes:
	@echo "== work-item codes in the tracked tree =="
	@./scripts/check-work-item-codes.sh
