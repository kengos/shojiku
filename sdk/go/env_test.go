package shojiku

import (
	"context"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestLookupsOffStripEverySHOJIKUVariableFromTheChild(t *testing.T) {
	// The clause a subprocess SDK owes that the in-process ones do not: the
	// engine reads SHOJIKU_FONT_DIR and SHOJIKU_LOCALE_DIR itself, so a
	// client that merely stopped reading them would have moved the lookup one
	// process away rather than closed it.
	e := &env{enabled: false, source: []string{
		"SHOJIKU_FONT_DIR=/fonts",
		"SHOJIKU_LOCALE_DIR=/locales",
		"SHOJIKU_TEMPLATE_ROOT=/templates",
		"PATH=/usr/bin",
		"HOME=/root",
	}}

	child := e.childEnvironment()

	for _, entry := range child {
		if strings.HasPrefix(entry, envPrefix) {
			t.Errorf("the child inherited %q", entry)
		}
	}
	if !slices.Contains(child, "HOME=/root") {
		t.Error("an unrelated variable was stripped too")
	}
}

func TestLookupsOffDoNotStripPath(t *testing.T) {
	// PATH is the operating system's variable, not one of this engine's
	// settings. Gating it would leave a hermetic client unable to run an
	// installed binary at all.
	e := &env{enabled: false, source: []string{"PATH=/usr/bin", "SHOJIKU_BIN=/nope"}}

	if got := e.unguarded("PATH"); got != "/usr/bin" {
		t.Errorf("unguarded PATH = %q, want it readable", got)
	}
	if !slices.Contains(e.childEnvironment(), "PATH=/usr/bin") {
		t.Error("PATH was stripped from the child's environment")
	}
	if got := e.get("SHOJIKU_BIN"); got != "" {
		t.Errorf("a SHOJIKU_ variable was still read: %q", got)
	}
}

func TestLookupsOnPassTheParentEnvironmentThroughUnchanged(t *testing.T) {
	source := []string{"SHOJIKU_FONT_DIR=/fonts", "PATH=/usr/bin"}
	e := &env{enabled: true, source: source}

	if got := e.childEnvironment(); !slices.Equal(got, source) {
		t.Errorf("childEnvironment() = %v, want the parent's %v", got, source)
	}
	if got := e.get("SHOJIKU_FONT_DIR"); got != "/fonts" {
		t.Errorf("get = %q, want /fonts", got)
	}
}

func TestABlankVariableReadsAsUnset(t *testing.T) {
	e := &env{enabled: true, source: []string{"SHOJIKU_BIN="}}

	if got := e.get("SHOJIKU_BIN"); got != "" {
		t.Errorf("get = %q, want a blank variable to read as unset", got)
	}
	if got := e.paths("SHOJIKU_FONT_DIR"); got != nil {
		t.Errorf("paths = %v, want nil for an unset variable", got)
	}
}

func TestPackDirectoriesComeFromTheEnvironmentAndExplicitConfigurationBeatsThem(t *testing.T) {
	separator := string(os.PathListSeparator)
	source := []string{"SHOJIKU_FONT_DIR=/a" + separator + separator + "/b"}

	fromEnv := &settings{config: config{}, env: &env{enabled: true, source: source}}
	if got := fromEnv.fontDirs(); !slices.Equal(got, []string{"/a", "/b"}) {
		t.Errorf("fontDirs = %v, want the environment's two entries with the blank dropped", got)
	}

	configured := &settings{
		config: config{fontDirs: []string{"/configured"}},
		env:    &env{enabled: true, source: source},
	}
	if got := configured.fontDirs(); !slices.Equal(got, []string{"/configured"}) {
		t.Errorf("fontDirs = %v, want the explicit value to win", got)
	}

	// An explicitly EMPTY list is a configuration, not a gap: it must not
	// fall back to the environment.
	none := &settings{
		config: config{localeDirs: []string{}},
		env:    &env{enabled: true, source: []string{"SHOJIKU_LOCALE_DIR=/from-env"}},
	}
	if got := none.localeDirs(); len(got) != 0 {
		t.Errorf("localeDirs = %v, want an explicit empty list to stay empty", got)
	}
}

func TestTheEnvironmentSuppliesTheTemplateRootAndExplicitConfigurationBeatsIt(t *testing.T) {
	root := fixtureTemplates(t)
	t.Setenv("SHOJIKU_TEMPLATE_ROOT", root)
	t.Setenv("SHOJIKU_BIN", engineBinary(t))

	fromEnv, err := NewClient()
	if err != nil {
		t.Fatalf("building a client from the environment: %v", err)
	}
	if fromEnv.TemplateRoot() != root {
		t.Errorf("root = %q, want the environment's %q", fromEnv.TemplateRoot(), root)
	}

	explicit, err := NewClient(WithTemplates("/elsewhere"))
	if err != nil {
		t.Fatalf("building a client with an explicit root: %v", err)
	}
	if explicit.TemplateRoot() != "/elsewhere" {
		t.Errorf("root = %q, want the explicit value to win", explicit.TemplateRoot())
	}

	off, err := NewClient(WithEnv(false), WithBinary(engineBinary(t)))
	if err != nil {
		t.Fatalf("building a hermetic client: %v", err)
	}
	if off.TemplateRoot() != "" {
		t.Errorf("root = %q, want lookups off to disable the environment", off.TemplateRoot())
	}
}

func TestAHermeticClientStillRendersWithoutInheritedPackDirectories(t *testing.T) {
	// The end-to-end shape of the flag: a client with lookups off renders
	// from what it was configured with, in a process whose environment names
	// a font directory that does not exist. If the child inherited it the
	// render would fail.
	t.Setenv("SHOJIKU_FONT_DIR", filepath.Join(t.TempDir(), "absent"))

	result, err := newTestClient(t).Generate(context.Background(), "receipt",
		map[string]any{"customer": map[string]any{"name": "Hermetic"}})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the render failed: %v", result.Failure())
	}
}
