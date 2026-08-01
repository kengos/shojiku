package shojiku

import (
	"context"
	"os"
	"slices"
	"testing"
)

func anchors(t *testing.T) VerifyOption {
	t.Helper()
	return Anchors(keyPath(t, "rsa2048.cert.pem"))
}

// tampered corrupts a byte INSIDE THE ORIGINAL BODY.
//
// Signing APPENDS a revision, so a flip at the signed file's midpoint lands
// in the appended part and leaves a container the verifier cannot parse a
// signature out of at all — which yields NO report, a different outcome from
// the "signature check failed, report still carried" one this exists to pin.
func tampered(t *testing.T) []byte {
	t.Helper()
	corrupted := signed(t).Bytes()
	at := len(rendered(t).Bytes()) * 6 / 10
	corrupted[at] ^= 0xff
	return corrupted
}

func TestNotCheckedSurvivesThroughTheBindingOnAPassingVerdict(t *testing.T) {
	// A "valid" verdict that quietly skipped revocation is worse than no
	// verifier at all: it turns a missing capability into a false assurance.
	client := newTestClient(t)

	result, err := client.Verify(context.Background(), signed(t), anchors(t))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the signed fixture did not verify: %v", result.Failure())
	}
	report := result.Report()
	if report == nil {
		t.Fatal("a passing verdict carries no report")
	}
	if !report.Valid() {
		t.Error("the report says the document is not valid on a passing verdict")
	}
	if len(report.NotChecked()) == 0 {
		t.Error("the passing verdict lost its notChecked list")
	}
	if !slices.Contains(report.NotChecked(), "revocation") {
		t.Errorf("notChecked = %v, want the engine's own entries", report.NotChecked())
	}
}

func TestNotCheckedSurvivesOnAFailingVerdictToo(t *testing.T) {
	client := newTestClient(t)

	result, err := client.Verify(context.Background(), client.Artifact(tampered(t)), anchors(t))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("a tampered document verified")
	}
	report := result.Report()
	if report == nil {
		t.Fatal("the failing verdict dropped its report")
	}
	if len(report.NotChecked()) == 0 {
		t.Error("the failing verdict lost its notChecked list")
	}
}

func TestAFailingVerdictIsAFailedResultThatStillCarriesTheReport(t *testing.T) {
	// Verification fails CLOSED: a caller who checks only Success() is not
	// told a forgery is fine.
	client := newTestClient(t)

	result, err := client.Verify(context.Background(), client.Artifact(tampered(t)), anchors(t))

	if err != nil {
		t.Fatalf("a failing verdict arrived as an error: %v", err)
	}
	if !result.Failed() {
		t.Fatal("a tampered document produced a successful result")
	}
	if result.Failure().Step() != StepVerify {
		t.Errorf("step = %q, want %q", result.Failure().Step(), StepVerify)
	}
	if result.Report().Valid() {
		t.Error("the report calls a tampered document valid")
	}
}

func TestTheFourChecksStaySeparate(t *testing.T) {
	// "The signature is valid but covers only part of the file" is a
	// different fact from "the signature is wrong", and a caller that cannot
	// tell them apart cannot explain the answer to anyone.
	client := newTestClient(t)

	result, err := client.Verify(context.Background(), client.Artifact(tampered(t)), anchors(t))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	report := result.Report()
	if report.Signature().Passed() {
		t.Error("the signature check passed on a tampered document")
	}
	if report.Signature().Reason == "" {
		t.Error("the failing check gives no reason")
	}
	for name, check := range map[string]VerificationCheck{
		"coverage":            report.Coverage(),
		"certificateValidity": report.CertificateValidity(),
		"trustChain":          report.TrustChain(),
	} {
		if !check.Passed() {
			t.Errorf("%s = %v, want it reported independently of the signature", name, check)
		}
	}
	if len(report.Checks()) != 4 {
		t.Errorf("Checks() has %d entries, want 4", len(report.Checks()))
	}
	if report.Signature().String() == "" {
		t.Error("a check has no printed form")
	}
}

