package shojiku

// Result is what every lifecycle operation returns beside its error.
//
// The error and the result carry different kinds of bad news, and keeping
// them apart is the whole point of this type. A returned error means the
// CALLER got something wrong, or the transport got no answer. A Result whose
// [Result.Success] is false means the DOCUMENT was refused — a template that
// will not render, a key that will not sign, a signature that does not
// verify. Those are data you query, because a caller who checked only err
// would otherwise be told a forgery is fine.
//
// Diagnostics ride on a SUCCESS too. A render that worked can still have
// warned about an overflowing box, and a caller that only looks at failures
// never sees them.
type Result struct {
	artifact    *DocumentArtifact
	report      *VerificationReport
	diagnostics []Diagnostic
	failure     *Failure
}

func succeededWithArtifact(artifact *DocumentArtifact, diagnostics []Diagnostic) *Result {
	return &Result{artifact: artifact, diagnostics: diagnostics}
}

func succeededWithReport(report *VerificationReport, diagnostics []Diagnostic) *Result {
	return &Result{report: report, diagnostics: diagnostics}
}

func fromFailure(failure *Failure) *Result {
	return &Result{diagnostics: failure.diagnostics, failure: failure}
}

// refused is a verdict that FAILED but still carries its report — the whole
// reason NotChecked exists. Nothing else produces a failed result with a
// value.
func refused(report *VerificationReport, diagnostics []Diagnostic, failure *Failure) *Result {
	return &Result{report: report, diagnostics: diagnostics, failure: failure}
}

// Success reports whether the operation produced what was asked for.
func (r *Result) Success() bool { return r.failure == nil }

// Failed reports whether the document was refused.
func (r *Result) Failed() bool { return r.failure != nil }

// Artifact is the rendered or signed document, or nil when this result is
// not about one. It does not fail; [Result.Err] is the one that does.
func (r *Result) Artifact() *DocumentArtifact { return r.artifact }

// Report is the verification report, or nil when this result is not about
// one. A FAILING verdict still carries it, because what was not checked has
// to reach the caller either way.
func (r *Result) Report() *VerificationReport { return r.report }

// Err is nil on success and the failure as an error on failure.
//
// This is Go's form of the opt-in unwrap every Shojiku SDK offers: an
// accessor that surfaces the failure for a script that wants one line of
// control flow rather than a branch. The other six raise here; the ruling for
// Go is frozen as an error return rather than a panic, because the language
// has no exceptions to mirror. The name is Err rather than Unwrap because
// errors.Unwrap owns that verb in Go, while Err is the language's own
// spelling for "the error this value carries" (sql.Rows.Err, bufio.Scanner.Err).
//
// Application code that handles failure keeps using [Result.Success] and
// [Result.Failure]; nothing in this package calls this.
func (r *Result) Err() error {
	if r.failure == nil {
		return nil
	}
	return &UnwrapError{Failure: r.failure}
}

// Failure is why the operation did not produce what was asked for, or nil.
func (r *Result) Failure() *Failure { return r.failure }

// Diagnostics are everything the engine noticed, on a success as well as a
// failure.
func (r *Result) Diagnostics() []Diagnostic { return r.diagnostics }

// Errors are only the diagnostics that are errors — the ones that explain a
// refusal.
func (r *Result) Errors() []Diagnostic { return r.filter(Diagnostic.IsError) }

// Warnings are only the warnings, which a SUCCESSFUL result can carry.
func (r *Result) Warnings() []Diagnostic { return r.filter(Diagnostic.IsWarning) }

func (r *Result) filter(keep func(Diagnostic) bool) []Diagnostic {
	var kept []Diagnostic
	for _, d := range r.diagnostics {
		if keep(d) {
			kept = append(kept, d)
		}
	}
	return kept
}
