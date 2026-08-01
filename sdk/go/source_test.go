package shojiku

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAPathShapedTemplateIsAParseFailureNotAFileThatGetsOpened(t *testing.T) {
	// The entrance takes source TEXT. An SDK that "helpfully" opened a
	// path-shaped value would make every containment rule bypassable by
	// spelling the same thing differently.
	realTemplate := filepath.Join(fixtureTemplates(t), "receipt", templateFile)
	if _, err := os.Stat(realTemplate); err != nil {
		t.Fatalf("the fixture the test would have read is missing: %v", err)
	}

	result, err := newTestClient(t).GenerateSource(context.Background(),
		Source{Template: realTemplate}, map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("a path-shaped template rendered, so the file was read")
	}
	if got := result.Failure().Kind(); got != "parse" {
		t.Errorf("kind = %q, want a parse failure", got)
	}
}

func TestTheBytesEntranceRendersSourcesTheApplicationHolds(t *testing.T) {
	result, err := newTestClient(t).GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who"))},
		map[string]any{"who": "Held In Memory"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the inline template did not render: %v", result.Failure())
	}
	if result.Artifact().Origin() != OriginSource {
		t.Errorf("origin = %q, want %q", result.Artifact().Origin(), OriginSource)
	}
	if pages, ok := result.Artifact().PageCount(); !ok || pages != 1 {
		t.Errorf("page count = %d/%v, want 1", pages, ok)
	}
}

func TestCallerSuppliedDefinitionsAndAssetsBothCross(t *testing.T) {
	definitions := `version: 0.2.0
type: object
properties:
  who:
    type: string
    title: Who
    example: Someone
`
	items := `- id: logo
  type: image
  src: assets/logo.svg
  box: { x: 0, y: 0, w: 40, h: 40 }

` + textItem("who")

	result, err := newTestClient(t).GenerateSource(context.Background(), Source{
		Template:    sourceTemplate(items),
		Definitions: definitions,
		AssetsDir:   sourceAssets(t),
	}, map[string]any{"who": "With Assets"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the render failed: %v", result.Failure())
	}
	if len(result.Errors()) != 0 {
		t.Errorf("the render carries errors: %v", result.Errors())
	}
}

func TestRootContainmentDoesNotApplyToCallerSuppliedBytes(t *testing.T) {
	// There is no root to be contained by — which is exactly why a strict
	// client refuses this entrance instead.
	client, err := NewClient(
		WithBinary(engineBinary(t)),
		WithFontDirs(fontDirs(t)...),
		WithLocaleDirs(localeDirs(t)...),
		WithEnv(false),
	)
	if err != nil {
		t.Fatalf("building a rootless client: %v", err)
	}
	if client.TemplateRoot() != "" {
		t.Fatalf("the client has a template root: %q", client.TemplateRoot())
	}

	result, err := client.GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who"))}, map[string]any{"who": "No Root"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("a rootless client could not render its own bytes: %v", result.Failure())
	}
}

func TestParamsAcceptTheEnginesOwnFormatsVerbatim(t *testing.T) {
	// A string is the caller's own source text: the engine parses JSON or
	// YAML (YAML is a superset), so re-encoding it here would only be a
	// chance to change it. There is deliberately no per-format method family.
	client := newTestClient(t)

	for name, params := range map[string]any{
		"a map":     map[string]any{"customer": map[string]any{"name": "Map"}},
		"json":      `{"customer": {"name": "JSON"}}`,
		"yaml":      "customer:\n  name: YAML\n",
		"raw bytes": []byte(`{"customer": {"name": "Bytes"}}`),
		"nil":       nil,
	} {
		t.Run(name, func(t *testing.T) {
			result, err := client.Generate(context.Background(), "receipt", params)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !result.Success() {
				t.Fatalf("the render failed: %v", result.Failure())
			}
		})
	}
}

func TestParamsThatCannotBeEncodedAreMisuse(t *testing.T) {
	// And they are found BEFORE a workspace exists: there is no reason to
	// create a directory to discover the caller passed a channel.
	_, err := newTestClient(t).Generate(context.Background(), "receipt",
		map[string]any{"impossible": make(chan int)})

	assertUsage(t, err, "could not be serialized")
}

func TestParamsAreEncodedWithoutHtmlEscaping(t *testing.T) {
	// The engine reads UTF-8 and this is not a web page: escaping `<`, `>`
	// and `&` into \u sequences would rewrite the caller's data for a threat
	// model that does not apply.
	encoded, err := encodeParams(map[string]any{"name": "A & B <c>"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(string(encoded), "A & B <c>") {
		t.Errorf("encoded = %s, want the value unchanged", encoded)
	}
	if strings.HasSuffix(string(encoded), "\n") {
		t.Errorf("encoded = %q, want no trailing newline", encoded)
	}
}
