# Rule 1 case: a gui target living in engine.mk.
gui\:strayfile: ## a target filed under the wrong scope
	@true

_engine-ok:
	@true

# Rule 5, from a scope file and past a trailing comment: only the declared-only
# name counts — not the comment's words, not a variable-built name, and not
# _engine-ok, which is defined above.
.PHONY: _engine-ok $(ENGINE_EXTRA) engine\:alsodeclaredonly # not engine:commentword
