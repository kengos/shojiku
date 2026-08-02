package shojiku

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// engineWorkspaceVersion reads the version the whole repository moves on.
func engineWorkspaceVersion(t *testing.T) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(repoRoot, "engine", "Cargo.toml"))
	if err != nil {
		t.Fatalf("reading the engine manifest: %v", err)
	}
	match := regexp.MustCompile(`(?m)^version = "([^"]+)"`).FindSubmatch(raw)
	if match == nil {
		t.Fatal("the engine manifest names no workspace version")
	}
	return string(match[1])
}

// packageSources is every non-test Go file in this package.
func packageSources(t *testing.T) map[string]string {
	t.Helper()
	entries, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("listing the package: %v", err)
	}
	sources := make(map[string]string)
	for _, path := range entries {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		sources[path] = string(raw)
	}
	if len(sources) == 0 {
		t.Fatal("no package sources were found; the sweep below would prove nothing")
	}
	return sources
}

func TestEngineInfoIsPassedThroughUnmodelled(t *testing.T) {
	// An append-only wire this package does not model: a typed value would
	// owe a new field in seven languages every time the engine adds one.
	info, err := newTestClient(t).EngineInfo(context.Background())

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, key := range []string{"version", "capabilities"} {
		if _, present := info[key]; !present {
			t.Errorf("the payload lost its %q key on the way through", key)
		}
	}
	if len(info) < 2 {
		t.Errorf("the payload was narrowed to %d keys", len(info))
	}
}

func TestNothingInThePackageReimplementsEngineBehaviour(t *testing.T) {
	// Layout, formatting and PDF construction never cross this boundary. A
	// missing capability is added to the engine, not worked around here.
	forbidden := regexp.MustCompile(`(?i)\b(xref|/Type\s*/Page|font metrics|linebreak|freetype|harfbuzz)\b`)

	for path, source := range packageSources(t) {
		if match := forbidden.FindString(source); match != "" {
			t.Errorf("%s looks like it inspects a PDF or lays text out: %q", path, match)
		}
	}
}

func TestNothingDownloadsAnything(t *testing.T) {
	// An SDK that fetches an executable at install or run time is a
	// supply-chain surface this product does not take on — so the package
	// imports nothing that could.
	forbidden := regexp.MustCompile(`"(net/http|net/url|net)"`)

	for path, source := range packageSources(t) {
		if match := forbidden.FindString(source); match != "" {
			t.Errorf("%s imports %s", path, match)
		}
	}
}

func TestThePackageHasNoDependencies(t *testing.T) {
	// Pure stdlib, which is also why there is no go.sum for an SBOM scan to
	// read — exactly as the PHP package deliberately has no lockfile.
	raw, err := os.ReadFile("go.mod")
	if err != nil {
		t.Fatalf("reading go.mod: %v", err)
	}
	if strings.Contains(string(raw), "require") {
		t.Errorf("go.mod declares a dependency:\n%s", raw)
	}
	if _, err := os.Stat("go.sum"); err == nil {
		t.Error("a go.sum exists, so something is being depended on")
	}
}

func TestThePdfIsNeverInspectedOnlyCarried(t *testing.T) {
	artifact := rendered(t)

	pdf := artifact.Bytes()

	if !strings.HasPrefix(string(pdf), "%PDF-") {
		t.Errorf("the bytes are not a PDF: %q", pdf[:min(8, len(pdf))])
	}
	if artifact.Size() != len(pdf) {
		t.Errorf("Size() = %d, want %d", artifact.Size(), len(pdf))
	}
	// A COPY, so a caller who trims what they were handed cannot corrupt the
	// bytes a later Sign appends its revision to.
	pdf[0] = 'X'
	if artifact.Bytes()[0] != '%' {
		t.Error("Bytes() handed out the artifact's own buffer")
	}
}

func TestDiagnosticsAreNeverTranslatedOrReclassified(t *testing.T) {
	result, err := newTestClient(t).Generate(context.Background(), "broken", map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("the broken fixture rendered")
	}
	errs := result.Errors()
	if len(errs) == 0 {
		t.Fatal("the refusal carries no error diagnostics")
	}
	if errs[0].Code() == "" {
		t.Error("the diagnostic lost its stable code")
	}
	if errs[0].Message() == "" {
		t.Error("the diagnostic lost its message")
	}
}

func TestTheEchoHelperStripsControlCharactersAndCapsLength(t *testing.T) {
	if got := bounded("safe\x00\x1f\x7fname\n"); got != "safename" {
		t.Errorf("bounded = %q, want the control characters gone", got)
	}
	if got := bounded(strings.Repeat("a", 200)); len(got) != textLimit {
		t.Errorf("bounded length = %d, want %d", len(got), textLimit)
	}
	// Capped in CHARACTERS, not bytes: cutting UTF-8 at a byte offset splits
	// a multi-byte sequence.
	multibyte := bounded(strings.Repeat("あ", 200))
	if runes := []rune(multibyte); len(runes) != textLimit {
		t.Errorf("bounded to %d runes, want %d", len(runes), textLimit)
	}
	if !strings.HasSuffix(multibyte, "あ") {
		t.Errorf("the cut split a multi-byte sequence: %q", multibyte)
	}
}

func TestInvalidUtf8StillLosesItsControlBytes(t *testing.T) {
	got := bounded("ok\xff\x07more")

	if strings.ContainsRune(got, 0x07) {
		t.Errorf("bounded = %q, want the control byte gone", got)
	}
	if !strings.Contains(got, "ok") || !strings.Contains(got, "more") {
		t.Errorf("bounded = %q, want the readable text kept", got)
	}
}
