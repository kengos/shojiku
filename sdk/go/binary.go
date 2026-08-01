package shojiku

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// commandName is what the engine's executable is called.
const commandName = "shojiku"

// binary is the engine's command-line binary, found.
//
// Resolution order, and the deliberate asymmetry with the template root:
// SHOJIKU_BIN beats explicit configuration, which beats whatever is on PATH.
// That is the reverse of how the template root resolves, and on purpose —
// WHERE THE ENGINE LIVES is an operator/deployment decision that has to be
// able to win over application code, exactly as SHOJIKU_LIBRARY does for the
// SDKs that load a shared library. WHICH TEMPLATES an application renders is
// the application's own decision, so there the explicit value wins.
//
// Nothing here downloads anything. A binary that is not present is a named
// error listing the install channels.
type binary struct {
	path string
	// source is which position the path came from — worth reporting, because
	// "which engine did this process actually run, and why that one" is the
	// question a deployment asks at 3am.
	source string
}

func newBinary(configured string, e *env) (*binary, error) {
	path, source := discoverBinary(configured, e)
	if path == "" {
		return nil, &BinaryNotFoundError{Message: installHint("no `shojiku` binary was found")}
	}
	info, err := os.Stat(path)
	if err != nil || !executable(info.Mode()) {
		return nil, &BinaryNotFoundError{Message: installHint(
			"`" + bounded(path) + "` is not an executable file")}
	}
	return &binary{path: path, source: source}, nil
}

// discoverBinary is the three lookup positions, in order.
//
// Split out from the constructor so each position is provable on its own: a
// client cannot be built over a binary that does not exist, and "the
// environment wins" is exactly the claim that needs proving without one.
func discoverBinary(configured string, e *env) (path, source string) {
	if fromEnv := e.get("SHOJIKU_BIN"); fromEnv != "" {
		return fromEnv, "environment"
	}
	if configured != "" {
		return configured, "configuration"
	}
	return onPath(e), "path"
}

// onPath searches PATH by hand rather than through exec.LookPath.
//
// LookPath reads the process's OWN environment and cannot be given another
// one, which would make the three lookup positions above unprovable — a Go
// process cannot set a variable in its own environment for a test. Searching
// here also keeps the Windows spelling explicit: both the bare name and the
// .exe form are tried at every entry, so the same lookup works on the
// platform this family's market actually runs on.
func onPath(e *env) string {
	// unguarded, because PATH is the operating system's variable rather than
	// one of this engine's settings — see the note on that method.
	for _, dir := range strings.Split(e.unguarded("PATH"), string(os.PathListSeparator)) {
		if dir == "" {
			continue
		}
		for _, name := range []string{commandName, commandName + ".exe"} {
			candidate := filepath.Join(dir, name)
			if info, err := os.Stat(candidate); err == nil && executable(info.Mode()) {
				return candidate
			}
		}
	}
	return ""
}

// executable reports whether mode belongs to a file this process could run.
func executable(mode fs.FileMode) bool {
	return executableOn(mode, runtime.GOOS == "windows")
}

// executableOn is the rule behind [executable], with the platform passed in.
//
// A parameter rather than a reference to runtime.GOOS, because the two halves
// are decided on different platforms and only one of them can be exercised
// where the gate runs — a guard nobody can exercise is a guard nobody knows
// works. Windows has no execute bit at all (os.Stat reports 0666 or 0444
// there), so an `&0o111` test would reject EVERY candidate on the one
// platform this family's market runs on, while passing every test on Linux.
func executableOn(mode fs.FileMode, windows bool) bool {
	if !mode.IsRegular() {
		return false
	}
	if windows {
		return true
	}
	return mode.Perm()&0o111 != 0
}

func installHint(reason string) string {
	return reason + ".\n\n" +
		"This package never downloads the engine. Install it one of these ways:\n" +
		"  * build it from a repository clone, or run the Docker image\n" +
		"  * point SHOJIKU_BIN at a `shojiku` binary you installed\n" +
		"  * pass shojiku.WithBinary(\"/path/to/shojiku\") to NewClient"
}
