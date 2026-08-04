package shojiku

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Signing with a key this process is never given.
//
// The engine hands out bytes, something else signs them, and the finished
// document has to verify. Nothing is stubbed: the function here runs `openssl`
// over the bytes it is handed, which is exactly the shape a cloud key service
// takes from this package's point of view.

// opensslSigner signs with a key this package never sees.
//
// `openssl dgst -sha256 -sign` produces exactly what the engine expects —
// PKCS#1 v1.5 bytes for an RSA key, an ASN.1 DER sequence for an EC one —
// which is also what AWS KMS and Google Cloud KMS return.
func opensslSigner(t *testing.T, stem string) func([]byte) ([]byte, error) {
	t.Helper()
	key := keyPath(t, stem+".key.pem")
	dir := t.TempDir()
	return func(toBeSigned []byte) ([]byte, error) {
		message := filepath.Join(dir, "to-be-signed.bin")
		if err := os.WriteFile(message, toBeSigned, 0o600); err != nil {
			return nil, err
		}
		signature := filepath.Join(dir, "signature.bin")
		out, err := exec.Command(
			"openssl", "dgst", "-sha256", "-sign", key, "-out", signature, message,
		).CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("openssl: %v: %s", err, out)
		}
		return os.ReadFile(signature)
	}
}

