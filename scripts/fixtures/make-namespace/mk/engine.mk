# Rule 1 case: a gui target living in engine.mk.
gui\:strayfile: ## a target filed under the wrong scope
	@true

_engine-ok:
	@true
