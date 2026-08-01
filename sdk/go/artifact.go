package shojiku

import (
	"context"
	"os"
)

// Origin is where a document came from, which is what a strict client signs
// on.
//
// Only [OriginRendered] is signable under a lockdown: in the other two the
// provenance of what gets signed is the application's rather than the
// deployment's, which is the distinction strict exists to draw. Signing
// INHERITS the origin of what it signed — appending a revision does not
// launder where a document came from. Verification is never restricted.
//
// A boolean "was it loaded" would not be enough: an artifact from another
// client's bytes-first render has engine-laid-out bytes and a caller's
// template, which is a third thing.
type Origin string

// The three provenances a document can have.
const (
	// OriginRendered was laid out from a template the configured root resolved.
	OriginRendered Origin = "rendered"
	// OriginSource was laid out from template bytes the application supplied.
	OriginSource Origin = "source"
	// OriginLoaded is bytes the application supplied whole.
	OriginLoaded Origin = "loaded"
)

// DocumentArtifact is a rendered (and possibly signed) document.
//
// The application sees bytes and metadata — never a layout-engine internal.
// Where the FFI SDKs say "and never a handle it has to free", this transport
// says "and never a temporary file it has to clean up": the bytes come back
// over the child's stdout and the workspace is gone before this value exists.
type DocumentArtifact struct {
	bytes       []byte
	diagnostics []Diagnostic
	client      *Client
	pageCount   *int
	origin      Origin
}

// Bytes is the PDF.
//
// A COPY, because a Go slice is a window onto memory this value still needs:
// a caller who trimmed the slice they were handed would corrupt the bytes a
// later [DocumentArtifact.Sign] appends its revision to. The other SDKs get
// this for free from immutable string types.
func (a *DocumentArtifact) Bytes() []byte {
	out := make([]byte, len(a.bytes))
	copy(out, a.bytes)
	return out
}

// PageCount is how many pages the engine laid out, and whether it laid out
// any at all.
//
// The second return is false — not a zero count — for an artifact that was
// signed rather than rendered, and for one handed over whole: signing appends
// a revision to bytes it never measured, and a zero there would read as "a
// document with no pages". Go's comma-ok is this family's "absent, not zero".
func (a *DocumentArtifact) PageCount() (int, bool) {
	if a.pageCount == nil {
		return 0, false
	}
	return *a.pageCount, true
}

// Diagnostics are what the engine noticed while producing this document.
func (a *DocumentArtifact) Diagnostics() []Diagnostic { return a.diagnostics }

// Origin is where this document came from — the provenance a strict client
// signs on.
func (a *DocumentArtifact) Origin() Origin { return a.origin }

// Loaded reports whether these bytes were handed over whole rather than laid
// out here.
func (a *DocumentArtifact) Loaded() bool { return a.origin == OriginLoaded }

// Size is the document's length in bytes.
func (a *DocumentArtifact) Size() int { return len(a.bytes) }

// Write writes the document to path and returns it.
//
// 0644 before the process umask, which is what an ordinary output file gets
// in every SDK here. The private 0600 mode belongs to the workspace, where
// key material and params are staged for the child — a rendered document is
// the caller's own output, and tightening it here would only surprise the
// application that goes on to serve the file.
func (a *DocumentArtifact) Write(path string) (string, error) {
	if err := os.WriteFile(path, a.bytes, 0o644); err != nil {
		return "", usagef("could not write `%s`: %v", bounded(path), err)
	}
	return path, nil
}

// Sign signs this document with provider, returning a result carrying the
// signed artifact. The signed bytes begin with these bytes byte for byte:
// signing appends a revision, it never rewrites what was there.
func (a *DocumentArtifact) Sign(ctx context.Context, provider Provider) (*Result, error) {
	return a.client.Sign(ctx, a, provider)
}

// Verify verifies this document against caller-supplied trust anchors.
func (a *DocumentArtifact) Verify(ctx context.Context, opts ...VerifyOption) (*Result, error) {
	return a.client.Verify(ctx, a, opts...)
}
