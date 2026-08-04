package shojiku

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os/exec"
	"sync"
)

// reportCapability is the capability key the subprocess contract needs to
// exist at all.
const reportCapability = "cli.report"

// externalCapability is the key the two-step signing verbs advertise.
const externalCapability = "cli.sign.external"

// engine is the ONE place a call crosses out of Go.
//
// Everything about the subprocess transport that could be got wrong lives
// here, so it can be read as one piece:
//
//   - the command is a SLICE, so os/exec execs the binary directly and no
//     shell is involved — there is no quoting or injection story to get right
//     because there is nothing to quote for;
//   - stdout and stderr are drained CONCURRENTLY, which os/exec does on its
//     own goroutines whenever they are not *os.File. Reading one to
//     completion first deadlocks the moment the other fills its pipe, and
//     that is a hazard the subprocess SDKs in other languages have to
//     hand-roll around; here the standard library has already solved it;
//   - stdout is binary (it carries the PDF) and stderr is prose that is never
//     parsed — only quoted, bounded, when there is no report to explain a
//     failure;
//   - nothing is sent on stdin: every input the engine takes is a path, and
//     a nil Stdin means a child that ever asked for one (the passphrase
//     prompt) reads EOF instead of blocking forever;
//   - the child's environment is the one env composed, which is how turning
//     lookups off reaches a process that would otherwise read SHOJIKU_*
//     itself.
//
// There is deliberately no wall-clock timeout. How long a render may take is
// a property of the document, not of the transport, and none of the six other
// SDKs offers a cap — one here would be a contract surface this stage is not
// entitled to invent. What the caller's own context does offer is
// cancellation, which is the caller's decision rather than this package's.
type engine struct {
	binary *binary
	env    *env
	log    *logSink

	// Each capability is probed once per binary and then remembered.
	// Behind a mutex because a Go client is documented as safe for concurrent
	// use, so "once" has to mean once even when four goroutines arrive
	// together — the SDKs in languages without threads got this for free.
	mu     sync.Mutex
	probed map[string]bool
}

func newEngine(bin *binary, e *env, log *logSink) *engine {
	log.event("binary_found", "path", bin.path, "source", bin.source)
	return &engine{binary: bin, env: e, log: log, probed: map[string]bool{}}
}

// engineInfo is what this build of the engine can do — its version,
// capability keys and builtin locales, exactly as the engine emitted them.
func (g *engine) engineInfo(ctx context.Context) (map[string]any, error) {
	status, stdout, stderr, err := g.spawn(ctx, []string{"capabilities"}, nil)
	if err != nil {
		return nil, err
	}
	if status != 0 {
		return nil, enginef("`%s capabilities` exited %d (it said: %s)",
			bounded(g.binary.path), status, bounded(string(bytes.TrimSpace(stderr))))
	}

	var payload map[string]any
	if err := json.Unmarshal(stdout, &payload); err != nil {
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) {
			return nil, enginef("the engine's capability payload is not an object")
		}
		return nil, enginef("the engine's capability payload is not JSON: %v", err)
	}
	if payload == nil {
		return nil, enginef("the engine's capability payload is not an object")
	}
	return payload, nil
}

// requireReport refuses a binary that cannot serve the contract.
//
// The FFI SDKs ask for an ABI revision before their first call; this is the
// same check in the shape a subprocess has. An engine without `cli.report`
// leaves prose on stderr as the only output, and saying so by name is better
// than parsing it.
func (g *engine) requireReport(ctx context.Context) error {
	return g.require(ctx, reportCapability, "report what an operation did")
}

// requireExternal refuses a binary without the two-step signing verbs, which
// is what an [ExternalSigner] drives.
func (g *engine) requireExternal(ctx context.Context) error {
	return g.require(ctx, externalCapability, "sign with a key it never sees")
}

// require refuses a binary that does not advertise key.
//
// Each key is asked for once per binary. `what` completes the sentence "so it
// cannot …", because an operator reading the refusal needs to know which
// capability they are missing AND what it was going to be used for.
func (g *engine) require(ctx context.Context, key, what string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.probed[key] {
		return nil
	}

	info, err := g.engineInfo(ctx)
	if err != nil {
		return err
	}
	supported := hasCapability(info, key)
	version, _ := info["version"].(string)
	g.log.event("engine_checked", "version", version, "capability", key,
		"supported", supported)
	if !supported {
		return &IncompatibleEngineError{Message: "`" + bounded(g.binary.path) +
			"` does not advertise `" + key + "`, so it cannot " + what + ". " +
			"Install an engine from this release or newer."}
	}
	g.probed[key] = true
	return nil
}

func hasCapability(info map[string]any, key string) bool {
	keys, _ := info["capabilities"].([]any)
	for _, candidate := range keys {
		if name, ok := candidate.(string); ok && name == key {
			return true
		}
	}
	return false
}

// execute runs one lifecycle command and reads its report.
//
// argv is the command and its flags, without --report; extraEnv holds
// variables only this call needs. It returns the report and whatever came
// back on stdout.
func (g *engine) execute(
	ctx context.Context, argv []string, ws *workspace, extraEnv map[string]string,
) (*report, []byte, error) {
	if err := g.requireReport(ctx); err != nil {
		return nil, nil, err
	}
	// The one place a staging failure is reported. Running the engine over a
	// file that was never written would come back as a document that could
	// not be read, which is a fact about the caller's document that nobody
	// determined.
	if err := ws.failed(); err != nil {
		return nil, nil, err
	}
	reportPath := ws.reserveReport()
	_, stdout, stderr, err := g.spawn(ctx, append(argv, "--report", reportPath), extraEnv)
	if err != nil {
		return nil, nil, err
	}
	rep, err := readReport(reportPath, string(stderr))
	if err != nil {
		return nil, nil, err
	}
	return rep, stdout, nil
}

// spawn runs the binary and returns its exit status and both streams.
//
// A non-zero status is NOT an error here: the report says what happened, and
// a failing render is expected to exit non-zero. Only a process that could
// not be run at all is.
func (g *engine) spawn(
	ctx context.Context, argv []string, extraEnv map[string]string,
) (int, []byte, []byte, error) {
	cmd := exec.CommandContext(ctx, g.binary.path, argv...)
	cmd.Env = childEnv(g.env.childEnvironment(), extraEnv)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		return 0, nil, nil, enginef("could not run `%s`: %v", bounded(g.binary.path), err)
	}
	return cmd.ProcessState.ExitCode(), stdout.Bytes(), stderr.Bytes(), nil
}

// childEnv appends the per-call variables to the composed environment.
//
// Appended rather than merged: os/exec takes the LAST assignment of a name,
// so a per-call value wins without this having to scan for duplicates.
func childEnv(base []string, extra map[string]string) []string {
	if len(extra) == 0 {
		return base
	}
	out := make([]string, 0, len(base)+len(extra))
	out = append(out, base...)
	for name, value := range extra {
		out = append(out, name+"="+value)
	}
	return out
}
