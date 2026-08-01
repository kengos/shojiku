package shojiku

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func readLines(t *testing.T, path string) []string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	return strings.Split(strings.TrimSpace(string(raw)), "\n")
}

func asError(err error, target any) bool { return errors.As(err, target) }

func TestGenerateProducesAPdfWithThePageCountTheEngineReported(t *testing.T) {
	result, err := newTestClient(t).Generate(context.Background(), "receipt",
		map[string]any{"customer": map[string]any{"name": "Yamada Shoji K.K."}})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the render failed: %v", result.Failure())
	}
	artifact := result.Artifact()
	if !strings.HasPrefix(string(artifact.Bytes()), "%PDF-") {
		t.Error("the bytes are not a PDF")
	}
	pages, ok := artifact.PageCount()
	if !ok || pages != 1 {
		t.Errorf("page count = %d/%v, want 1", pages, ok)
	}
	if artifact.Origin() != OriginRendered || artifact.Loaded() {
		t.Errorf("origin = %q, want %q", artifact.Origin(), OriginRendered)
	}
	if result.Report() != nil {
		t.Error("a render result carries a verification report")
	}
}

func TestABrokenTemplateIsADocumentFailureCarryingErrorDiagnostics(t *testing.T) {
	result, err := newTestClient(t).Generate(context.Background(), "broken", map[string]any{})

	if err != nil {
		t.Fatalf("a refused document arrived as an error: %v", err)
	}
	if result.Success() {
		t.Fatal("the broken fixture rendered")
	}
	if len(result.Errors()) == 0 {
		t.Error("the refusal carries no error diagnostics")
	}
	if result.Artifact() != nil {
		t.Error("a failed render carries an artifact")
	}
	if result.Failure().Step() != StepGenerate {
		t.Errorf("step = %q, want %q", result.Failure().Step(), StepGenerate)
	}
}

func TestASignedDocumentReportsNoPageCount(t *testing.T) {
	// Signing appends a revision to bytes it never laid out, and a zero would
	// read as "a document with no pages".
	if _, ok := signed(t).PageCount(); ok {
		t.Error("a signed artifact reports a page count")
	}
	if signed(t).Origin() != OriginRendered {
		t.Errorf("origin = %q, want it inherited from what was signed", signed(t).Origin())
	}
}

func TestTheWholeLifecycleRoundTrips(t *testing.T) {
	client := newTestClient(t)
	ctx := context.Background()

	generated, err := client.Generate(ctx, "receipt",
		map[string]any{"customer": map[string]any{"name": "Round Trip"}})
	if err != nil || !generated.Success() {
		t.Fatalf("generate: %v / %v", err, generated.Failure())
	}

	signedResult, err := generated.Artifact().Sign(ctx, testSigner(t))
	if err != nil || !signedResult.Success() {
		t.Fatalf("sign: %v / %v", err, signedResult.Failure())
	}

	verified, err := signedResult.Artifact().Verify(ctx,
		Anchors(keyPath(t, "rsa2048.cert.pem")))
	if err != nil || !verified.Success() {
		t.Fatalf("verify: %v / %v", err, verified.Failure())
	}
	if !verified.Report().Valid() {
		t.Error("the round-tripped document is not valid")
	}
}

func TestWritingADocumentPutsTheBytesOnDisk(t *testing.T) {
	path := filepath.Join(t.TempDir(), "receipt.pdf")

	written, err := rendered(t).Write(path)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if written != path {
		t.Errorf("Write returned %q, want %q", written, path)
	}
	onDisk, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading it back: %v", err)
	}
	if len(onDisk) != rendered(t).Size() {
		t.Errorf("wrote %d bytes, want %d", len(onDisk), rendered(t).Size())
	}
}

func TestWritingToAPathThatCannotBeCreatedIsMisuse(t *testing.T) {
	_, err := rendered(t).Write(filepath.Join(t.TempDir(), "absent", "receipt.pdf"))

	assertUsage(t, err, "could not write")
}

