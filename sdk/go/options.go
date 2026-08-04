package shojiku

// config is what a client was configured with, before anything is resolved.
//
// Pointer and nil-able fields throughout, because "not given" has to be
// distinguishable from "given as the zero value": a client that explicitly
// asked for no font directories is making a different statement from one that
// never mentioned them, and only the second inherits.
type config struct {
	templates  *string
	fontDirs   []string
	localeDirs []string
	lang       *string
	binary     *string
	logger     Logger
	strict     bool
	providers  map[string]Provider
	env        *bool
}

// Option configures a [Client], or the process-wide defaults via [Configure].
//
// Functional options are Go's answer to what Ruby spells as keywords, PHP as
// an options array and Java as a builder. The reason PHP reached for an array
// applies here with a stronger result: a misspelled setting is a COMPILE
// error in Go, not a runtime one.
type Option func(*config)

// WithTemplates sets the directory template names resolve against.
//
// The layout is <root>/<name>/templates.yml plus an optional definitions.yml
// and assets/ — the same shape as the repository's own examples/*/, so an
// example directory IS a template-root entry.
func WithTemplates(root string) Option {
	return func(c *config) { c.templates = &root }
}

// WithFontDirs sets the font pack search directories, replacing whatever
// SHOJIKU_FONT_DIR would have supplied.
func WithFontDirs(dirs ...string) Option {
	return func(c *config) { c.fontDirs = nonNil(dirs) }
}

// WithLocaleDirs sets the locale pack search directories, replacing whatever
// SHOJIKU_LOCALE_DIR would have supplied.
func WithLocaleDirs(dirs ...string) Option {
	return func(c *config) { c.localeDirs = nonNil(dirs) }
}

// WithLang sets this client's locale. A per-call [Lang] beats it; what the
// seven SDKs mirror is that precedence, not the spelling.
func WithLang(tag string) Option {
	return func(c *config) { c.lang = &tag }
}

// WithBinary names the engine binary to run.
//
// SHOJIKU_BIN still beats this, deliberately: where the engine lives is a
// deployment decision that has to be able to win over application code. That
// is the reverse of how [WithTemplates] resolves, and for the mirror-image
// reason.
func WithBinary(path string) Option {
	return func(c *config) { c.binary = &path }
}

// WithLogger attaches a log channel. Silent by default; see [Logger] for what
// does and does not cross it.
func WithLogger(logger Logger) Option {
	return func(c *config) { c.logger = logger }
}

// WithStrict declares the input lockdown: no bytes-first entrance, nothing
// signed that this client did not render, and signing material only by
// registered name.
//
// This is the ONE setting where [Configure] beats a call site. Strictness is
// a restriction rather than a default, so an operator who declared a lockdown
// must not have it lifted by application code — the values are OR-ed, never
// overridden.
func WithStrict(strict bool) Option {
	return func(c *config) { c.strict = c.strict || strict }
}

// WithProviders registers signing providers by name.
//
// It REPLACES rather than merges: a client that declares its own registry is
// stating the whole set it may sign with, and quietly adding globally
// registered keys to that set would defeat the point.
func WithProviders(providers map[string]Provider) Option {
	return func(c *config) {
		registry := make(map[string]Provider, len(providers))
		for name, provider := range providers {
			registry[name] = provider
		}
		c.providers = registry
	}
}

// WithEnv turns every SHOJIKU_* lookup on or off — the template root, the
// pack directories and the binary path together.
//
// One flag rather than one per variable: an application that wants a hermetic
// configuration wants all of it off. Turning it off also STRIPS those
// variables from the engine child's environment, because the engine reads
// them itself and leaving them there would only move the lookup one process
// away.
func WithEnv(enabled bool) Option {
	return func(c *config) { c.env = &enabled }
}

// merge applies opts on top of this configuration and returns the result.
//
// An unset option leaves the inherited value alone, so an explicit client
// argument beats a configured default and an absent one inherits it. strict
// is the documented exception, and providers replace rather than merge.
func (c config) merge(opts []Option) config {
	merged := c
	for _, opt := range opts {
		opt(&merged)
	}
	return merged
}

// nonNil turns a variadic call with no arguments into an empty-but-present
// slice, so "configured as none" stays distinguishable from "never
// configured".
func nonNil(dirs []string) []string {
	if dirs == nil {
		return []string{}
	}
	return dirs
}

// CallOption is a per-call override.
//
// Separate from [Option] because the sets are not interchangeable: a locale
// is a per-call decision, a template root is not. Go's params are an ordinary
// argument (unlike Ruby's trailing hash), so the frozen "a per-call value
// beats the client-wide one" rule applies directly here.
type CallOption func(*callOptions)

type callOptions struct{ lang string }

// Lang overrides this client's locale for one call.
func Lang(tag string) CallOption { return func(o *callOptions) { o.lang = tag } }

func resolveCall(opts []CallOption) callOptions {
	var resolved callOptions
	for _, opt := range opts {
		opt(&resolved)
	}
	return resolved
}
