package shojiku

// settings is one client's resolved configuration, plus the collaborators
// built from it.
//
// [Configure] answers "what was configured"; this answers "what does THIS
// client use", which is the merge of the process-wide defaults with the
// options the client was built with. Keeping it out of [Client] keeps the
// precedence rules in one readable place instead of spread across a
// constructor.
type settings struct {
	config   config
	env      *env
	log      *logSink
	lockdown *lockdown
	engine   *engine
	root     *templateRoot
}

// newSettings resolves one client's configuration and opens its engine.
//
// The engine is found HERE rather than lazily, which is the reference's
// lifecycle and not an implementation detail: a client cannot exist over an
// engine that is not installed, so a container that builds one at boot learns
// that at boot rather than at the first request. What IS lazy is the
// capability probe — locating a binary is a stat, asking it what it can do is
// a whole process.
func newSettings(opts []Option) (*settings, error) {
	resolved := globalDefaults().merge(opts)

	environment := &env{enabled: resolved.env == nil || *resolved.env}
	log := &logSink{logger: resolved.logger}
	bin, err := newBinary(deref(resolved.binary), environment)
	if err != nil {
		return nil, err
	}

	s := &settings{
		config:   resolved,
		env:      environment,
		log:      log,
		lockdown: &lockdown{strict: resolved.strict, providers: resolved.providers},
		engine:   newEngine(bin, environment, log),
	}
	if root := firstNonEmpty(deref(resolved.templates), environment.get("SHOJIKU_TEMPLATE_ROOT")); root != "" {
		s.root = &templateRoot{path: root}
	}
	return s, nil
}

// lang is the client-wide locale. A per-call [Lang] beats it; what the seven
// mirror is that precedence, not the spelling.
func (s *settings) lang() string { return deref(s.config.lang) }

// fontDirs and localeDirs fall back to the environment only when nothing
// configured them — an explicitly empty list is a configuration, not a gap.
func (s *settings) fontDirs() []string {
	if s.config.fontDirs != nil {
		return s.config.fontDirs
	}
	return s.env.paths("SHOJIKU_FONT_DIR")
}

func (s *settings) localeDirs() []string {
	if s.config.localeDirs != nil {
		return s.config.localeDirs
	}
	return s.env.paths("SHOJIKU_LOCALE_DIR")
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
