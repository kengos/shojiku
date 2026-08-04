package shojiku

import (
	"context"
	"encoding/base64"
	"fmt"
)

// Algorithm names how a key signs, in the spelling the engine accepts.
type Algorithm string

// The algorithms this release can write a signature for.
const (
	// RSAPKCS1SHA256 is RSA PKCS#1 v1.5 over SHA-256. The signature is the
	// raw operation output.
	RSAPKCS1SHA256 Algorithm = "rsa-pkcs1-sha256"
	// ECDSAP256SHA256 is ECDSA on P-256 over SHA-256. The signature is an
	// ASN.1 DER SEQUENCE, which is what both major cloud key services return.
	ECDSAP256SHA256 Algorithm = "ecdsa-p256-sha256"
)

// ExternalSigner is a signing provider for a key this process is never given.
//
// The second provider, and the shape [LocalPem]'s own comment promised: a new
// type rather than new arguments on Sign, so the call site is unchanged in all
// seven SDKs.
//
// The engine hands out the bytes a signature has to cover; the function signs
// them wherever the key actually lives — AWS KMS, Google Cloud KMS, an HSM, a
// smartcard, another service entirely — and hands the signature back:
//
//	provider, err := shojiku.NewExternalSigner(
//		func(toBeSigned []byte) ([]byte, error) {
//			out, err := kms.Sign(ctx, &kms.SignInput{
//				KeyId: aws.String(keyID), Message: toBeSigned,
//				MessageType: types.MessageTypeRaw,
//				SigningAlgorithm: types.SigningAlgorithmSpecEcdsaSha256,
//			})
//			if err != nil {
//				return nil, err
//			}
//			return out.Signature, nil
//		},
//		shojiku.ExternalCert("signer.crt"),
//		shojiku.ExternalAlgorithm(shojiku.ECDSAP256SHA256),
//	)
//	result, err := client.Sign(ctx, artifact, provider)
//
// Shojiku ships no cloud client of its own, deliberately: the function is
// whatever client your application already has, and the SDK stays a wrapper
// with nothing to keep in step with a vendor's releases.
//
// # What gets signed
//
// The function receives the CMS signed ATTRIBUTES, not the document digest. A
// service that signs a digest must hash these bytes with SHA-256 itself.
// Signing the document digest instead produces a document that fails
// verification, so the distinction is not cosmetic.
//
// # Redaction
//
// Nothing here is key material — that is the point of this provider — but the
// function closes over whatever built it, which in practice is a client
// holding credentials. So the printed forms are overridden exactly as
// [LocalPem]'s are, and for the same reason: fmt prints unexported fields.
type ExternalSigner struct {
	certPath  string
	certPEM   []byte
	algorithm Algorithm
	sign      func([]byte) ([]byte, error)
}

// ExternalOption configures an [ExternalSigner].
//
// Named apart from [PemOption]'s CertPath and CertPEM rather than shared with
// them: Go has no overloading, and one option type covering two providers
// would mean an option that silently does nothing on the other.
type ExternalOption func(*ExternalSigner)

// ExternalCert names the signer's X.509 certificate file, as PEM.
func ExternalCert(path string) ExternalOption {
	return func(e *ExternalSigner) { e.certPath = path }
}

// ExternalCertPEM supplies the certificate as bytes already in memory.
func ExternalCertPEM(pem []byte) ExternalOption {
	return func(e *ExternalSigner) { e.certPEM = pem }
}

// ExternalAlgorithm names the algorithm the key signs with. Required.
func ExternalAlgorithm(algorithm Algorithm) ExternalOption {
	return func(e *ExternalSigner) { e.algorithm = algorithm }
}

// NewExternalSigner builds a provider around the function that signs.
func NewExternalSigner(
	sign func([]byte) ([]byte, error), opts ...ExternalOption,
) (*ExternalSigner, error) {
	provider := &ExternalSigner{sign: sign}
	for _, opt := range opts {
		opt(provider)
	}
	if sign == nil {
		return nil, usagef("NewExternalSigner needs a function that signs the bytes it is given")
	}
	if err := oneCertificate(provider.certPath, provider.certPEM); err != nil {
		return nil, err
	}
	return provider, nil
}