func TestADocumentThatCannotBeEvaluatedAtAllHasNoReport(t *testing.T) {
	// Absent, not empty: "we could not look" is a different fact from "we
	// looked and found nothing wrong", and defaulting the field into an
	// all-passed shape would state the second.
	client := newTestClient(t)

	result, err := client.Verify(context.Background(), rendered(t), anchors(t))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("an unsigned document verified")
	}
	if result.Report() != nil {
		t.Errorf("an unevaluable document carries a report: %+v", result.Report())
	}
}

func TestAnchorsAreRequiredAndExplicit(t *testing.T) {
	client := newTestClient(t)
	artifact := signed(t)

	t.Run("neither form", func(t *testing.T) {
		_, err := client.Verify(context.Background(), artifact)
		assertUsage(t, err, "Verify needs")
	})

	t.Run("both forms", func(t *testing.T) {
		// Never a silent preference for one: preferring one ignores the
		// argument the caller meant, on the path where it matters most.
		_, err := client.Verify(context.Background(), artifact,
			anchors(t), AnchorsPEM([]byte("-----BEGIN CERTIFICATE-----")))
		assertUsage(t, err, "not both")
	})

	t.Run("an empty list", func(t *testing.T) {
		// The same statement as none at all. Left to the engine it would
		// refuse the INVOCATION, reaching the caller as a transport failure
		// rather than as the misuse it is.
		_, err := client.Verify(context.Background(), artifact, Anchors())
		assertUsage(t, err, "Verify needs")
	})

	t.Run("empty PEM bytes", func(t *testing.T) {
		// The same rule in the other form, which is the easier one to miss:
		// left to the engine, an empty anchors.pem would come back as a
		// document that could not be verified rather than as a caller who
		// supplied no anchors.
		for _, empty := range [][]byte{nil, {}} {
			_, err := client.Verify(context.Background(), artifact, AnchorsPEM(empty))
			assertUsage(t, err, "Verify needs")
		}
	})
}

func TestAnchorsSuppliedAsPemBytesVerifyTheSameDocument(t *testing.T) {
	pem, err := os.ReadFile(keyPath(t, "rsa2048.cert.pem"))
	if err != nil {
		t.Fatalf("reading the anchor: %v", err)
	}

	result, err := signed(t).Verify(context.Background(), AnchorsPEM(pem))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("verification against PEM bytes failed: %v", result.Failure())
	}
}

func TestVerificationRunsAgainstAnchorsTheCallerChoseRatherThanTheMachines(t *testing.T) {
	// There is no fallback to the machine's trust store, because the engine
	// never consults one — a document that verifies against the WRONG anchor
	// must not verify.
	result, err := signed(t).Verify(context.Background(),
		Anchors(keyPath(t, "ec256.cert.pem")))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("the document verified against an unrelated anchor")
	}
}

func TestAnArchivedDocumentCanBeReEnteredAndVerified(t *testing.T) {
	// The whole point of Artifact(bytes): bytes signed some time ago can be
	// checked without hand-building an artifact.
	client := newTestClient(t)
	archived := signed(t).Bytes()

	loaded := client.Artifact(archived)
	// Corrupting the caller's slice AFTERWARDS must not reach the artifact:
	// bytes are copied in as well as out, or a signature would be about
	// something other than what was checked.
	archived[0] = 'X'
	result, err := loaded.Verify(context.Background(), anchors(t))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the archived document did not verify: %v", result.Failure())
	}
	if !loaded.Loaded() || loaded.Origin() != OriginLoaded {
		t.Errorf("origin = %q, want %q", loaded.Origin(), OriginLoaded)
	}
	if _, ok := loaded.PageCount(); ok {
		t.Error("a re-entered document reports a page count nothing laid out")
	}
}
