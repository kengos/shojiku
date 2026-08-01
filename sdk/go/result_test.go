package shojiku

import (
	"errors"
	"strings"
	"testing"
)

func TestASuccessfulResultCarriesItsValueAndNoFailure(t *testing.T) {
	artifact := &DocumentArtifact{bytes: []byte("%PDF-"), origin: OriginRendered}
	result := succeededWithArtifact(artifact, nil)

	if !result.Success() || result.Failed() {
		t.Error("a successful result reports itself as failed")
	}
	if result.Artifact() != artifact {
		t.Error("the artifact is not the one handed in")
	}
	if result.Report() != nil {
		t.Error("a document result carries a verification report")
	}
	if result.Failure() != nil {
		t.Error("a successful result carries a failure")
	}
	if err := result.Err(); err != nil {
		t.Errorf("Err() = %v, want nil on a success", err)
	}
}

func TestErrCarriesTheFailureOnAFailedResult(t *testing.T) {
	// Go's form of the opt-in unwrap every SDK offers. The other six raise
	// here; the frozen ruling for Go is an error return, because there is no
	// exception to mirror.
	failure := &Failure{step: StepSign, kind: "key_unreadable", message: "no such key"}

	err := fromFailure(failure).Err()

	if !errors.Is(err, ErrUnwrap) {
		t.Fatalf("err = %v, want ErrUnwrap", err)
	}
	var unwrap *UnwrapError
	if !errors.As(err, &unwrap) || unwrap.Failure != failure {
		t.Fatalf("the failure does not travel on the error: %v", err)
	}
	if !strings.Contains(err.Error(), "sign/key_unreadable: no such key") {
		t.Errorf("Error() = %q, want the failure's own form", err)
	}
}

func TestTheSeveritySlicesSplitTheDiagnostics(t *testing.T) {
	result := succeededWithArtifact(nil, []Diagnostic{
		{severity: "warning", code: "a"},
		{severity: "error", code: "b"},
		{severity: "info", code: "c"},
	})

	if len(result.Diagnostics()) != 3 {
		t.Errorf("Diagnostics() has %d entries, want all 3", len(result.Diagnostics()))
	}
	if len(result.Errors()) != 1 || result.Errors()[0].Code() != "b" {
		t.Errorf("Errors() = %v", result.Errors())
	}
	if len(result.Warnings()) != 1 || result.Warnings()[0].Code() != "a" {
		t.Errorf("Warnings() = %v", result.Warnings())
	}
}

func TestAFailedResultInheritsTheFailuresDiagnostics(t *testing.T) {
	diagnostics := []Diagnostic{{severity: "error", code: "parse"}}
	failure := &Failure{step: StepGenerate, kind: "parse", diagnostics: diagnostics}

	result := fromFailure(failure)

	if len(result.Diagnostics()) != 1 {
		t.Errorf("the failed result carries %d diagnostics", len(result.Diagnostics()))
	}
	// And the failure carries them itself, for a caller who logs the trace
	// rather than the result.
	if len(failure.Diagnostics()) != 1 {
		t.Errorf("the failure carries %d diagnostics", len(failure.Diagnostics()))
	}
}

func TestACheckWithNoReasonPrintsJustItsStatus(t *testing.T) {
	if got := (VerificationCheck{Status: "passed"}).String(); got != "passed" {
		t.Errorf("String() = %q, want %q", got, "passed")
	}
	if got := (VerificationCheck{Status: "failed", Reason: "why"}).String(); got != "failed: why" {
		t.Errorf("String() = %q, want the reason appended", got)
	}
}

func TestAnArtifactCarriesTheDiagnosticsItWasProducedWith(t *testing.T) {
	// So a caller who keeps only the artifact still has what the engine said
	// about it.
	warned := []Diagnostic{{severity: "warning", code: "box_overflow"}}

	artifact := &DocumentArtifact{bytes: []byte("%PDF-"), diagnostics: warned}

	if len(artifact.Diagnostics()) != 1 {
		t.Errorf("the artifact carries %d diagnostics", len(artifact.Diagnostics()))
	}
}

