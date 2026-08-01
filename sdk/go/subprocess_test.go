package shojiku

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
)

func assertEngineFailure(t *testing.T, err error, contains string) {
	t.Helper()
	if !errors.Is(err, ErrEngineFailure) {
		t.Fatalf("err = %v, want ErrEngineFailure", err)
	}
	if contains != "" && !strings.Contains(err.Error(), contains) {
		t.Errorf("message %q does not contain %q", err, contains)
	}
}

func assertUsage(t *testing.T, err error, contains string) {
	t.Helper()
	if !errors.Is(err, ErrUsage) {
		t.Fatalf("err = %v, want ErrUsage", err)
	}
	if contains != "" && !strings.Contains(err.Error(), contains) {
		t.Errorf("message %q does not contain %q", err, contains)
	}
}

// stubGenerate drives one render against a stub binary whose lifecycle
// behaviour is body.
func stubGenerate(t *testing.T, body string) (*Result, error) {
	t.Helper()
	return stubClient(t, stubBinary(t, body)).
		Generate(context.Background(), "receipt", map[string]any{})
}

func TestANonZeroExitWithNoReportIsAHostFailure(t *testing.T) {
	// Neither of the contract's two levels: nobody determined anything about
	// the document, so manufacturing a document failure would be a lie a
	// Success() check could swallow.
	_, err := stubGenerate(t, `echo "it broke" >&2; exit 3`)

	assertEngineFailure(t, err, "wrote no report")
	if !strings.Contains(err.Error(), "it broke") {
		t.Errorf("stderr is not quoted for a caller with nothing else to go on: %s", err)
	}
}

func TestAReportThatIsNotJsonIsAHostFailure(t *testing.T) {
	_, err := stubGenerate(t, `printf 'not json at all' > "$report"; exit 0`)

	assertEngineFailure(t, err, "is not JSON")
}

func TestJsonThatIsNotTheEnvelopeIsAHostFailure(t *testing.T) {
	_, err := stubGenerate(t, `printf '{"something":true}' > "$report"; exit 0`)

	assertEngineFailure(t, err, "not a report envelope")
}

func TestValidJsonWithTheWrongTypeIsNotReportedAsBrokenJson(t *testing.T) {
	// It parsed; it is simply not this envelope. Telling a caller "not JSON"
	// about valid JSON sends them looking in the wrong place.
	_, err := stubGenerate(t, `printf '{"ok":"yes"}' > "$report"; exit 0`)

	assertEngineFailure(t, err, "not a report envelope")
	if strings.Contains(err.Error(), "not JSON") {
		t.Errorf("valid JSON was reported as broken JSON: %s", err)
	}
}

func TestAReportPastTheReadCapIsRefusedRatherThanLoaded(t *testing.T) {
	_, err := stubGenerate(t,
		`{ printf '{"ok":true,"pad":"'; head -c 9000000 /dev/zero | tr '\0' 'a'; printf '"}'; } > "$report"; exit 0`)

	assertEngineFailure(t, err, "past this package's")
}

func TestAReportAtTheCapIsStillRead(t *testing.T) {
	// The reason one byte past the cap is read: a report AT the cap has to be
	// distinguishable from one past it.
	padding := strings.Repeat("a", maxReportBytes-len(`{"ok":true,"pad":""}`))

	rep, err := parseReport([]byte(`{"ok":true,"pad":"`+padding+`"}`), "")

	if err != nil {
		t.Fatalf("a report at the cap was refused: %v", err)
	}
	if !rep.ok {
		t.Error("the report at the cap did not read as ok")
	}
}

func TestABinaryThatWritesNothingAtAllIsAHostFailure(t *testing.T) {
	_, err := stubGenerate(t, `exit 0`)

	assertEngineFailure(t, err, "wrote no report")
}

func TestAnEngineWithoutTheReportCapabilityIsRefusedByName(t *testing.T) {
	path := stubBinaryWith(t, `exit 0`, `{"version":"0.0.1","capabilities":["text"]}`)

	_, err := stubClient(t, path).Generate(context.Background(), "receipt", map[string]any{})

	if !errors.Is(err, ErrIncompatibleEngine) {
		t.Fatalf("err = %v, want ErrIncompatibleEngine", err)
	}
	if !strings.Contains(err.Error(), reportCapability) {
		t.Errorf("the refusal does not name the capability key: %s", err)
	}
}

func TestACapabilityPayloadThatIsNotJsonIsAHostFailure(t *testing.T) {
	path := stubBinaryWith(t, `exit 0`, `{oops`)

	_, err := stubClient(t, path).EngineInfo(context.Background())

	assertEngineFailure(t, err, "not JSON")
}

func TestACapabilityPayloadThatIsNotAnObjectIsAHostFailure(t *testing.T) {
	for _, payload := range []string{`[1,2,3]`, `null`, `"a string"`} {
		t.Run(payload, func(t *testing.T) {
			path := stubBinaryWith(t, `exit 0`, payload)

			_, err := stubClient(t, path).EngineInfo(context.Background())

			assertEngineFailure(t, err, "not an object")
		})
	}
}

