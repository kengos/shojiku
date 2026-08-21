# Fixture root. Public targets here exercise rules 2 and 3.
#
# Exclusion case: a comment line carrying a real command AND prose in which
# make is an English verb. The line reaches the detector because of the
# backticks; only what is INSIDE them is a command.
# `make engine:good` is the command here, but GNU make still executes recipe
# lines containing $(MAKE), and the make chain a contributor runs is prose.
gate = $(MAKE) --no-print-directory $(if $(V),$(1),quiet T=$(1) NAME=$(2))

# Rule 2 case: public, scope-less, and not one of the allowed bare names.
strayname: ## a public target with no scope
	@true

# Rule 3 case (a): the gate call names an internal that is not defined anywhere.
engine\:good: ## a correctly wired public target
	@$(call gate,_engine-missing,engine:good)

# Rule 3 case (b): the gate call is wired to a real internal but LABELS itself
# as something else — the refactor's own most likely typo, and a separate
# assertion from (a). Without this case the label comparison can be disabled
# and the self-test stays green.
engine\:mislabel: ## a public target whose gate calls itself by the wrong name
	@$(call gate,_engine-ok,engine:WRONGLABEL)
