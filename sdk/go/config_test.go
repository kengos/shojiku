package shojiku

import (
	"context"
	"slices"
	"strings"
	"testing"
)

func TestAnExplicitOptionBeatsConfigureWhichBeatsTheEnvironment(t *testing.T) {
	t.Setenv("SHOJIKU_TEMPLATE_ROOT", "/from-env")
	t.Setenv("SHOJIKU_BIN", engineBinary(t))
	t.Cleanup(ResetConfiguration)

	fromEnv, err := NewClient()
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if fromEnv.TemplateRoot() != "/from-env" {
		t.Errorf("root = %q, want the environment's", fromEnv.TemplateRoot())
	}

	Configure(WithTemplates("/from-configure"))
	configured, err := NewClient()
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if configured.TemplateRoot() != "/from-configure" {
		t.Errorf("root = %q, want Configure's", configured.TemplateRoot())
	}

	explicit, err := NewClient(WithTemplates("/explicit"))
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if explicit.TemplateRoot() != "/explicit" {
		t.Errorf("root = %q, want the explicit option's", explicit.TemplateRoot())
	}
}

func TestTheBinaryResolvesTheOtherWayRound(t *testing.T) {
	// The deliberate asymmetry: WHERE THE ENGINE LIVES is a deployment
	// decision that has to be able to win over application code, while WHICH
	// TEMPLATES an application renders is the application's own.
	installed := engineBinary(t)
	t.Setenv("SHOJIKU_BIN", installed)
	t.Cleanup(ResetConfiguration)

	client, err := NewClient(WithBinary("/some/other/shojiku"))

	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if got := client.settings.engine.binary.path; got != installed {
		t.Errorf("binary = %q, want the environment's %q", got, installed)
	}
	if got := client.settings.engine.binary.source; got != "environment" {
		t.Errorf("source = %q, want %q", got, "environment")
	}
}

func TestStrictIsOredRatherThanOverridden(t *testing.T) {
	base := config{}

	on := base.merge([]Option{WithStrict(true)})
	if !on.strict {
		t.Error("WithStrict(true) did not take")
	}
	if lifted := on.merge([]Option{WithStrict(false)}); !lifted.strict {
		t.Error("a declared lockdown was lifted by a later option")
	}
	if never := base.merge([]Option{WithStrict(false)}); never.strict {
		t.Error("WithStrict(false) turned strictness on")
	}
}

func TestProvidersReplaceRatherThanMerge(t *testing.T) {
	// A client that declares its own registry is stating the whole set it may
	// sign with; quietly adding globally-registered keys would defeat that.
	global := testSigner(t)
	own := testSigner(t)
	Configure(WithProviders(map[string]*LocalPem{"global": global}))
	t.Cleanup(ResetConfiguration)

	merged := globalDefaults().merge([]Option{WithProviders(map[string]*LocalPem{"own": own})})

	if _, present := merged.providers["global"]; present {
		t.Error("the globally-registered provider survived into a client's own registry")
	}
	if merged.providers["own"] != own {
		t.Error("the client's own provider is missing")
	}
}

func TestARegisteredProviderMapIsCopiedRatherThanAliased(t *testing.T) {
	registry := map[string]*LocalPem{"release": testSigner(t)}

	merged := config{}.merge([]Option{WithProviders(registry)})
	delete(registry, "release")

	if merged.providers["release"] == nil {
		t.Error("mutating the caller's map changed the client's registry")
	}
}

func TestResetConfigurationDropsEveryDefault(t *testing.T) {
	// Public because a global that cannot be reset makes every test suite
	// invent its own teardown — and get it wrong.
	Configure(WithTemplates("/somewhere"), WithLang("ja-JP"), WithStrict(true))

	ResetConfiguration()

	if got := globalDefaults(); got.templates != nil || got.lang != nil || got.strict {
		t.Errorf("defaults survived the reset: %+v", got)
	}
}

func TestAPerCallLocaleBeatsTheClientWideOne(t *testing.T) {
	// Go's params are an ordinary argument, so the frozen rule applies
	// directly here rather than through a derived client. What the seven
	// mirror is the precedence, not the spelling.
	client := newTestClient(t, WithLang("en-US"))

	if got := firstNonEmpty(resolveCall([]CallOption{Lang("ja-JP")}).lang, client.settings.lang()); got != "ja-JP" {
		t.Errorf("lang = %q, want the per-call value", got)
	}
	if got := firstNonEmpty(resolveCall(nil).lang, client.settings.lang()); got != "en-US" {
		t.Errorf("lang = %q, want the client-wide value", got)
	}
}

func TestAPerCallLocaleReachesTheEngine(t *testing.T) {
	argvLog := t.TempDir() + "/argv"
	client := stubClient(t, stubBinary(t, `for arg in "$@"; do printf '%s\n' "$arg" >> `+
		argvLog+`; done
printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
exit 0`), WithLang("en-US"))

	if _, err := client.Generate(context.Background(), "receipt",
		map[string]any{}, Lang("ja-JP")); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	argv := readLines(t, argvLog)
	if !slices.Contains(argv, "ja-JP") {
		t.Errorf("the per-call locale did not cross:\n%s", strings.Join(argv, "\n"))
	}
	if slices.Contains(argv, "en-US") {
		t.Errorf("the client-wide locale crossed instead:\n%s", strings.Join(argv, "\n"))
	}
}

func TestNoLocaleAtAllPassesNoFlag(t *testing.T) {
	argvLog := t.TempDir() + "/argv"
	client := stubClient(t, stubBinary(t, `for arg in "$@"; do printf '%s\n' "$arg" >> `+
		argvLog+`; done
printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
exit 0`))

	if _, err := client.Generate(context.Background(), "receipt", map[string]any{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if slices.Contains(readLines(t, argvLog), "--lang") {
		t.Error("a locale flag crossed for a client that has none")
	}
}

func TestNoMemoizedDefaultClientShips(t *testing.T) {
	// A package-level singleton would add a reset-on-reconfigure lifecycle
	// that seven languages would each get subtly wrong. Two clients built
	// from the same configuration are two clients.
	Configure(WithTemplates(fixtureTemplates(t)), WithBinary(engineBinary(t)))
	t.Cleanup(ResetConfiguration)

	first, err := NewClient(WithEnv(false))
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	second, err := NewClient(WithEnv(false))
	if err != nil {
		t.Fatalf("building: %v", err)
	}

	if first == second {
		t.Error("two constructions returned one client")
	}
}

func TestBuildingAClientOverAMissingEngineFailsAtConstruction(t *testing.T) {
	// The reference opens its engine in the constructor so a container learns
	// at boot that the engine is not installed, rather than at the first
	// request.
	_, err := NewClient(WithEnv(false), WithBinary("/no/such/shojiku"))

	if err == nil {
		t.Fatal("a client was built over a binary that does not exist")
	}
	var notFound *BinaryNotFoundError
	if !asError(err, &notFound) {
		t.Fatalf("err = %v, want a BinaryNotFoundError", err)
	}
}
