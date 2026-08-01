package shojiku

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A binary that exists and can be run, for the discovery tests. Its contents
// never matter: nothing here runs it.
func executableAt(t *testing.T, dir, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("writing %s: %v", path, err)
	}
	return path
}

func TestTheEnvironmentBeatsExplicitConfiguration(t *testing.T) {
	dir := t.TempDir()
	fromEnv := executableAt(t, dir, "shojiku")
	other := executableAt(t, dir, "configured")

	bin, err := newBinary(other, &env{enabled: true, source: []string{"SHOJIKU_BIN=" + fromEnv}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != fromEnv {
		t.Errorf("path = %q, want the environment's %q", bin.path, fromEnv)
	}
	if bin.source != "environment" {
		t.Errorf("source = %q, want %q", bin.source, "environment")
	}
}

func TestExplicitConfigurationBeatsThePath(t *testing.T) {
	dir := t.TempDir()
	configured := executableAt(t, dir, "configured")
	executableAt(t, dir, "shojiku")

	bin, err := newBinary(configured, &env{enabled: true, source: []string{"PATH=" + dir}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != configured || bin.source != "configuration" {
		t.Errorf("got %q from %q, want %q from configuration", bin.path, bin.source, configured)
	}
}

func TestThePathIsSearchedWhenNothingElseNamesOne(t *testing.T) {
	dir := t.TempDir()
	onPath := executableAt(t, dir, "shojiku")

	bin, err := newBinary("", &env{enabled: true, source: []string{"PATH=" + dir}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != onPath || bin.source != "path" {
		t.Errorf("got %q from %q, want %q from path", bin.path, bin.source, onPath)
	}
}

func TestTheWindowsSpellingIsTriedAtEveryPathEntry(t *testing.T) {
	empty, holding := t.TempDir(), t.TempDir()
	windows := executableAt(t, holding, "shojiku.exe")

	bin, err := newBinary("", &env{enabled: true, source: []string{
		"PATH=" + empty + string(os.PathListSeparator) + holding,
	}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != windows {
		t.Errorf("path = %q, want the .exe spelling %q", bin.path, windows)
	}
}

func TestAnEmptyPathEntryIsSkippedRatherThanSearchedAsTheCwd(t *testing.T) {
	// A leading separator is an empty entry, which POSIX shells read as the
	// current directory. Searching it would make discovery depend on where
	// the process happens to be standing.
	dir := t.TempDir()
	found := executableAt(t, dir, "shojiku")

	bin, err := newBinary("", &env{enabled: true, source: []string{
		"PATH=" + string(os.PathListSeparator) + dir,
	}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != found {
		t.Errorf("path = %q, want %q", bin.path, found)
	}
}

func TestNoBinaryAnywhereNamesTheInstallChannels(t *testing.T) {
	_, err := newBinary("", &env{enabled: true, source: []string{"PATH=" + t.TempDir()}})

	if !errors.Is(err, ErrBinaryNotFound) {
		t.Fatalf("err = %v, want ErrBinaryNotFound", err)
	}
	for _, channel := range []string{
		"build it from a repository clone",
		"SHOJIKU_BIN",
		"shojiku.WithBinary",
	} {
		if !strings.Contains(err.Error(), channel) {
			t.Errorf("the message does not name the %q channel: %s", channel, err)
		}
	}
}

func TestAPathThatIsNotExecutableIsRefusedByName(t *testing.T) {
	path := filepath.Join(t.TempDir(), "not-executable")
	if err := os.WriteFile(path, []byte("text"), 0o644); err != nil {
		t.Fatalf("writing the fixture: %v", err)
	}

	_, err := newBinary(path, &env{enabled: true, source: []string{}})

	if !errors.Is(err, ErrBinaryNotFound) {
		t.Fatalf("err = %v, want ErrBinaryNotFound", err)
	}
	if !strings.Contains(err.Error(), "is not an executable file") {
		t.Errorf("the message does not say why: %s", err)
	}
}

func TestDiscoveryDefaultsToTheProcessEnvironment(t *testing.T) {
	// The gate image sets SHOJIKU_BIN, so a lookup with no injected source
	// finds it — which is what proves `source: nil` reads the real thing
	// rather than nothing.
	binary := engineBinary(t)

	bin, err := newBinary("", &env{enabled: true})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bin.path != binary {
		t.Errorf("path = %q, want the process's SHOJIKU_BIN %q", bin.path, binary)
	}
}

func TestAWindowsCandidateNeedsNoExecuteBit(t *testing.T) {
	// The half of the rule the gate's own platform can never exercise:
	// os.Stat reports no execute bits on Windows, so a mode test alone would
	// reject every candidate there.
	readOnly := fs.FileMode(0o444)

	if executableOn(readOnly, true) != true {
		t.Error("a regular file is not executable on windows")
	}
	if executableOn(readOnly, false) != false {
		t.Error("a file with no execute bit is executable off windows")
	}
	if executableOn(fs.ModeDir|0o755, true) != false {
		t.Error("a directory is executable")
	}
}
