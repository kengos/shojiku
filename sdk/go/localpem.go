package shojiku

import (
	"context"
	"fmt"
)

// Provider names the material a signature is made with.
//
// A closed interface — its method is unexported, so nothing outside this
// package can implement it — with two forms: a [LocalPem] value, and a
// [ProviderName] naming one registered in configuration. An interface rather
// than an `any` argument so a wrong type is a compile error, and rather than
// two Sign methods so a strict deployment's refusal is about the VALUE the
// call site passed instead of about which method it reached for.
//
// The lockdown's rules live on the two implementations rather than in a type
// switch: "look this name up" and "is a bare value allowed here" are what the
// two forms differ IN, so that is what the method is.
type Provider interface {
	resolve(*lockdown) (signer, error)
}

// signer is a provider that carries its own material, which is what a
// registry may hold and what [Client.Sign] finally calls.
//
// The polymorphic hook is signWith, so Client.Sign branches on nothing: what
// differs between a key in this process and one in a cloud service is HOW a
// signature is produced, which is exactly what the method is. Unexported, so
// the set of providers stays closed to this package.
type signer interface {
	Provider
	signWith(ctx context.Context, c *Client, artifact *DocumentArtifact) (*Result, error)
}

// ProviderName is the name of a signing provider registered with
// [WithProviders]. A strict client takes this form only.
type ProviderName string

// resolve looks the name up. Registered names are accepted in strict mode and
// out of it — naming providers is good practice everywhere, and only the
// REFUSAL of the alternative belongs to strict.
func (n ProviderName) resolve(l *lockdown) (signer, error) {
	registered, found := l.providers[string(n)]
	if !found {
		return nil, usagef("no signing provider named `%s` is registered", bounded(string(n)))
	}
	// A registry may only hold providers that CARRY material. Registering a
	// name under a name would resolve to another lookup, and the honest
	// answer to that is a refusal rather than a chain nobody meant to write.
	material, ok := registered.(signer)
	if !ok {
		return nil, usagef("the provider registered as `%s` is a name, not signing material",
			bounded(string(n)))
	}
	return material, nil
}

// resolve accepts the value itself, unless this client is locked down.
func (p *LocalPem) resolve(l *lockdown) (signer, error) {
	// The interface is closed, but a NIL *LocalPem still satisfies it and
	// would otherwise reach the transport as a provider with no material.
	if p == nil {
		return nil, usagef("a signing provider must be a non-nil *LocalPem or a ProviderName")
	}
	if l.strict {
		return nil, usagef("this client is strict: sign with the name of a provider " +
			"registered in configuration, not with a provider value.")
	}
	return p, nil
}

// signWith signs with the key this process holds.
func (p *LocalPem) signWith(
	ctx context.Context, c *Client, artifact *DocumentArtifact,
) (*Result, error) {
	return inWorkspace(func(ws *workspace) (*Result, error) {
		input := ws.write("input.pdf", artifact.bytes)
		// A configured PATH goes across as itself; only material the caller
		// handed over as BYTES is written down, and then only 0600 inside a
		// 0700 directory that is removed on every path.
		key := materialPath(ws, "key.pem", p.keyPath, p.keyPEM)
		cert := materialPath(ws, "cert.pem", p.certPath, p.certPEM)

		var extraEnv map[string]string
		variable := ""
		if p.passphrase != "" {
			// The passphrase crosses in the CHILD's environment only — never
			// in argv, which other processes can read.
			variable = passphraseVariable
			extraEnv = map[string]string{passphraseVariable: p.passphrase}
		}
		rep, pdf, err := c.settings.engine.execute(
			ctx, signArgs(input, key, cert, variable), ws, extraEnv)
		if err != nil {
			return nil, err
		}
		return documentOutcome(rep, pdf, StepSign, c, artifact.origin)
	})
}