func externalSigner(t *testing.T, stem string, opts ...ExternalOption) *ExternalSigner {
	t.Helper()
	base := []ExternalOption{
		ExternalCert(keyPath(t, stem+".cert.pem")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	}
	provider, err := NewExternalSigner(opensslSigner(t, stem), append(base, opts...)...)
	if err != nil {
		t.Fatalf("building the external signer: %v", err)
	}
	return provider
}

func TestExternalSignerSignsADocumentThatThenVerifies(t *testing.T) {
	client := newTestClient(t)
	artifact := rendered(t)

	result, err := client.Sign(context.Background(), artifact, externalSigner(t, "rsa2048"))
	if err != nil || !result.Success() {
		t.Fatalf("signing failed: %v / %v", err, result.Failure())
	}
	// Append-only: the signed bytes begin with the input byte for byte.
	if !strings.HasPrefix(string(result.Artifact().Bytes()), string(artifact.Bytes())) {
		t.Error("signing rewrote the document instead of appending to it")
	}

	verified, err := client.Verify(context.Background(), result.Artifact(),
		Anchors(keyPath(t, "rsa2048.cert.pem")))
	if err != nil || !verified.Success() {
		t.Fatalf("the signed document did not verify: %v / %v", err, verified.Failure())
	}
}

func TestExternalSignerSignsWithAnEllipticCurveKey(t *testing.T) {
	provider := externalSigner(t, "ec256", ExternalAlgorithm(ECDSAP256SHA256))
	result, err := newTestClient(t).Sign(context.Background(), rendered(t), provider)
	if err != nil || !result.Success() {
		t.Fatalf("signing failed: %v / %v", err, result.Failure())
	}
}

func TestExternalSignerIsHandedTheSignedAttributesNotTheDocumentDigest(t *testing.T) {
	// The distinction the shorthand gets wrong: signing the digest instead
	// produces a document that fails verification, so this is pinned rather
	// than left to a doc comment.
	inner := opensslSigner(t, "rsa2048")
	var seen [][]byte
	provider, err := NewExternalSigner(
		func(toBeSigned []byte) ([]byte, error) {
			seen = append(seen, toBeSigned)
			return inner(toBeSigned)
		},
		ExternalCert(keyPath(t, "rsa2048.cert.pem")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	if _, err := newTestClient(t).Sign(context.Background(), rendered(t), provider); err != nil {
		t.Fatalf("signing failed: %v", err)
	}
	if len(seen) != 1 {
		t.Fatalf("the signing function ran %d times, want 1", len(seen))
	}
	// A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not the
	// 32-byte SHA-256 digest.
	if seen[0][0] != 0x31 {
		t.Errorf("the bytes to sign start with %#x, want a DER SET OF", seen[0][0])
	}
	if len(seen[0]) == 32 {
		t.Error("the signing function was handed something digest-sized")
	}
}

func TestExternalSignerRefusesASignatureThereIsNothingIn(t *testing.T) {
	provider, err := NewExternalSigner(
		func([]byte) ([]byte, error) { return nil, nil },
		ExternalCert(keyPath(t, "rsa2048.cert.pem")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	_, err = newTestClient(t).Sign(context.Background(), rendered(t), provider)
	var usage *UsageError
	if !errors.As(err, &usage) {
		t.Fatalf("an empty signature came back as %v, want a usage error", err)
	}
}

func TestExternalSignerLetsTheSigningFunctionsOwnFailureOut(t *testing.T) {
	// A key service outage is the caller's, not a fact about this document.
	unreachable := errors.New("the key service is unreachable")
	provider, err := NewExternalSigner(
		func([]byte) ([]byte, error) { return nil, unreachable },
		ExternalCert(keyPath(t, "rsa2048.cert.pem")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	_, err = newTestClient(t).Sign(context.Background(), rendered(t), provider)
	if !errors.Is(err, unreachable) {
		t.Fatalf("the signing function's own error came back as %v", err)
	}
}

func TestExternalSignerNeverAsksForASignatureWhenPreparingFailed(t *testing.T) {
	// An unreadable certificate is a fact about the inputs; paying for a
	// signature afterwards would tell the caller nothing new.
	asked := false
	provider, err := NewExternalSigner(
		func([]byte) ([]byte, error) { asked = true; return []byte("never reached"), nil },
		ExternalCert(filepath.Join(t.TempDir(), "no-such-certificate.pem")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	result, err := newTestClient(t).Sign(context.Background(), rendered(t), provider)
	if err != nil {
		t.Fatalf("an unreadable certificate came back as an error: %v", err)
	}
	if result.Success() {
		t.Error("an unreadable certificate produced a signed document")
	}
	if asked {
		t.Error("a signature was requested for a document that never got prepared")
	}
}

func TestExternalSignerTakesItsCertificateExplicitly(t *testing.T) {
	sign := func([]byte) ([]byte, error) { return []byte("x"), nil }

	if _, err := NewExternalSigner(sign,
		ExternalCert("signer.crt"),
		ExternalCertPEM([]byte("-----BEGIN CERTIFICATE-----")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	); err == nil || !strings.Contains(err.Error(), "not both") {
		t.Errorf("both forms at once came back as %v", err)
	}

	if _, err := NewExternalSigner(sign,
		ExternalAlgorithm(RSAPKCS1SHA256),
	); err == nil || !strings.Contains(err.Error(), "needs either") {
		t.Errorf("neither form came back as %v", err)
	}

	if _, err := NewExternalSigner(nil, ExternalCert("signer.crt")); err == nil ||
		!strings.Contains(err.Error(), "function that signs") {
		t.Errorf("a missing signing function came back as %v", err)
	}
}

func TestExternalSignerFromCertificateBytesInMemory(t *testing.T) {
	// So a certificate fetched from a secret manager never has to be written
	// to disk by the application.
	pem, err := os.ReadFile(keyPath(t, "rsa2048.cert.pem"))
	if err != nil {
		t.Fatalf("reading the generated certificate: %v", err)
	}
	provider, err := NewExternalSigner(opensslSigner(t, "rsa2048"),
		ExternalCertPEM(pem), ExternalAlgorithm(RSAPKCS1SHA256))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	result, err := newTestClient(t).Sign(context.Background(), rendered(t), provider)
	if err != nil || !result.Success() {
		t.Fatalf("signing failed: %v / %v", err, result.Failure())
	}
	if !strings.Contains(provider.String(), "[pem bytes]") {
		t.Errorf("the printed form does not say where the certificate came from: %s", provider)
	}
}

func TestExternalSignerPrintsNeitherTheFunctionNorAnythingElse(t *testing.T) {
	provider := externalSigner(t, "rsa2048", ExternalAlgorithm(ECDSAP256SHA256))

	for _, shown := range []string{
		provider.String(),
		fmt.Sprintf("%v", *provider),
		fmt.Sprintf("%#v", *provider),
	} {
		if !strings.Contains(shown, "ecdsa-p256-sha256") {
			t.Errorf("the printed form does not name the algorithm: %s", shown)
		}
		if strings.Contains(shown, "func") {
			t.Errorf("the printed form leaked the signing function: %s", shown)
		}
	}

	encoded, err := provider.MarshalJSON()
	if err != nil || strings.Contains(string(encoded), "func") {
		t.Errorf("serializing the provider leaked something: %s / %v", encoded, err)
	}
}

func TestExternalSignerSignsWhenRegisteredByName(t *testing.T) {
	// The provider a strict deployment may use is a NAMED one, and an
	// external signer is as nameable as a local key.
	client := strictClient(t, WithProviders(map[string]Provider{
		"kms": externalSigner(t, "rsa2048"),
	}))

	result, err := client.Sign(context.Background(), rendered(t), ProviderName("kms"))
	if err != nil || !result.Success() {
		t.Fatalf("a registered external signer did not sign: %v / %v", err, result.Failure())
	}
}

func TestExternalSignerIsRefusedAsABareValueWhenStrict(t *testing.T) {
	client := strictClient(t, WithProviders(map[string]Provider{
		"kms": externalSigner(t, "rsa2048"),
	}))

	_, err := client.Sign(context.Background(), rendered(t), externalSigner(t, "rsa2048"))
	if err == nil || !strings.Contains(err.Error(), "registered in configuration") {
		t.Fatalf("a bare provider value came back as %v", err)
	}
}

func TestANilExternalSignerIsRefusedRatherThanReachingTheTransport(t *testing.T) {
	var provider *ExternalSigner
	_, err := newTestClient(t).Sign(context.Background(), rendered(t), provider)
	if err == nil || !strings.Contains(err.Error(), "non-nil") {
		t.Fatalf("a nil provider came back as %v", err)
	}
}

func TestAProviderNameRegisteredUnderANameIsRefused(t *testing.T) {
	// A registry may only hold providers that carry material; resolving a
	// name to another name is a chain nobody meant to write.
	client := newTestClient(t, WithProviders(map[string]Provider{
		"kms": ProviderName("elsewhere"),
	}))

	_, err := client.Sign(context.Background(), rendered(t), ProviderName("kms"))
	if err == nil || !strings.Contains(err.Error(), "not signing material") {
		t.Fatalf("a name registered under a name came back as %v", err)
	}
}

// stubExternalCapabilities is what an engine WITH the two-step verbs answers.
const stubExternalCapabilities = `{"version":"9.9.9",` +
	`"capabilities":["cli.report","cli.sign.external"],"builtinLocales":["en-US"]}`

// externalStub drives a stub engine that answers `sign-prepare` with prepared
// and `sign-complete` with a document — the shapes only a stand-in can
// misbehave in.
func externalStub(t *testing.T, preparePayload string) *Client {
	t.Helper()
	body := fmt.Sprintf(`if [ "$1" = "sign-prepare" ]; then
    printf '%%s' '{"ok":true,"diagnostics":{"items":[]}%s}' > "$report"
    exit 0
fi
printf '%%s' '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
printf 'signed'
exit 0`, preparePayload)
	return stubClient(t, stubBinaryWith(t, body, stubExternalCapabilities))
}

func stubProvider(t *testing.T) *ExternalSigner {
	t.Helper()
	provider, err := NewExternalSigner(
		func([]byte) ([]byte, error) { return []byte("a signature"), nil },
		ExternalCertPEM([]byte("-----BEGIN CERTIFICATE-----")),
		ExternalAlgorithm(RSAPKCS1SHA256),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}
	return provider
}

func TestAnEngineWithoutTheTwoStepVerbsIsRefusedByName(t *testing.T) {
	// The FFI SDKs ask for an ABI revision before their first call; this is
	// that check in the shape a subprocess has.
	client := stubClient(t, stubBinary(t, `exit 0`))

	_, err := client.Sign(context.Background(), rendered(t), stubProvider(t))

	var incompatible *IncompatibleEngineError
	if !errors.As(err, &incompatible) ||
		!strings.Contains(err.Error(), externalCapability) {
		t.Fatalf("an engine without the verbs came back as %v", err)
	}
}

func TestAPrepareThatReportsNoBytesToSignIsAHostFailure(t *testing.T) {
	// A report that parses and is not this operation's envelope. Not a fact
	// about the document — the engine did not answer the question asked.
	_, err := externalStub(t, "").Sign(context.Background(), rendered(t), stubProvider(t))

	assertEngineFailure(t, err, "no bytes to sign")
}

func TestBytesToSignThatAreNotBase64AreAHostFailure(t *testing.T) {
	client := externalStub(t, `,"prepared":{"toBeSigned":"not base64 at all"}`)

	_, err := client.Sign(context.Background(), rendered(t), stubProvider(t))

	assertEngineFailure(t, err, "not base64")
}

func TestAPrepareThatWritesNoReportAtAllIsAHostFailure(t *testing.T) {
	client := stubClient(t, stubBinaryWith(t, `exit 1`, stubExternalCapabilities))

	_, err := client.Sign(context.Background(), rendered(t), stubProvider(t))

	assertEngineFailure(t, err, "wrote no report")
}

func TestACompleteThatWritesNoReportIsAHostFailure(t *testing.T) {
	// The second leg fails on its own: the first wrote a payload, the second
	// died. Both legs have to report, or the caller is told nothing.
	body := `if [ "$1" = "sign-prepare" ]; then
    printf '%s' '{"ok":true,"diagnostics":{"items":[]},"prepared":{"toBeSigned":"MTIz"}}' > "$report"
    exit 0
fi
exit 1`
	client := stubClient(t, stubBinaryWith(t, body, stubExternalCapabilities))

	_, err := client.Sign(context.Background(), rendered(t), stubProvider(t))

	assertEngineFailure(t, err, "wrote no report")
}
