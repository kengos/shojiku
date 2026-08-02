package shojiku

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTheWorkspaceIsPrivateAndPerCall(t *testing.T) {
	var first, second string

	for _, seen := range []*string{&first, &second} {
		if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
			*seen = ws.dir
			info, err := os.Stat(ws.dir)
			if err != nil {
				t.Fatalf("the workspace does not exist: %v", err)
			}
			if perm := info.Mode().Perm(); perm != 0o700 {
				t.Errorf("mode = %04o, want 0700", perm)
			}
			return &Result{}, nil
		}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if first == second {
		t.Error("two calls shared one directory")
	}
	if !strings.Contains(filepath.Base(first), "shojiku-") {
		t.Errorf("directory %q is not named for this package", first)
	}
}

func TestFilesAreWrittenPrivateAsTheyAreCreated(t *testing.T) {
	// The mode is on the CREATE, not a chmod afterwards: writing first and
	// tightening after leaves a window in which a private key is readable by
	// everything on the machine.
	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		path := ws.write("key.pem", []byte("-----BEGIN PRIVATE KEY-----"))
		if ws.failed() != nil {
			t.Fatalf("writing: %v", ws.failed())
		}
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat: %v", err)
		}
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Errorf("mode = %04o, want 0600", perm)
		}
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTheWorkspaceIsRemovedOnTheSuccessPath(t *testing.T) {
	var dir string

	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		dir = ws.dir
		ws.write("params.json", []byte("{}"))
		ws.reserve("report.json")
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the workspace survived a successful call: %v", err)
	}
}

func TestTheWorkspaceIsRemovedOnTheFailurePathToo(t *testing.T) {
	var dir string
	sentinel := errors.New("the operation failed")

	_, err := inWorkspace(func(ws *workspace) (*Result, error) {
		dir = ws.dir
		ws.write("key.pem", []byte("secret"))
		return nil, sentinel
	})

	if !errors.Is(err, sentinel) {
		t.Fatalf("err = %v, want the operation's own", err)
	}
	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the workspace survived a failed call: %v", err)
	}
}

func TestAReservedPathIsRemovedEvenThoughNothingHereCreatesIt(t *testing.T) {
	// The --report sidecar is written by the CHILD, so the workspace has to
	// register it without having made it.
	var reserved string

	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		reserved = ws.reserve("report.json")
		if err := os.WriteFile(reserved, []byte("{}"), 0o600); err != nil {
			return nil, err
		}
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(reserved); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the child's own output survived: %v", err)
	}
}

func TestAWorkspaceThatCannotBeCreatedIsAHostFailure(t *testing.T) {
	t.Setenv("TMPDIR", filepath.Join(t.TempDir(), "absent"))

	_, err := inWorkspace(func(*workspace) (*Result, error) {
		t.Fatal("the body ran without a workspace")
		return nil, nil
	})

	assertEngineFailure(t, err, "could not create a temporary directory")
}

func TestWritingRefusesAPathThatIsAlreadyThere(t *testing.T) {
	// O_EXCL: adopting an existing path would let a symlink standing where
	// the file belongs redirect the write.
	dir := t.TempDir()
	occupied := filepath.Join(dir, "params.json")
	if err := os.WriteFile(occupied, []byte("someone else"), 0o600); err != nil {
		t.Fatalf("occupying the path: %v", err)
	}

	err := writeExclusive(occupied, []byte("{}"))

	if err == nil {
		t.Fatal("an existing path was adopted")
	}
	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		ws.dir = dir
		ws.write("params.json", []byte("{}"))
		if ws.failed() == nil {
			t.Error("the workspace adopted an existing file")
		} else {
			assertEngineFailure(t, ws.failed(), "could not write into the temporary directory")
		}
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestTheRenderedDocumentNeverTouchesTheFilesystem(t *testing.T) {
	// `--output -` brings the PDF back on stdout, so a rendered document
	// never lands in a temporary file at all. The proof is the argv the child
	// was given.
	argvLog := filepath.Join(t.TempDir(), "argv")
	client := stubClient(t, stubBinary(t, `for arg in "$@"; do printf '%s\n' "$arg" >> `+
		argvLog+`; done
printf '%%PDF-1.7 fake'
printf '{"ok":true,"diagnostics":{"items":[]},"pageCount":1}' > "$report"
exit 0`))

	result, err := client.Generate(context.Background(), "receipt", map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the stub render failed: %v", result.Failure())
	}
	argv, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("reading the recorded argv: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(argv)), "\n")
	output := -1
	for i, line := range lines {
		if line == "--output" {
			output = i
		}
	}
	if output < 0 || lines[output+1] != "-" {
		t.Errorf("the render did not ask for stdout:\n%s", argv)
	}
	if !strings.HasPrefix(string(result.Artifact().Bytes()), "%PDF-") {
		t.Error("the document did not come back over stdout")
	}
}
