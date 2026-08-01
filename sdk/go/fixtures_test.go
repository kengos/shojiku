package shojiku

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// Fixtures shared by every test: the real engine binary, the repository's own
// font and locale packs, and generated key material.
//
// Nothing here is a stub by default. This SDK's whole job is to be a faithful
// transport, so a suite that mocked the subprocess would test the mock. What
// it does avoid is repeating the setup: one client, one rendered document,
// one signed document, each built once per process.

const repoRoot = "../.."

var (
	keysOnce sync.Once
	keysDir  string
	keysErr  error

	renderedOnce sync.Once
	renderedDoc  *DocumentArtifact

	signedOnce sync.Once
	signedDoc  *DocumentArtifact
)

// keys generates the key material the signing tests run against.
//
// Generated, never committed: a repository checkout holds no private key, and
// a leaked test key is worth nothing. The same generator the Rust suites use,
// so both sides sign with the same shapes.
//
// Memoized so the generator runs ONCE. It writes its completion sentinel
// last, so a second run racing a test that is reading the files is a real
// failure mode rather than a theoretical one — and a Go suite runs its
// package's tests in one process with -race watching.
func keys(t *testing.T) string {
	t.Helper()
	keysOnce.Do(func() {
		dir := filepath.Join(os.TempDir(), fmt.Sprintf("shojiku-go-keys-%d", os.Getpid()))
		script, err := filepath.Abs(filepath.Join(repoRoot, "scripts/gen-test-keys.sh"))
		if err != nil {
			keysErr = err
			return
		}
		if out, err := exec.Command("sh", script, dir).CombinedOutput(); err != nil {
			keysErr = fmt.Errorf("the test-key generator failed: %v: %s", err, out)
			return
		}
		keysDir = dir
	})
	if keysErr != nil {
		t.Fatal(keysErr)
	}
	return keysDir
}

func keyPath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join(keys(t), name)
}

func passphrase(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(keyPath(t, "passphrase.txt"))
	if err != nil {
		t.Fatalf("reading the generated passphrase: %v", err)
	}
	return strings.TrimSpace(string(raw))
}

func fixtureTemplates(t *testing.T) string {
	t.Helper()
	return abs(t, "testdata/templates")
}

// sourceAssets is where the bytes-first entrance's bundled assets live. A
// directory rather than a template root: GenerateSource resolves
// assets/logo.svg against it and resolves NOTHING else, since there is no
// name to look up.
func sourceAssets(t *testing.T) string {
	t.Helper()
	return abs(t, "testdata/sources")
}

func fontDirs(t *testing.T) []string   { return []string{abs(t, repoRoot+"/packs/fonts")} }
func localeDirs(t *testing.T) []string { return []string{abs(t, repoRoot+"/packs/locale")} }

func abs(t *testing.T, path string) string {
	t.Helper()
	resolved, err := filepath.Abs(path)
	if err != nil {
		t.Fatalf("resolving %s: %v", path, err)
	}
	return resolved
}

// engineBinary is the binary path, read from the environment the gate image
// sets. Passed explicitly because the clients below run with lookups off.
func engineBinary(t *testing.T) string {
	t.Helper()
	binary := os.Getenv("SHOJIKU_BIN")
	if binary == "" {
		t.Fatal("SHOJIKU_BIN is unset; the gate image sets it")
	}
	return binary
}

// newTestClient builds a client over the fixture template root, with the
// packs wired up and the environment deliberately OFF — a test that
// accidentally inherited a SHOJIKU_* variable from the runner would be
// testing the runner.
func newTestClient(t *testing.T, opts ...Option) *Client {
	t.Helper()
	base := []Option{
		WithTemplates(fixtureTemplates(t)),
		WithFontDirs(fontDirs(t)...),
		WithLocaleDirs(localeDirs(t)...),
		WithBinary(engineBinary(t)),
		WithEnv(false),
	}
	client, err := NewClient(append(base, opts...)...)
	if err != nil {
		t.Fatalf("building the test client: %v", err)
	}
	t.Cleanup(ResetConfiguration)
	return client
}

// rendered is one rendered document, built once per process.
func rendered(t *testing.T) *DocumentArtifact {
	t.Helper()
	renderedOnce.Do(func() {
		result, err := newTestClient(t).Generate(context.Background(), "receipt",
			map[string]any{"customer": map[string]any{"name": "Yamada Shoji K.K."}})
		if err != nil || !result.Success() {
			t.Fatalf("the fixture template did not render: %v / %v", err, result.Failure())
		}
		renderedDoc = result.Artifact()
	})
	if renderedDoc == nil {
		t.Fatal("the fixture document is unavailable")
	}
	return renderedDoc
}