// LocalPem is a signing provider backed by a PEM key and certificate.
//
// The only provider this release has. KMS and HSM providers are a recorded
// deferral, which is why this is a named type rather than a pair of arguments
// on Sign — a second provider then adds a type, not a signature change in
// seven languages.
//
// The material comes either from paths ([KeyPath], [CertPath]) or from bytes
// already in memory ([KeyPEM], [CertPEM]), so a key fetched from a secret
// manager never has to be written to disk first. Which one you passed is
// explicit rather than sniffed: guessing whether a string is a path or a PEM
// body is exactly the kind of cleverness that reads the wrong file.
//
// Redaction is why every field here is unexported and why the printed forms
// are overridden. Unexported fields already keep the material out of
// encoding/json and out of any logger that reflects over a value; what they
// do NOT cover is fmt, which prints unexported fields for %v, %+v and %#v
// alike. String covers the first two and GoString the third, both on the
// value receiver so a copied LocalPem redacts as well as a pointer to one.
// Go needs no counterpart to PHP's #[\SensitiveParameter]: a Go panic does
// not print the arguments a function was called with.
type LocalPem struct {
	keyPath    string
	certPath   string
	keyPEM     []byte
	certPEM    []byte
	passphrase string
}

// PemOption configures a [LocalPem].
type PemOption func(*LocalPem)

// KeyPath names the signing key's PKCS#8 PEM file.
func KeyPath(path string) PemOption { return func(p *LocalPem) { p.keyPath = path } }

// CertPath names the signer's X.509 certificate file, as PEM.
func CertPath(path string) PemOption { return func(p *LocalPem) { p.certPath = path } }

// KeyPEM supplies the signing key as bytes already in memory.
func KeyPEM(pem []byte) PemOption { return func(p *LocalPem) { p.keyPEM = pem } }

// CertPEM supplies the certificate as bytes already in memory.
func CertPEM(pem []byte) PemOption { return func(p *LocalPem) { p.certPEM = pem } }

// Passphrase supplies the key's passphrase. It crosses to the engine in the
// child process's environment, never in its argv.
func Passphrase(secret string) PemOption { return func(p *LocalPem) { p.passphrase = secret } }

// NewLocalPem builds a provider from paths or from bytes.
func NewLocalPem(opts ...PemOption) (*LocalPem, error) {
	provider := &LocalPem{}
	for _, opt := range opts {
		opt(provider)
	}
	if err := oneSource(provider.keyPath, provider.keyPEM, "Key"); err != nil {
		return nil, err
	}
	if err := oneSource(provider.certPath, provider.certPEM, "Cert"); err != nil {
		return nil, err
	}
	return provider, nil
}

// oneSource enforces explicit, never sniffed, in BOTH directions.
//
// Guessing whether a string is a path or a PEM body is how the wrong file
// gets read; accepting both forms and silently preferring one ignores the
// argument the caller meant, which is the same mistake one layer quieter.
func oneSource(path string, pem []byte, what string) error {
	forms := fmt.Sprintf("%sPath (a path) or %sPEM (bytes)", what, what)
	if path != "" && pem != nil {
		return usagef("NewLocalPem takes either %s, not both", forms)
	}
	if path == "" && pem == nil {
		return usagef("NewLocalPem needs either %s", forms)
	}
	return nil
}

// String is the redacted printed form — the type, and which FORM each half
// came from. A configured file path is not secret and is the one thing worth
// seeing when a provider loaded the wrong material; the bytes themselves are
// never printed.
//
// A path handed to this package is passed to the engine AS a path rather than
// read and copied: the SDKs that link a library have to read the file
// themselves, this one does not, and copying a private key into a temporary
// file so it could would be a worse trade than any parity it buys. What
// follows is worth stating — an unreadable key path is reported by the
// ENGINE, so it arrives as a failed result of kind `io` rather than under a
// host-side kind of this package's own.
func (p LocalPem) String() string {
	return fmt.Sprintf("shojiku.LocalPem key=%s cert=%s passphrase=%s",
		materialForm(p.keyPath), materialForm(p.certPath), passphraseForm(p.passphrase))
}

// GoString is what %#v prints, which does not go through String.
func (p LocalPem) GoString() string { return p.String() }

// MarshalJSON keeps a provider out of any payload it is serialized into.
func (p LocalPem) MarshalJSON() ([]byte, error) {
	return []byte(`"` + p.String() + `"`), nil
}

func materialForm(path string) string {
	if path == "" {
		return "[pem bytes]"
	}
	return path
}

func passphraseForm(secret string) string {
	if secret == "" {
		return "none"
	}
	return "[redacted]"
}