func TestAFailingCapabilitiesCallIsAHostFailure(t *testing.T) {
	// The probe's own process failing is a third thing again: the binary ran
	// and refused to say what it is.
	client := stubClient(t, rawStub(t, `echo "no such subcommand" >&2; exit 2`))

	_, err := client.EngineInfo(context.Background())

	assertEngineFailure(t, err, "exited 2")
	if !strings.Contains(err.Error(), "no such subcommand") {
		t.Errorf("stderr is not quoted: %s", err)
	}
}

func TestStderrOnASuccessfulRunIsIgnoredRatherThanParsed(t *testing.T) {
	// Prose is not a contract. A successful run that warned on stderr is a
	// success carrying whatever the REPORT said, and nothing else.
	result, err := stubGenerate(t,
		`echo "shojiku: warning[x] something" >&2; printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"; exit 0`)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the result failed: %v", result.Failure())
	}
	if len(result.Diagnostics()) != 0 {
		t.Errorf("stderr was parsed into %d diagnostics", len(result.Diagnostics()))
	}
}

func TestAnArgumentCarryingShellMetacharactersIsPassedThroughLiterally(t *testing.T) {
	// os/exec takes a slice and execs the binary directly: no shell runs, so
	// a value carrying $(…), a semicolon or a quote is ONE argument holding
	// those characters and nothing interprets it.
	hostile := `$(touch /tmp/pwned); rm -rf /; "'`
	argvLog := filepath.Join(t.TempDir(), "argv")
	client := stubClient(t, stubBinary(t, fmt.Sprintf(
		`for arg in "$@"; do printf '%%s\n' "$arg" >> %q; done
printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
exit 0`, argvLog)))

	result, err := client.GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who")), AssetsDir: hostile},
		map[string]any{"who": "x"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the call failed: %v", result.Failure())
	}
	logged, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("reading the recorded argv: %v", err)
	}
	if !slices.Contains(strings.Split(string(logged), "\n"), hostile) {
		t.Errorf("the hostile value did not cross as ONE argument; child saw:\n%s", logged)
	}
	if _, err := os.Stat("/tmp/pwned"); err == nil {
		t.Error("a shell interpreted the argument")
	}
}

func TestAnEngineInfoCallCrossesTheSameWayAsALifecycleCall(t *testing.T) {
	info, err := newTestClient(t).EngineInfo(context.Background())

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info["version"] == nil {
		t.Error("the payload carries no version")
	}
	if !hasCapability(info, reportCapability) {
		t.Errorf("the real engine does not advertise %q", reportCapability)
	}
}

func TestAProcessThatCannotBeStartedAtAllIsAHostFailure(t *testing.T) {
	// A running system cannot produce this on demand — the binary was proved
	// to be an executable file when the client was built — so the transport
	// is driven directly with a path that has since stopped being one.
	client := stubClient(t, stubBinary(t, `exit 0`))
	client.settings.engine.binary = &binary{path: t.TempDir(), source: "configuration"}
	client.settings.engine.probed = true

	_, _, _, err := client.settings.engine.spawn(context.Background(), []string{"render"}, nil)

	assertEngineFailure(t, err, "could not run")
}

func TestTheCapabilityProbeRunsOncePerEngine(t *testing.T) {
	// Asking a binary what it can do is a whole process; asking twice per
	// render would double the cost of every call.
	counter := stubBinary(t, `printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"; exit 0`)
	client := stubClient(t, counter)

	for range 3 {
		if _, err := client.Generate(context.Background(), "receipt", map[string]any{}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if !client.settings.engine.probed {
		t.Error("the engine was never marked as probed")
	}
}

func TestTheProbeStaysOncePerEngineUnderConcurrentCallers(t *testing.T) {
	// The clause the SDKs in languages without threads got for free. A Go
	// client is documented as safe for concurrent use, so "once" has to mean
	// once even when several goroutines arrive together.
	client := stubClient(t, stubBinary(t,
		`printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"; exit 0`))

	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = client.settings.engine.requireReport(context.Background())
		}()
	}
	wg.Wait()

	if !client.settings.engine.probed {
		t.Error("the engine was never marked as probed")
	}
}

func TestAFailingProbeIsRetriedRatherThanRemembered(t *testing.T) {
	// Only SUCCESS is remembered: a binary that could not answer once has not
	// been established to be incapable forever.
	client := stubClient(t, stubBinaryWith(t, `exit 0`, `{oops`))

	first := client.settings.engine.requireReport(context.Background())
	second := client.settings.engine.requireReport(context.Background())

	assertEngineFailure(t, first, "")
	assertEngineFailure(t, second, "")
	if client.settings.engine.probed {
		t.Error("a failed probe was remembered as a success")
	}
}

func TestAPerCallVariableReachesTheChildWithoutJoiningTheClientsEnvironment(t *testing.T) {
	base := []string{"HOME=/root"}

	composed := childEnv(base, map[string]string{"SHOJIKU_PASSPHRASE": "secret"})

	if len(composed) != 2 || composed[1] != "SHOJIKU_PASSPHRASE=secret" {
		t.Errorf("childEnv = %v, want the per-call variable appended", composed)
	}
	if len(base) != 1 {
		t.Error("the client's own environment was mutated")
	}
	if got := childEnv(base, nil); len(got) != 1 {
		t.Errorf("childEnv with nothing extra = %v, want the base unchanged", got)
	}
}
