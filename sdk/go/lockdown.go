package shojiku

// lockdown is the input ceiling an operator can declare, and the named
// signing providers that go with it.
//
// Once signing is in the loop, template input is a security boundary:
// whoever controls the bytes controls what gets signed. A strict client
// therefore narrows where signable input may come from.
//
//   - The bytes-first entrance ([Client.GenerateSource]) is refused, so every
//     document this client signs came from the configured template root, with
//     its containment rules.
//   - An artifact this client did not render ([Client.Artifact]) may not be
//     signed — those bytes are the caller's, exactly like a bytes-first
//     template.
//   - Signing material must be a provider REGISTERED in configuration and
//     named at the call site, so a key path never appears in request-handling
//     code and the material is loaded by one value rather than rebuilt per
//     request.
//
// Verification is never restricted. Verifying bytes of unknown provenance is
// the entire point of verify, and a locked-down deployment is precisely the
// one that needs to check an archived document it did not produce.
//
// Refusals are ERRORS rather than failed results: strict disables an
// ENTRANCE, so calling it is the program contradicting its own deployment's
// configuration — not a fact about a document — and a failed result is
// something an `if result.Success()` can swallow.
//
// The six other SDKs mirror this with identical semantics. It is contract,
// not ecosystem idiom.
type lockdown struct {
	strict    bool
	providers map[string]*LocalPem
}

// sourceEntrance guards the bytes-first entrance.
func (l *lockdown) sourceEntrance() error {
	if !l.strict {
		return nil
	}
	return usagef("this client is strict: templates must come from the template root, " +
		"so GenerateSource is disabled. Use Generate(ctx, name, params).")
}

// signable guards an artifact about to be signed.
//
// Only a document laid out from a template the ROOT resolved qualifies —
// bytes handed over whole, and bytes laid out from a caller's own template,
// are the same trust class here. That closes the gap a boolean "was it
// loaded" would leave open: an artifact from another client's bytes-first
// render is not this deployment's document either.
func (l *lockdown) signable(artifact *DocumentArtifact) error {
	if !l.strict || artifact.origin == OriginRendered {
		return nil
	}
	return usagef("this client is strict: only a document rendered from its own "+
		"template root may be signed (this one is %s). It can still be verified.",
		artifact.origin)
}

// provider resolves the provider to sign with. The rules per form live on the
// two [Provider] implementations; what is here is the one shape neither of
// them can answer for — no provider at all.
func (l *lockdown) provider(provider Provider) (*LocalPem, error) {
	if provider == nil {
		return nil, usagef("signing needs a provider: a *LocalPem, or the ProviderName " +
			"of one registered with shojiku.WithProviders")
	}
	return provider.resolve(l)
}
