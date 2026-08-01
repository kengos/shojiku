package shojiku

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// The staging half of the transport: what happens when the workspace cannot
// hold what a call has to hand the engine. A directory this package created
// moments ago and owns alone can only fail this way when the machine is out
// of disk, so the rules are exercised directly rather than through a client.

func TestAWorkspaceRemembersItsFirstWriteFailureRatherThanReportingEachOne(t *testing.T) {
	ws := &workspace{dir: filepath.Join(t.TempDir(), "absent")}

	first := ws.write("params.json", []byte("{}"))
	second := ws.write("input.pdf", []byte("%PDF-"))

	if ws.failed() == nil {
		t.Fatal("a failed write was not remembered")
	}
	assertEngineFailure(t, ws.failed(), "could not write into the temporary directory")
	for _, path := range []string{first, second} {
		if filepath.Dir(path) != ws.dir {
			t.Errorf("write returned %q, want a path inside the workspace", path)
		}
	}
	// Both are registered for removal even though neither exists: cleanup
	// must not depend on which write got furthest.
	if len(ws.written) != 2 {
		t.Errorf("%d paths registered, want 2", len(ws.written))
	}
}

func TestAStagingFailureIsReportedAsAHostFailureRatherThanReachingTheEngine(t *testing.T) {
	// Running the engine over a file that was never written would come back
	// as a document that could not be read — a fact about the caller's
	// document that nobody determined.
	client := stubClient(t, stubBinary(t, `printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"`))
	ws := &workspace{dir: filepath.Join(t.TempDir(), "absent")}
	ws.write("params.json", []byte("{}"))

	_, _, err := client.settings.engine.execute(context.Background(), []string{"render"}, ws, nil)

	assertEngineFailure(t, err, "could not write into the temporary directory")
}

func TestMaterializingWritesBothHalvesOfACallerSuppliedSource(t *testing.T) {
	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		src := Source{Template: "version: 0.1.0", Definitions: "version: 0.2.0"}.materialize(ws)

		if ws.failed() != nil {
			t.Fatalf("staging failed: %v", ws.failed())
		}
		for name, path := range map[string]string{
			"template": src.template, "definitions": src.definitions,
		} {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("the %s was not written: %v", name, err)
			}
			if len(content) == 0 {
				t.Errorf("the %s is empty", name)
			}
		}
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMaterializingWritesNoDefinitionsWhenTheCallerSuppliedNone(t *testing.T) {
	if _, err := inWorkspace(func(ws *workspace) (*Result, error) {
		src := Source{Template: "version: 0.1.0", AssetsDir: "/assets"}.materialize(ws)

		if src.definitions != "" {
			t.Errorf("definitions = %q, want none", src.definitions)
		}
		if src.assetsDir != "/assets" {
			t.Errorf("assetsDir = %q, want the caller's own", src.assetsDir)
		}
		return &Result{}, nil
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAnEngineThatVanishesBetweenCallsIsAHostFailure(t *testing.T) {
	// The binary was proved to be an executable file when the client was
	// built, so this can only happen to a long-lived process whose engine was
	// replaced underneath it — which is exactly the deployment this reports
	// honestly rather than as a document that could not be rendered.
	client := stubClient(t, stubBinary(t, `printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"`))
	if err := client.settings.engine.requireReport(context.Background()); err != nil {
		t.Fatalf("probing: %v", err)
	}
	client.settings.engine.binary = &binary{path: t.TempDir(), source: "configuration"}

	_, err := client.Generate(context.Background(), "receipt", map[string]any{})

	assertEngineFailure(t, err, "could not run")
}

func TestAReportPathThatCannotBeReadIsAHostFailure(t *testing.T) {
	// The file opens and then refuses to be read — a directory standing where
	// the sidecar belongs is the shape a gate can actually produce.
	_, err := stubGenerate(t, `mkdir -p "$report"; exit 0`)

	assertEngineFailure(t, err, "could not be read")
}

func TestAUsageFailureOnVerifyIsAnErrorRatherThanAVerdict(t *testing.T) {
	// The two-level split applies to every operation, not only to render.
	client := stubClient(t, stubBinary(t, `printf '{"ok":false,"diagnostics":{"items":[]},`+
		`"failure":{"class":"usage","step":"verify","kind":"input","message":"bad invocation"}}' > "$report"
exit 1`))

	_, err := client.Verify(context.Background(), client.Artifact([]byte("%PDF-")),
		Anchors("/anchor.pem"))

	assertUsage(t, err, "bad invocation")
}

func TestATransportFailureOnEveryOperationStaysAHostFailure(t *testing.T) {
	// Not only on render: a sign or a verify whose report never arrives has
	// determined nothing about the document either, and must not come back as
	// a signature that failed or a verdict that did not pass.
	client := stubClient(t, stubBinary(t, `printf 'not json' > "$report"; exit 0`))
	artifact := client.Artifact([]byte("%PDF-"))
	provider, err := NewLocalPem(KeyPath("/k.pem"), CertPath("/c.pem"))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	_, signErr := client.Sign(context.Background(), artifact, provider)
	_, verifyErr := client.Verify(context.Background(), artifact, Anchors("/a.pem"))

	assertEngineFailure(t, signErr, "is not JSON")
	assertEngineFailure(t, verifyErr, "is not JSON")
}

func TestSigningWithNoProviderAtAllIsMisuse(t *testing.T) {
	_, err := newTestClient(t).Sign(context.Background(), rendered(t), nil)

	assertUsage(t, err, "signing needs a provider")
}

func TestEveryErrorNamesItsClass(t *testing.T) {
	// The class is what errors.Is matches on and what a caller branches on
	// without a type switch.
	for _, tc := range []struct {
		err   Error
		class error
	}{
		{&UsageError{Message: "m"}, ErrUsage},
		{&UnwrapError{Failure: &Failure{step: StepSign, kind: "k"}}, ErrUnwrap},
		{&BinaryNotFoundError{Message: "m"}, ErrBinaryNotFound},
		{&IncompatibleEngineError{Message: "m"}, ErrIncompatibleEngine},
		{&EngineFailureError{Message: "m"}, ErrEngineFailure},
	} {
		if got := tc.err.Class(); got != tc.class {
			t.Errorf("%T.Class() = %v, want %v", tc.err, got, tc.class)
		}
		if !errors.Is(tc.err, tc.class) {
			t.Errorf("errors.Is(%T, %v) is false", tc.err, tc.class)
		}
		if tc.err.Error() == "" {
			t.Errorf("%T has no message", tc.err)
		}
	}
}
