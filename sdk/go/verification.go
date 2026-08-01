package shojiku

import "fmt"

// VerificationReport is what verification found — INCLUDING what it did not
// look at.
//
// NotChecked is a field, not a footnote, and this binding passes it through
// untouched. A "valid" verdict that quietly skipped revocation is worse than
// no verifier at all: it turns a missing capability into a false assurance,
// which is exactly the trust a signing feature sells. Dropping it on the way
// through an SDK would be the same lie one layer up.
//
// The four checks stay separate for the same reason. "The signature is valid
// but covers only part of the file" is a different fact from "the signature
// is wrong", and a caller that cannot tell them apart cannot explain the
// answer to anyone.
type VerificationReport struct {
	valid               bool
	signature           VerificationCheck
	coverage            VerificationCheck
	certificateValidity VerificationCheck
	trustChain          VerificationCheck
	notChecked          []string
}

type verificationWire struct {
	Valid               bool              `json:"valid"`
	Signature           verificationCheck `json:"signature"`
	Coverage            verificationCheck `json:"coverage"`
	CertificateValidity verificationCheck `json:"certificateValidity"`
	TrustChain          verificationCheck `json:"trustChain"`
	NotChecked          []string          `json:"notChecked"`
}

type verificationCheck struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

func fromWire(wire verificationWire) *VerificationReport {
	return &VerificationReport{
		valid:               wire.Valid,
		signature:           VerificationCheck(wire.Signature),
		coverage:            VerificationCheck(wire.Coverage),
		certificateValidity: VerificationCheck(wire.CertificateValidity),
		trustChain:          VerificationCheck(wire.TrustChain),
		notChecked:          wire.NotChecked,
	}
}

// Valid reports whether every check this release PERFORMS passed.
//
// Read [VerificationReport.NotChecked] beside it: this is not "the document
// is trustworthy", it is "nothing we looked at was wrong".
func (r *VerificationReport) Valid() bool { return r.valid }

// Signature is whether the signature itself checked out.
func (r *VerificationReport) Signature() VerificationCheck { return r.signature }

// Coverage is whether the signature covers the whole document. A valid
// signature over an incomplete byte range is a forgery, so this is not the
// same question as [VerificationReport.Signature].
func (r *VerificationReport) Coverage() VerificationCheck { return r.coverage }

// CertificateValidity is whether the signer's certificate was in date.
func (r *VerificationReport) CertificateValidity() VerificationCheck {
	return r.certificateValidity
}

// TrustChain is whether the certificate chained to an anchor you supplied.
func (r *VerificationReport) TrustChain() VerificationCheck { return r.trustChain }

// NotChecked is what this release did NOT check. Carried on a failing
// verdict too.
func (r *VerificationReport) NotChecked() []string { return r.notChecked }

// Checks is the four checks by name, for a caller that wants to walk them.
func (r *VerificationReport) Checks() map[string]VerificationCheck {
	return map[string]VerificationCheck{
		"signature":           r.signature,
		"coverage":            r.coverage,
		"certificateValidity": r.certificateValidity,
		"trustChain":          r.trustChain,
	}
}

// VerificationCheck is the outcome of one verification check: passed, or
// failed with the reason.
type VerificationCheck struct {
	Status string
	Reason string
}

// Passed reports whether this check succeeded.
func (c VerificationCheck) Passed() bool { return c.Status == "passed" }

func (c VerificationCheck) String() string {
	if c.Reason != "" {
		return fmt.Sprintf("%s: %s", c.Status, c.Reason)
	}
	return c.Status
}