// signed is one signed document, built once per process.
func signed(t *testing.T) *DocumentArtifact {
	t.Helper()
	signedOnce.Do(func() {
		result, err := rendered(t).Sign(context.Background(), testSigner(t))
		if err != nil || !result.Success() {
			t.Fatalf("the fixture document did not sign: %v / %v", err, result.Failure())
		}
		signedDoc = result.Artifact()
	})
	if signedDoc == nil {
		t.Fatal("the signed fixture document is unavailable")
	}
	return signedDoc
}

func testSigner(t *testing.T, opts ...PemOption) *LocalPem {
	t.Helper()
	base := []PemOption{
		KeyPath(keyPath(t, "rsa2048.key.pem")),
		CertPath(keyPath(t, "rsa2048.cert.pem")),
	}
	provider, err := NewLocalPem(append(base, opts...)...)
	if err != nil {
		t.Fatalf("building the test signer: %v", err)
	}
	return provider
}

// stubCapabilities is the payload a current engine answers with.
const stubCapabilities = `{"version":"9.9.9","capabilities":["cli.report"],"builtinLocales":["en-US"]}`

// stubBinary writes an executable stand-in for the engine and returns its
// path.
//
// The real engine cannot be made to die mid-write, to answer with something
// that is not its report, or to predate its own --report flag — so those
// paths are driven by a script that does exactly that and nothing else.
// Everything ELSE in this suite runs against the real binary: this exists for
// the cases where "what if the thing on the other end is not what we think"
// is the claim under test.
//
// body is shell run for a lifecycle command, with $report already holding
// whatever --report pointed at.
func stubBinary(t *testing.T, body string) string {
	t.Helper()
	return stubBinaryWith(t, body, stubCapabilities)
}

// rawStub writes a stub with no capability preamble at all, for the cases
// where the PROBE itself is what must misbehave.
func rawStub(t *testing.T, script string) string {
	t.Helper()
	return writeStub(t, "#!/bin/sh\n"+script+"\n")
}

func stubBinaryWith(t *testing.T, body, capabilities string) string {
	t.Helper()
	script := fmt.Sprintf(`#!/bin/sh
if [ "$1" = "capabilities" ]; then
    printf '%%s' '%s'
    exit 0
fi
report=""
prev=""
for arg in "$@"; do
    if [ "$prev" = "--report" ]; then report="$arg"; fi
    prev="$arg"
done
%s
`, capabilities, body)
	return writeStub(t, script)
}

func writeStub(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "shojiku-stub")
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("writing the stub binary: %v", err)
	}
	return path
}

// stubClient is a client over a stub binary, with no template root — the
// transport failures it drives never get that far.
func stubClient(t *testing.T, path string, opts ...Option) *Client {
	t.Helper()
	base := []Option{
		WithTemplates(fixtureTemplates(t)),
		WithBinary(path),
		WithEnv(false),
	}
	client, err := NewClient(append(base, opts...)...)
	if err != nil {
		t.Fatalf("building the stub client: %v", err)
	}
	t.Cleanup(ResetConfiguration)
	return client
}

// recordingLogger keeps what it was told, so a test can assert on the
// channel's CONTENT rather than only on the fact that something was written.
type recordingLogger struct {
	mu    sync.Mutex
	lines []string
}

func (l *recordingLogger) Debug(msg string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	line := msg
	for i := 0; i+1 < len(args); i += 2 {
		line += fmt.Sprintf(" %v=%v", args[i], args[i+1])
	}
	l.lines = append(l.lines, line)
}

func (l *recordingLogger) joined() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.lines, "\n")
}

// sourceTemplate is a template as SOURCE TEXT, for the entrance that never
// reads a file. items is spliced in already indented to the flow's item list.
func sourceTemplate(items string) string {
	indented := make([]string, 0)
	for _, line := range strings.Split(strings.TrimRight(items, "\n"), "\n") {
		if line == "" {
			indented = append(indented, line)
			continue
		}
		indented = append(indented, "      "+line)
	}
	return `version: 0.1.0
name: inline
page: { size: A4, margin: 25 }
defaults:
  locale: en-US
  style: { fontFamily: noto-sans, fontSize: 10.5 }
sections:
  body:
    type: flow
    items:
` + strings.Join(indented, "\n")
}

// textItem is one text item binding key, sized from the fixture templates
// that render warning-free at this font size.
func textItem(key string) string {
	return fmt.Sprintf(`- id: line
  type: text
  box: { x: 0, y: 0, w: 400, h: 16 }
  text: "Billed to {%s}"`, key)
}
