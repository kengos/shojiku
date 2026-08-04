package shojiku

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// workspace is the private directory one operation borrows, and gives back.
//
// The engine here is a child process that READS FILES, so anything the caller
// holds in memory — params, a bytes-first template, PEM material, the PDF a
// signature or a verification is about — has to exist on disk for the length
// of one call. This is the only place in the package that writes anything,
// which is what makes the rules provable in one file:
//
//   - one directory per call, with an unpredictable name — never one another
//     process could create first,
//   - created 0700, and by a call that fails rather than adopting a directory
//     that already exists,
//   - every file written 0600 AS IT IS CREATED, so a private key is never
//     world-readable even briefly,
//   - removed on every path, including the failing ones — which is why
//     callers use [inWorkspace] rather than building one.
//
// The rendered document deliberately does NOT come through here: it comes
// back over the child's stdout, so a PDF never lands in a temporary file at
// all.
type workspace struct {
	dir     string
	written []string
	// How many reports this workspace has handed out. An operation can run
	// the engine more than once (external signing is two calls), and a shared
	// report path would let the SECOND call read the FIRST one's file when it
	// dies without writing — reporting success over a leg that never ran.
	reports int
	// The first write that failed, if any. Accumulated rather than returned
	// per call: every write here goes into a directory this package created
	// moments ago and owns alone, so a failure means the machine is out of
	// disk — one condition, worth reporting once at the boundary that matters
	// (see [engine.execute]) rather than as a branch at each of the six call
	// sites, none of which a test could ever reach.
	err error
}

// inWorkspace runs body with a fresh workspace, removing it afterwards
// whatever happens.
func inWorkspace(body func(*workspace) (*Result, error)) (*Result, error) {
	// MkdirTemp creates with 0700 under a name it guarantees is new — the
	// "refuse an existing directory" rule is the operating system's here
	// rather than this package's.
	dir, err := os.MkdirTemp("", "shojiku-")
	if err != nil {
		return nil, enginef("could not create a temporary directory: %v", err)
	}
	ws := &workspace{dir: dir}
	defer ws.remove()
	return body(ws)
}

// write writes one file into the workspace and returns the path it has.
//
// A failure is remembered rather than returned; see [workspace.failed].
func (w *workspace) write(name string, content []byte) string {
	path := filepath.Join(w.dir, name)
	// Registered BEFORE the attempt: a create that got as far as making the
	// file and then failed still leaves something to remove.
	w.written = append(w.written, path)
	if w.err != nil {
		return path
	}
	if err := writeExclusive(path, content); err != nil {
		w.err = enginef("could not write into the temporary directory `%s`", bounded(w.dir))
	}
	return path
}

// failed is the first write failure this workspace saw, or nil.
//
// Checked once, immediately before the engine is run, so a staging failure is
// reported as the HOST failure it is instead of reaching the engine as a path
// that is not there and coming back as a document that could not be read.
func (w *workspace) failed() error { return w.err }

// writeExclusive creates path and writes content to it, refusing to open
// anything that is already there.
//
// O_EXCL, and the mode passed to the CREATE rather than chmod-ed afterwards:
// writing first and tightening after leaves a window in which a private key
// is readable by everything on the machine, and adopting an existing path
// would let a symlink standing where the file belongs redirect the write.
//
// The write and the close are joined rather than branched on, so this reports
// either failure without a line no test could ever reach — a full disk and a
// failing close are not conditions a gate can produce on demand.
func writeExclusive(path string, content []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	_, err = file.Write(content)
	return errors.Join(err, file.Close())
}

// reserveReport is a fresh path for one child's --report sidecar.
//
// Fresh per call, never shared: see [workspace.reports].
func (w *workspace) reserveReport() string {
	w.reports++
	return w.reserve(fmt.Sprintf("report-%d.json", w.reports))
}

// reserve is the path a file WOULD have, for outputs the child writes itself
// (the --report sidecar). Registered for removal even though nothing here
// creates it.
func (w *workspace) reserve(name string) string {
	path := filepath.Join(w.dir, name)
	w.written = append(w.written, path)
	return path
}

// remove deletes exactly what this workspace named, then the directory.
//
// A tracked list rather than a recursive delete: this code runs in
// applications, and a recursive remove driven by a path is the shape that
// deletes the wrong tree the day the path is not what it was assumed to be.
func (w *workspace) remove() {
	for _, path := range w.written {
		_ = os.Remove(path)
	}
	_ = os.Remove(w.dir)
}
