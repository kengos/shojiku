# skills/ and .claude/skills/ — the eval suite over this repository's skills.
#
# A skill is a page of rules, and nothing here could previously say whether one
# still WORKS: a grep proves the sentence is present, and presence is not the
# question. The question is whether a fresh session that loads the skill makes
# the decision the rule exists to force — which was answered by hand, one cycle
# at a time, by a zero-context relay reviewer.
#
# The two targets below are deliberately NOT the same job, because a GATE
# CANNOT CALL A MODEL. CI holds no Claude credentials, a model call is neither
# free nor deterministic, and `claude plugin eval` — whose case format and key
# names this suite uses — is early-access and refuses to run today.
#
#   skills:verify   offline, deterministic, free. Parses every case, validates
#                   it against the schema `plugin eval` itself enforces, checks
#                   every grader, and checks the cases COVER the skill set.
#                   This is the gate, and it runs in CI.
#
#   skills:eval     puts each case to a real agent and scores the transcript.
#                   Costs money, calls a model, is not deterministic. NOT a
#                   gate, NOT in CI — run it when you change a skill.
#
# `skills:verify` is what stops the suite rotting into unrunnable YAML.
# `skills:eval` is what answers the question the suite exists for. Neither can
# do the other's job.
#
# Every target defined here is named `skills:<job>` (public) or `_skills-<job>`
# (private, carrying the recipe). `make make:check` enforces exactly that.
#
# The subject is TWO skill sets, and only one of them is tracked:
#   skills/          the five product skills, shipped via `npx skills add` —
#                    tracked, so their cases are tracked and CI gates them.
#   .claude/skills/  the nineteen development skills — gitignored, so their
#                    cases live outside the checkout in ~/shojiku-work/, and
#                    `skills:eval-dev` is how you reach them.

SKILL_EVAL      = ./scripts/skill-eval.py
DEV_SKILL_CASES ?= $(HOME)/shojiku-work/skill-evals
# The dev skills are GITIGNORED, so a worktree does not have them: point this at
# the primary checkout when running eval-dev from anywhere but there.
DEV_SKILLS      ?= .claude/skills

.PHONY: skills\:verify _skills-verify skills\:eval skills\:verify-dev skills\:eval-dev

skills\:verify: ## Fail if an eval case is malformed, or a product skill has neither a case nor a reason (no Docker)
	@$(call gate,_skills-verify,skills:verify)

_skills-verify:
	@echo "== skill-eval self-test + product skill cases =="
	@$(SKILL_EVAL) check --cases skills/evals --skills skills --require-coverage

# Not a gate: it calls a model, so it is never wired into `verify` or CI.
skills\:eval: ## Run the product-skill eval cases against a real agent and score them (costs money)
	@$(SKILL_EVAL) run --cases skills/evals --skills skills $(if $(CASE),--case '$(CASE)') $(if $(MODEL),--model $(MODEL)) $(if $(JUDGE),--judge-model $(JUDGE)) $(if $(ABLATION),--ablation)

# Coverage is REPORTED for the dev set rather than required — that tree is
# nineteen skills and exploratory, where skills/ is five and shipped. Reporting
# it needs a target, which is what verify-dev is: the same `check`, without
# --require-coverage, so it prints the uncovered skills instead of failing on
# them. Saying "reported" without this target left the claim describing nothing.
skills\:verify-dev: ## Validate the DEV skills' cases and report which skills have none (no Docker)
	@$(SKILL_EVAL) check --cases '$(DEV_SKILL_CASES)' --skills '$(DEV_SKILLS)'

skills\:eval-dev: ## Same as skills:eval, for the gitignored development skills (cases in DEV_SKILL_CASES, default ~/shojiku-work/skill-evals)
	@$(SKILL_EVAL) run --cases '$(DEV_SKILL_CASES)' --skills '$(DEV_SKILLS)' $(if $(CASE),--case '$(CASE)') $(if $(MODEL),--model $(MODEL)) $(if $(JUDGE),--judge-model $(JUDGE)) $(if $(ABLATION),--ablation)
