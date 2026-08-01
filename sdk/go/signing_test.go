package shojiku

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestNewLocalPemRefusesBothFormsOfTheSameMaterial(t *testing.T) {
	// Explicit, never sniffed, in BOTH directions: accepting both forms and
	// silently preferring one ignores the argument the caller meant, on the
	// path where reading the wrong key matters most.
	_, err := NewLocalPem(KeyPath("k.pem"), KeyPEM([]byte("-----BEGIN")), CertPath("c.pem"))

	assertUsage(t, err, "not both")
}

func TestNewLocalPemNeedsEachHalfInSomeForm(t *testing.T) {
	if _, err := NewLocalPem(CertPath("c.pem")); !errors.Is(err, ErrUsage) {
		t.Errorf("a provider with no key was accepted: %v", err)
	}
	if _, err := NewLocalPem(KeyPath("k.pem")); !errors.Is(err, ErrUsage) {
		t.Errorf("a provider with no certificate was accepted: %v", err)
	}
	if _, err := NewLocalPem(); !errors.Is(err, ErrUsage) {
		t.Errorf("a provider with nothing at all was accepted: %v", err)
	}
}

func TestAProviderPrintsNoMaterialInAnyOfGosFormattingVerbs(t *testing.T) {
	// Unexported fields already hide the material from encoding/json and from
	// any logger that reflects over a value. What they do NOT cover is fmt,
	// which prints unexported fields for every one of these verbs.
	provider, err := NewLocalPem(
		KeyPEM([]byte("-----BEGIN PRIVATE KEY-----\nSUPERSECRETKEY\n")),
		CertPEM([]byte("-----BEGIN CERTIFICATE-----\nCERTBODY\n")),
		Passphrase("hunter2"),
	)
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	for verb, printed := range map[string]string{
		"%v": fmt.Sprintf("%v", provider),
		// The lint here would have us call String() directly, which is
		// exactly what this must NOT do: the claim is that the VERB
		// redacts, for a caller who never thinks about String at all.
		"%s":  fmt.Sprintf("%s", provider), //nolint:staticcheck // the verb is the subject
		"%+v": fmt.Sprintf("%+v", provider),
		"%#v": fmt.Sprintf("%#v", provider),
		// The value form as well as the pointer: String is on the value
		// receiver precisely so a copy redacts too.
		"%v (value)":  fmt.Sprintf("%v", *provider),
		"%+v (value)": fmt.Sprintf("%+v", *provider),
		"%#v (value)": fmt.Sprintf("%#v", *provider),
	} {
		for _, secret := range []string{"SUPERSECRETKEY", "CERTBODY", "hunter2"} {
			if strings.Contains(printed, secret) {
				t.Errorf("%s printed %q: %s", verb, secret, printed)
			}
		}
		if !strings.Contains(printed, "[pem bytes]") {
			t.Errorf("%s does not say which form the material came from: %s", verb, printed)
		}
		if !strings.Contains(printed, "[redacted]") {
			t.Errorf("%s does not mark the passphrase: %s", verb, printed)
		}
	}
}

func TestAProviderRedactsWhenSerializedAsJson(t *testing.T) {
	provider, err := NewLocalPem(KeyPEM([]byte("SECRETKEY")), CertPEM([]byte("CERTBODY")))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	encoded, err := json.Marshal(map[string]any{"signer": provider})

	if err != nil {
		t.Fatalf("marshalling: %v", err)
	}
	if bytes.Contains(encoded, []byte("SECRETKEY")) {
		t.Errorf("the JSON form carries the key: %s", encoded)
	}
}

func TestAConfiguredPathIsShownBecauseItIsNotSecret(t *testing.T) {
	// The one thing worth seeing when a provider loaded the wrong material.
	provider, err := NewLocalPem(KeyPath("/etc/ssl/signer.key"), CertPath("/etc/ssl/signer.crt"))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	printed := provider.String()

	if !strings.Contains(printed, "/etc/ssl/signer.crt") {
		t.Errorf("the certificate path is hidden: %s", printed)
	}
	if !strings.Contains(printed, "passphrase=none") {
		t.Errorf("a provider with no passphrase does not say so: %s", printed)
	}
}

func TestThePassphraseCrossesInTheChildsEnvironmentNeverInArgv(t *testing.T) {
	// argv is readable by other processes on most systems and lands in shell
	// history, which is why the CLI offers no flag that takes one.
	argvLog := t.TempDir() + "/argv"
	envLog := t.TempDir() + "/env"
	client := stubClient(t, stubBinary(t, fmt.Sprintf(
		`for arg in "$@"; do printf '%%s\n' "$arg" >> %q; done
printf '%%s' "${SHOJIKU_PASSPHRASE:-unset}" > %q
printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
exit 0`, argvLog, envLog)))
	provider, err := NewLocalPem(KeyPath("/k.pem"), CertPath("/c.pem"), Passphrase("hunter2"))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	if _, err := client.Sign(context.Background(),
		client.Artifact([]byte("%PDF-")), provider); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	argv, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("reading the recorded argv: %v", err)
	}
	if strings.Contains(string(argv), "hunter2") {
		t.Errorf("the passphrase is in argv:\n%s", argv)
	}
	if !strings.Contains(string(argv), "--passphrase-env") {
		t.Errorf("the variable's NAME did not cross:\n%s", argv)
	}
	child, err := os.ReadFile(envLog)
	if err != nil {
		t.Fatalf("reading the recorded environment: %v", err)
	}
	if string(child) != "hunter2" {
		t.Errorf("the child saw %q, want the passphrase in its environment", child)
	}
}