func TestACancelledContextStopsTheCallRatherThanTheSdkTimingItOut(t *testing.T) {
	// There is deliberately no wall-clock timeout: how long a render may take
	// is a property of the document, not of the transport. What the caller's
	// own context does offer is cancellation.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := newTestClient(t).Generate(ctx, "receipt", map[string]any{})

	if err == nil {
		t.Fatal("a cancelled context still rendered")
	}
}

func TestOneClientRendersIdenticalBytesFromSeveralGoroutines(t *testing.T) {
	// Concurrency is stated, not assumed. Each call runs its own child
	// process with its own private workspace; the only shared state is the
	// once-per-binary probe.
	client := newTestClient(t)
	params := map[string]any{"customer": map[string]any{"name": "Concurrent"}}

	var wg sync.WaitGroup
	results := make([][]byte, 4)
	errs := make([]error, 4)
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := client.Generate(context.Background(), "receipt", params)
			if err != nil {
				errs[i] = err
				return
			}
			if !result.Success() {
				errs[i] = result.Err()
				return
			}
			results[i] = result.Artifact().Bytes()
		}()
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d: %v", i, err)
		}
	}
	for i := 1; i < len(results); i++ {
		if string(results[i]) != string(results[0]) {
			t.Errorf("goroutine %d produced different bytes; rendering is deterministic", i)
		}
	}
}

func TestTheLogChannelReportsWhatTheBindingDidAndNothingAboutTheDocument(t *testing.T) {
	// A log line is the easiest way for a secret to leave a process, and a
	// diagnostic belongs to the Result the caller already holds.
	logger := &recordingLogger{}
	client := newTestClient(t, WithLogger(logger))

	result, err := client.Generate(context.Background(), "warns",
		map[string]any{"customer": map[string]any{"name": "Logged Secret Name"}})
	if err != nil || !result.Success() {
		t.Fatalf("the render failed: %v / %v", err, result.Failure())
	}

	written := logger.joined()
	for _, wanted := range []string{"binary_found", "engine_checked", "generate", "ok=true", "ms="} {
		if !strings.Contains(written, wanted) {
			t.Errorf("the channel never reported %q:\n%s", wanted, written)
		}
	}
	if !strings.Contains(written, "template=warns") {
		t.Errorf("the channel does not name which template ran:\n%s", written)
	}
	for _, forbidden := range []string{"Logged Secret Name", "%PDF-"} {
		if strings.Contains(written, forbidden) {
			t.Errorf("the channel carried %q:\n%s", forbidden, written)
		}
	}
	for _, d := range result.Diagnostics() {
		if d.Message() != "" && strings.Contains(written, d.Message()) {
			t.Errorf("the channel carried a diagnostic:\n%s", written)
		}
	}
}

func TestTheLogChannelIsSilentByDefault(t *testing.T) {
	// A silent log costs a nil check, not string formatting.
	silent := &logSink{}

	silent.event("binary_found", "path", "/somewhere")
	result, err := silent.timed(StepGenerate, func() (*Result, error) {
		return succeededWithArtifact(nil, nil), nil
	})

	if err != nil || !result.Success() {
		t.Fatalf("timed did not pass the result through: %v / %v", err, result)
	}
}

func TestTheLogChannelRecordsAFailedCallAsAVerdictToo(t *testing.T) {
	logger := &recordingLogger{}
	sink := &logSink{logger: logger}
	sentinel := errors.New("no")

	if _, err := sink.timed(StepSign, func() (*Result, error) {
		return nil, sentinel
	}); !errors.Is(err, sentinel) {
		t.Fatalf("timed swallowed the error: %v", err)
	}

	if !strings.Contains(logger.joined(), "ok=false") {
		t.Errorf("a failed call was not recorded as one:\n%s", logger.joined())
	}
}
