package shojiku

import (
	"context"
	"strings"
	"testing"
)

func TestAUsageClassBecomesAnErrorRatherThanAFailedResult(t *testing.T) {
	// The engine saying the CALLER got it wrong — an unwritable output path,
	// a page past the end. That is programmer misuse, not a fact about a
	// document, so it must not arrive as something Success() can swallow.
	_, err := stubGenerate(t, `printf '{"ok":false,"diagnostics":{"items":[]},`+
		`"failure":{"class":"usage","step":"render","kind":"output","message":"failed to write output"}}' > "$report"
exit 1`)

	assertUsage(t, err, "the engine refused the call")
	if !strings.Contains(err.Error(), "failed to write output") {
		t.Errorf("the engine's own message is not carried: %s", err)
	}
}

func TestADocumentClassBecomesAFailedResultWithNoError(t *testing.T) {
	result, err := stubGenerate(t, `printf '{"ok":false,"diagnostics":{"items":[`+
		`{"severity":"error","code":"parse","message":"unknown field"}]},`+
		`"failure":{"class":"document","step":"render","kind":"parse","message":"failed to parse"}}' > "$report"
exit 1`)

	if err != nil {
		t.Fatalf("a refused document arrived as an error: %v", err)
	}
	if result.Success() {
		t.Fatal("the result succeeded")
	}
	if got := result.Failure().Kind(); got != "parse" {
		t.Errorf("kind = %q, want the engine's own spelling", got)
	}
	if len(result.Errors()) != 1 {
		t.Errorf("the failure carries %d error diagnostics, want 1", len(result.Errors()))
	}
}

func TestAnUnreadableInputFileIsADocumentFailureRatherThanMisuse(t *testing.T) {
	// It reads at first like the caller getting the invocation wrong; it is
	// not. The frozen contract already rules that an unusable key and an
	// unreadable anchor file are the second kind, and this pins that the real
	// engine agrees.
	client := newTestClient(t)
	artifact := client.Artifact([]byte("%PDF-1.7\n"))

	result, err := client.Verify(context.Background(), artifact, Anchors("/no/such/anchor.pem"))

	if err != nil {
		t.Fatalf("an unreadable input arrived as an error: %v", err)
	}
	if result.Success() {
		t.Fatal("verification succeeded against a missing anchor")
	}
}

func TestTheTraceStepIsThisPackagesOwnNotTheEnginesInternalStage(t *testing.T) {
	// The engine's report names an INTERNAL stage (`render`); reading it here
	// would make the field mean different things depending on which layer
	// refused. What the engine said specifically is the kind.
	result, err := stubGenerate(t, `printf '{"ok":false,"diagnostics":{"items":[]},`+
		`"failure":{"class":"document","step":"render","kind":"parse","message":"nope"}}' > "$report"
exit 1`)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := result.Failure().Step(); got != StepGenerate {
		t.Errorf("step = %q, want the SDK's own %q", got, StepGenerate)
	}
}

func TestDiagnosticsRideASuccessfulResult(t *testing.T) {
	// A render that WORKED can still have warned about an overflowing box,
	// and a caller that only looks at failures would never see it.
	result, err := newTestClient(t).Generate(context.Background(), "warns", map[string]any{})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the warning fixture did not render: %v", result.Failure())
	}
	if len(result.Warnings()) == 0 {
		t.Fatal("the successful render carries no warnings")
	}
	if len(result.Errors()) != 0 {
		t.Errorf("a successful render carries %d errors", len(result.Errors()))
	}
	if _, ok := result.Artifact().PageCount(); !ok {
		t.Error("a rendered artifact has no page count")
	}
}

func TestAMalformedFailureBlockIsTreatedAsAbsentRatherThanGuessedAt(t *testing.T) {
	// The ok flag already says which way the operation went; inventing a kind
	// an SDK branches on would be worse than reporting `unknown`.
	result, err := stubGenerate(t,
		`printf '{"ok":false,"diagnostics":{"items":[]},"failure":{}}' > "$report"; exit 1`)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := result.Failure().Kind(); got != "unknown" {
		t.Errorf("kind = %q, want %q", got, "unknown")
	}

	// And a failure the engine omitted entirely on a not-ok report.
	none, err := stubGenerate(t, `printf '{"ok":false,"diagnostics":{"items":[]}}' > "$report"; exit 1`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := none.Failure().Kind(); got != "unknown" {
		t.Errorf("kind = %q, want %q", got, "unknown")
	}
}

func TestAFailureBlockWithNoClassIsReadAsADocumentFailure(t *testing.T) {
	// The safer default of the two: treating an unlabelled failure as the
	// caller's would turn a refused document into an error.
	result, err := stubGenerate(t, `printf '{"ok":false,"diagnostics":{"items":[]},`+
		`"failure":{"kind":"parse","message":"nope"}}' > "$report"; exit 1`)

	if err != nil {
		t.Fatalf("an unlabelled failure was read as misuse: %v", err)
	}
	if result.Success() {
		t.Fatal("the result succeeded")
	}
}

func TestDiagnosticsThatAreNotTheItemsObjectYieldNoneRatherThanAGuess(t *testing.T) {
	for _, payload := range []string{
		`{"ok":true,"diagnostics":[]}`,
		`{"ok":true,"diagnostics":{"nope":[]}}`,
		`{"ok":true}`,
	} {
		rep, err := parseReport([]byte(payload), "")
		if err != nil {
			t.Fatalf("parsing %s: %v", payload, err)
		}
		if len(rep.diagnostics) != 0 {
			t.Errorf("%s yielded %d diagnostics", payload, len(rep.diagnostics))
		}
	}
}

func TestAnItemThatDoesNotReadIsSkippedWithoutLosingTheRest(t *testing.T) {
	rep, err := parseReport([]byte(
		`{"ok":true,"diagnostics":{"items":[{"severity":"warning","code":"a"},"nonsense",`+
			`{"severity":"error","code":"b","args":{"n":2}}]}}`), "")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rep.diagnostics) != 2 {
		t.Fatalf("got %d diagnostics, want the two readable ones", len(rep.diagnostics))
	}
	if rep.diagnostics[1].Args()["n"] != float64(2) {
		t.Errorf("args = %v, want the engine's own typed values", rep.diagnostics[1].Args())
	}
}
