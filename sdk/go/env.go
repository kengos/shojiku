package shojiku

import (
	"os"
	"strings"
)

// envPrefix is every variable name the engine family uses, on either side.
const envPrefix = "SHOJIKU_"

// env is the one place this package reads the environment.
//
// A client is built with lookups on (the default) or off ([WithEnv]), and
// that single flag governs EVERY SHOJIKU_* lookup — the template root, the
// font and locale directories, and the binary path. One flag rather than one
// per variable is the reference decision the other six SDKs mirror: an
// application that wants a hermetic configuration wants all of it off, and a
// per-variable set of knobs is a shape nobody can keep consistent across
// seven languages. Disabled lookups behave exactly as unset variables do, so
// calling code has no second branch to get wrong.
//
// A subprocess SDK owes that flag one thing the in-process ones do not. The
// engine here is a CHILD PROCESS that reads SHOJIKU_FONT_DIR and
// SHOJIKU_LOCALE_DIR itself, so a client that stopped reading them and still
// let the child inherit them would not be hermetic — it would only have moved
// the lookup one process away. childEnvironment is what closes that.
type env struct {
	enabled bool
	// source is the environment to read, or nil for the process's own. It is
	// injectable because "the environment wins" is exactly the claim that
	// cannot be proven from inside a process that cannot set its own.
	source []string
}

// get is the variable's value, or "" when it is unset, blank, or lookups are
// off.
func (e *env) get(name string) string {
	if !e.enabled {
		return ""
	}
	return e.unguarded(name)
}

// unguarded reads a variable that is NOT this engine's configuration,
// whatever the flag says.
//
// PATH is the operating system's, not Shojiku's: turning lookups off declares
// that the application configures the engine itself, which is a different
// statement from "this process may not find programs the way every process
// finds programs". Gating it here would make a hermetic client unable to run
// an installed `shojiku` at all, for a reason its own documentation does not
// give.
func (e *env) unguarded(name string) string {
	prefix := name + "="
	for _, entry := range e.all() {
		if strings.HasPrefix(entry, prefix) {
			return entry[len(prefix):]
		}
	}
	return ""
}

// paths reads a list-separated variable as directories, which is how every
// other tool in this family spells "several paths in one variable".
func (e *env) paths(name string) []string {
	value := e.get(name)
	if value == "" {
		return nil
	}
	var dirs []string
	for _, dir := range strings.Split(value, string(os.PathListSeparator)) {
		if dir != "" {
			dirs = append(dirs, dir)
		}
	}
	return dirs
}

// childEnvironment is the environment the engine child process gets.
//
// With lookups enabled this is the parent's own environment, unchanged — the
// child is entitled to the same deployment settings this process reads. With
// them disabled every SHOJIKU_* variable is REMOVED, which is the only way
// the flag means the same thing here as it does in an SDK that links the
// engine.
func (e *env) childEnvironment() []string {
	entries := e.all()
	if e.enabled {
		return entries
	}
	kept := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !strings.HasPrefix(entry, envPrefix) {
			kept = append(kept, entry)
		}
	}
	return kept
}

func (e *env) all() []string {
	if e.source != nil {
		return e.source
	}
	return os.Environ()
}