func TestConfiguringNoDirectoriesAtAllIsStillAConfiguration(t *testing.T) {
	// "Configured as none" has to stay distinguishable from "never
	// configured", or a client that deliberately took no pack directories
	// would silently inherit the environment's.
	merged := config{}.merge([]Option{WithFontDirs(), WithLocaleDirs("/one")})

	if merged.fontDirs == nil {
		t.Error("WithFontDirs() with no arguments read as never configured")
	}
	if len(merged.fontDirs) != 0 {
		t.Errorf("fontDirs = %v, want empty", merged.fontDirs)
	}
	if len(merged.localeDirs) != 1 {
		t.Errorf("localeDirs = %v, want the one given", merged.localeDirs)
	}
}

func TestARejectionWithACauseBecomesATwoLinkTrace(t *testing.T) {
	// The underlying detail rides as the trace's cause, so a caller can log
	// "the template could not be read" and still find out which path.
	failure := rejectionFailure(&templateRejection{
		kind: "template_unreadable", message: "the template could not be read",
		cause: "/root/x/templates.yml is not a readable file",
	})

	if len(failure.Causes()) != 2 {
		t.Fatalf("the trace has %d links, want 2", len(failure.Causes()))
	}
	if failure.Cause().Kind() != "io" {
		t.Errorf("the cause's kind = %q, want %q", failure.Cause().Kind(), "io")
	}
	bare := rejectionFailure(&templateRejection{kind: "template_name", message: "no"})
	if bare.Cause() != nil {
		t.Error("a rejection with no cause grew one")
	}
}

func TestCausesFlattensTheChainOutermostFirst(t *testing.T) {
	inner := &Failure{step: StepGenerate, kind: "io", message: "no such file"}
	outer := &Failure{step: StepGenerate, kind: "template_unreadable",
		message: "the template could not be read", cause: inner}

	chain := outer.Causes()

	if len(chain) != 2 || chain[0] != outer || chain[1] != inner {
		t.Fatalf("Causes() = %v, want outermost first", chain)
	}
	if outer.Cause() != inner {
		t.Error("Cause() is not the failure underneath")
	}
	if len(inner.Causes()) != 1 {
		t.Errorf("a leaf failure's chain has %d entries, want 1", len(inner.Causes()))
	}
}

func TestADiagnosticReadsItsWireAndStops(t *testing.T) {
	d := Diagnostic{
		severity: "warning", code: "box_overflow", category: "layout",
		message: "content overflows its box", path: "sections.body.items[0]",
		args: map[string]any{"overflow": 1.5}, origin: "layout/flow.rs:120",
	}

	if !d.IsWarning() || d.IsError() {
		t.Error("severity predicates disagree with the wire")
	}
	for name, got := range map[string]string{
		"code": d.Code(), "category": d.Category(), "message": d.Message(),
		"path": d.Path(), "origin": d.Origin(), "severity": d.Severity(),
	} {
		if got == "" {
			t.Errorf("%s reads as empty", name)
		}
	}
	if d.Args()["overflow"] != 1.5 {
		t.Errorf("args = %v, want the engine's own values untouched", d.Args())
	}
	if want := "sections.body.items[0]: content overflows its box"; d.String() != want {
		t.Errorf("String() = %q, want %q", d.String(), want)
	}
	if bare := (Diagnostic{message: "no path"}); bare.String() != "no path" {
		t.Errorf("String() with no path = %q", bare.String())
	}
}

func TestTheVersionConstantTracksTheEngineWorkspace(t *testing.T) {
	// "In lockstep" made a checked claim rather than an intention. All seven
	// SDKs move with the engine while everything is pre-1.0.
	if got := engineWorkspaceVersion(t); got != Version {
		t.Errorf("Version = %q, want the engine workspace's %q", Version, got)
	}
}
