package shojiku

import (
	"context"
	"strings"
	"testing"
)

// Each clause on its own. A lockdown tested as a whole reports "something was
// refused" and stops proving which rule did it.

func strictClient(t *testing.T, opts ...Option) *Client {
	t.Helper()
	return newTestClient(t, append([]Option{WithStrict(true)}, opts...)...)
}

func TestStrictRefusesTheBytesEntrance(t *testing.T) {
	_, err := strictClient(t).GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who"))}, map[string]any{"who": "x"})

	assertUsage(t, err, "GenerateSource is disabled")
}

func TestStrictRefusesSigningALoadedArtifact(t *testing.T) {
	// Bytes handed over whole are the caller's, exactly like a bytes-first
	// template.
	client := strictClient(t, WithProviders(map[string]*LocalPem{"release": testSigner(t)}))
	loaded := client.Artifact(rendered(t).Bytes())

	_, err := client.Sign(context.Background(), loaded, ProviderName("release"))

	assertUsage(t, err, "this one is loaded")
}

func TestStrictRefusesSigningASourceOriginArtifact(t *testing.T) {
	// The gap a boolean "was it loaded" would leave open: an artifact from a
	// bytes-first render has engine-laid-out bytes and a caller's template,
	// which is a third thing.
	client := strictClient(t, WithProviders(map[string]*LocalPem{"release": testSigner(t)}))
	fromSource := &DocumentArtifact{bytes: rendered(t).Bytes(), client: client, origin: OriginSource}

	_, err := client.Sign(context.Background(), fromSource, ProviderName("release"))

	assertUsage(t, err, "this one is source")
}

func TestStrictStillVerifiesANonRenderedArtifact(t *testing.T) {
	// Verification is never restricted: verifying bytes of unknown provenance
	// is the entire point of verify, and a locked-down deployment is
	// precisely the one that must check an archived document.
	client := strictClient(t)
	loaded := client.Artifact(signed(t).Bytes())

	result, err := client.Verify(context.Background(), loaded,
		Anchors(keyPath(t, "rsa2048.cert.pem")))

	if err != nil {
		t.Fatalf("a strict client refused to verify: %v", err)
	}
	if !result.Success() {
		t.Fatalf("the verdict failed: %v", result.Failure())
	}
}

func TestStrictRefusesAProviderValueInFavourOfARegisteredName(t *testing.T) {
	// So a key path never appears in request-handling code, and the material
	// loads into one value rather than being rebuilt per request.
	_, err := strictClient(t).Sign(context.Background(), rendered(t), testSigner(t))

	assertUsage(t, err, "not with a provider value")
}

func TestAnUnknownProviderNameIsNamedWithoutEchoingAnythingUnbounded(t *testing.T) {
	long := strings.Repeat("z", 300)

	_, err := newTestClient(t).Sign(context.Background(), rendered(t), ProviderName(long))

	assertUsage(t, err, "no signing provider named")
	if strings.Contains(err.Error(), strings.Repeat("z", textLimit+1)) {
		t.Errorf("the refusal echoed an unbounded name: %s", err)
	}
}

func TestANilProviderValueIsRefusedRatherThanReachingTheTransport(t *testing.T) {
	// The interface is closed, but a nil *LocalPem still satisfies it — and
	// would otherwise reach the transport as a provider with no material.
	var missing *LocalPem

	_, err := newTestClient(t).Sign(context.Background(), rendered(t), missing)

	assertUsage(t, err, "non-nil")
}

func TestConfiguredStrictnessSurvivesACallSiteAskingForFalse(t *testing.T) {
	// The ONE place configuration beats a call site: a restriction an
	// operator declared must not be liftable by application code.
	Configure(WithStrict(true))
	t.Cleanup(ResetConfiguration)

	client := newTestClient(t, WithStrict(false))
	_, err := client.GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who"))}, map[string]any{"who": "x"})

	assertUsage(t, err, "GenerateSource is disabled")
}

func TestANamedProviderIsAcceptedOutsideStrictToo(t *testing.T) {
	// Naming providers is good practice everywhere; only the REFUSAL of the
	// alternative belongs to strict.
	client := newTestClient(t, WithProviders(map[string]*LocalPem{"release": testSigner(t)}))

	result, err := client.Sign(context.Background(), rendered(t), ProviderName("release"))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("signing failed: %v", result.Failure())
	}
}

func TestSigningInheritsTheOriginOfWhatItSigned(t *testing.T) {
	// Appending a revision does not launder where a document came from.
	client := newTestClient(t)
	source, err := client.GenerateSource(context.Background(),
		Source{Template: sourceTemplate(textItem("who")), AssetsDir: sourceAssets(t)},
		map[string]any{"who": "Origin Test"})
	if err != nil || !source.Success() {
		t.Fatalf("the bytes-first render failed: %v / %v", err, source.Failure())
	}

	result, err := client.Sign(context.Background(), source.Artifact(), testSigner(t))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("signing failed: %v", result.Failure())
	}
	if got := result.Artifact().Origin(); got != OriginSource {
		t.Errorf("origin = %q, want it inherited as %q", got, OriginSource)
	}
}
