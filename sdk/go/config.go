package shojiku

import "sync"

// Process-wide defaults for every [Client] built after they are set.
//
// The ecosystem idiom applied once during bootstrap, OVER the frozen
// constructor, never as a third precedence layer: what [Configure] sets
// stands exactly where an explicit client option stands against the
// environment. So the order is
//
//	explicit option > Configure() > SHOJIKU_*
//
// for the template root and the pack directories, and the deliberate reverse
// for the engine binary — SHOJIKU_BIN still wins over both, because where the
// engine lives is a deployment decision that has to be able to win over
// application code.
//
// WithStrict is the one exception, and the only place Configure beats a call
// site. Every SDK mirrors that asymmetry.
//
// No memoized default client ships. A package-level singleton would add a
// reset-on-reconfigure lifecycle that seven languages would each get subtly
// wrong; building a client is cheap, and an application that wants one keeps
// it itself.
var (
	globalMu     sync.Mutex
	globalConfig config
)

// Configure sets the process-wide defaults.
//
//	shojiku.Configure(shojiku.WithTemplates("app/templates"), shojiku.WithLang("ja-JP"))
//
// Safe to call from any goroutine, though an application that calls it
// anywhere but bootstrap is racing its own clients on purpose.
func Configure(opts ...Option) {
	globalMu.Lock()
	defer globalMu.Unlock()
	globalConfig = globalConfig.merge(opts)
}

// ResetConfiguration drops every configured default.
//
// Exported because a global that cannot be reset makes every test suite
// invent its own teardown — and get it wrong. Applications call it at most
// once, if at all.
func ResetConfiguration() {
	globalMu.Lock()
	defer globalMu.Unlock()
	globalConfig = config{}
}

func globalDefaults() config {
	globalMu.Lock()
	defer globalMu.Unlock()
	return globalConfig
}