// oneCertificate enforces explicit, never sniffed, in BOTH directions —
// [LocalPem]'s rule, for the same reason.
func oneCertificate(path string, pem []byte) error {
	forms := "ExternalCert (a path) or ExternalCertPEM (bytes)"
	if path != "" && pem != nil {
		return usagef("NewExternalSigner takes either %s, not both", forms)
	}
	if path == "" && pem == nil {
		return usagef("NewExternalSigner needs either %s", forms)
	}
	return nil
}

// String is the redacted printed form — which FORM the certificate came from
// and which algorithm, and nothing else.
func (e ExternalSigner) String() string {
	return fmt.Sprintf("shojiku.ExternalSigner cert=%s algorithm=%s",
		materialForm(e.certPath), e.algorithm)
}

// GoString is what %#v prints, which does not go through String.
func (e ExternalSigner) GoString() string { return e.String() }

// MarshalJSON keeps a provider out of any payload it is serialized into.
func (e ExternalSigner) MarshalJSON() ([]byte, error) {
	return []byte(`"` + e.String() + `"`), nil
}

// resolve accepts the value itself, unless this client is locked down.
func (e *ExternalSigner) resolve(l *lockdown) (signer, error) {
	// The interface is closed, but a NIL *ExternalSigner still satisfies it
	// and would otherwise reach the transport as a provider with no function.
	if e == nil {
		return nil, usagef("a signing provider must be non-nil")
	}
	if l.strict {
		return nil, usagef("this client is strict: sign with the name of a provider " +
			"registered in configuration, not with a provider value.")
	}
	return e, nil
}

// signWith signs in two engine calls, with the caller's function in between.
//
// Both calls take the same document, certificate and algorithm: the pair is
// stateless, so the second re-derives what the first prepared. Keeping them
// inside ONE method is what makes that impossible to get wrong from Go —
// there is no way to pair a prepare of one document with a complete of
// another.
func (e *ExternalSigner) signWith(
	ctx context.Context, c *Client, artifact *DocumentArtifact,
) (*Result, error) {
	if err := c.settings.engine.requireExternal(ctx); err != nil {
		return nil, err
	}
	return inWorkspace(func(ws *workspace) (*Result, error) {
		input := ws.write("input.pdf", artifact.bytes)
		cert := materialPath(ws, "cert.pem", e.certPath, e.certPEM)
		prepared, _, err := c.settings.engine.execute(
			ctx, signPrepareArgs(input, cert, string(e.algorithm)), ws, nil)
		if err != nil {
			return nil, err
		}
		// A prepare that did not succeed is returned as it is: an unreadable
		// certificate or a document the engine refuses is a fact about the
		// inputs, and paying for a signature afterwards would tell the caller
		// nothing new.
		if !prepared.ok {
			return documentOutcome(prepared, nil, StepSign, c, artifact.origin)
		}
		signature, err := e.signatureFor(prepared)
		if err != nil {
			return nil, err
		}
		rep, pdf, err := c.settings.engine.execute(
			ctx,
			signCompleteArgs(input, cert, string(e.algorithm), ws.write("signature.bin", signature)),
			ws,
			nil,
		)
		if err != nil {
			return nil, err
		}
		return documentOutcome(rep, pdf, StepSign, c, artifact.origin)
	})
}

// signatureFor runs the caller's function over the bytes the engine wants
// signed.
//
// The function's own error is returned unwrapped, deliberately: it is the
// caller's code talking to the caller's key service, and turning a key-service
// outage into a failed Result would file it under "something was wrong with
// this document".
func (e *ExternalSigner) signatureFor(prepared *report) ([]byte, error) {
	if prepared.prepared == nil {
		return nil, enginef("the engine reported no bytes to sign")
	}
	toBeSigned, err := base64.StdEncoding.DecodeString(prepared.prepared.ToBeSigned)
	if err != nil {
		return nil, enginef("the engine's bytes-to-sign payload is not base64")
	}
	signature, err := e.sign(toBeSigned)
	if err != nil {
		return nil, err
	}
	if len(signature) == 0 {
		return nil, usagef("the signing function must return a non-empty signature")
	}
	return signature, nil
}