func TestNoPassphraseMeansNoVariableAtAll(t *testing.T) {
	argvLog := t.TempDir() + "/argv"
	client := stubClient(t, stubBinary(t, fmt.Sprintf(
		`for arg in "$@"; do printf '%%s\n' "$arg" >> %q; done
printf '{"ok":true,"diagnostics":{"items":[]}}' > "$report"
exit 0`, argvLog)))
	provider, err := NewLocalPem(KeyPath("/k.pem"), CertPath("/c.pem"))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	if _, err := client.Sign(context.Background(),
		client.Artifact([]byte("%PDF-")), provider); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	argv, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("reading the recorded argv: %v", err)
	}
	if strings.Contains(string(argv), "--passphrase-env") {
		t.Errorf("a passphrase flag crossed for a provider that has none:\n%s", argv)
	}
}

func TestSigningWithMaterialHandedOverAsBytesRoundTrips(t *testing.T) {
	// A key fetched from a secret manager never has to be written to disk by
	// the application; only this package writes it, 0600 inside a 0700
	// directory that is removed on every path.
	key, err := os.ReadFile(keyPath(t, "rsa2048.key.pem"))
	if err != nil {
		t.Fatalf("reading the key: %v", err)
	}
	cert, err := os.ReadFile(keyPath(t, "rsa2048.cert.pem"))
	if err != nil {
		t.Fatalf("reading the certificate: %v", err)
	}
	provider, err := NewLocalPem(KeyPEM(key), CertPEM(cert))
	if err != nil {
		t.Fatalf("building the provider: %v", err)
	}

	result, err := rendered(t).Sign(context.Background(), provider)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("signing with bytes failed: %v", result.Failure())
	}
}

func TestAnEncryptedKeySignsWithItsPassphrase(t *testing.T) {
	provider := testSigner(t,
		KeyPath(keyPath(t, "rsa2048.enc.pem")),
		Passphrase(passphrase(t)),
	)

	result, err := rendered(t).Sign(context.Background(), provider)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success() {
		t.Fatalf("signing with an encrypted key failed: %v", result.Failure())
	}
}

func TestAnUnusableKeyIsAFailedResultRatherThanAnError(t *testing.T) {
	// A key below the backend's signing floor is a fact about the material,
	// which the contract already rules is the second failure level.
	provider := testSigner(t, KeyPath(keyPath(t, "rsa1024.key.pem")))

	result, err := rendered(t).Sign(context.Background(), provider)

	if err != nil {
		t.Fatalf("an unusable key arrived as an error: %v", err)
	}
	if result.Success() {
		t.Fatal("a key below the signing floor was accepted")
	}
	if result.Failure().Step() != StepSign {
		t.Errorf("step = %q, want %q", result.Failure().Step(), StepSign)
	}
}

func TestAnUnreadableKeyPathIsAFailedResultReportedByTheEngine(t *testing.T) {
	// A path the caller configured crosses AS a path rather than being copied
	// into a temporary file — so an unreadable one is reported by the ENGINE,
	// arriving as a failed result of kind `io` rather than under a host-side
	// kind of this package's own. It is a failed result either way, which is
	// what the contract actually fixes.
	provider := testSigner(t, KeyPath("/no/such/key.pem"))

	result, err := rendered(t).Sign(context.Background(), provider)

	if err != nil {
		t.Fatalf("an unreadable key arrived as an error: %v", err)
	}
	if result.Success() {
		t.Fatal("a missing key signed")
	}
	if got := result.Failure().Kind(); got != "io" {
		t.Errorf("kind = %q, want the engine's own %q", got, "io")
	}
}

func TestNoFailureMessageEchoesKeyMaterialOrAPassphrase(t *testing.T) {
	secret := passphrase(t)
	provider := testSigner(t, KeyPath(keyPath(t, "rsa2048.enc.pem")), Passphrase("wrong-"+secret))

	result, err := rendered(t).Sign(context.Background(), provider)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Success() {
		t.Fatal("the wrong passphrase signed")
	}
	whole := result.Failure().String()
	for _, d := range result.Diagnostics() {
		whole += " " + d.String()
	}
	if strings.Contains(whole, secret) {
		t.Errorf("the failure echoes the passphrase: %s", whole)
	}
}

func TestSignedBytesBeginWithTheInputByteForByte(t *testing.T) {
	// Signing APPENDS a revision; it never rewrites what was there.
	original := rendered(t).Bytes()

	signedBytes := signed(t).Bytes()

	if len(signedBytes) <= len(original) {
		t.Fatalf("the signed document is %d bytes, not longer than the %d it signed",
			len(signedBytes), len(original))
	}
	if !bytes.Equal(signedBytes[:len(original)], original) {
		t.Error("the signed document does not begin with the bytes it signed")
	}
}
