package shojiku

// Turning one engine report into the result an application sees.
//
// The two levels of failure meet here, and keeping them apart is the whole
// job: `class: usage` is the CALLER's mistake and comes back as an error,
// while everything a DOCUMENT can do wrong comes back as a failed result with
// the engine's diagnostics attached. The capi carries that split in a status
// code out of band; the CLI carries it in the report, because its own
// out-of-band channel — the exit code — already carries the verdict. Same
// information, each host's own channel.

// guard turns a `usage` failure into an error.
//
// A usage failure is the engine saying the CALLER got it wrong — an
// unwritable output path, a page past the end, a named environment variable
// that is not set. That is programmer misuse, so it does not come back as a
// document that failed.
func guard(rep *report) error {
	if !rep.isUsage() {
		return nil
	}
	return usagef("the engine refused the call: %s", bounded(rep.failure.message))
}

// documentOutcome builds the result for a rendered or signed document.
//
// Diagnostics are attached either way: a render that WORKED can still have
// warned.
func documentOutcome(
	rep *report, bytes []byte, step Step, client *Client, origin Origin,
) (*Result, error) {
	if err := guard(rep); err != nil {
		return nil, err
	}
	if !rep.ok {
		return fromFailure(traceOf(rep, step)), nil
	}
	return succeededWithArtifact(&DocumentArtifact{
		bytes:       bytes,
		diagnostics: rep.diagnostics,
		client:      client,
		pageCount:   rep.pageCount,
		origin:      origin,
	}, rep.diagnostics), nil
}

// verdictOutcome builds the result for a verification.
//
// The report is read BEFORE the verdict is, because it rides a FAILED verify
// too — that is the whole point of carrying NotChecked. A document that could
// not be evaluated at all (no signature, an unreadable container) has NO
// report, which is a different fact from an empty one, so the field stays nil
// rather than being defaulted into an all-passed shape.
func verdictOutcome(rep *report) (*Result, error) {
	if err := guard(rep); err != nil {
		return nil, err
	}
	if rep.ok {
		return succeededWithReport(rep.verification, rep.diagnostics), nil
	}
	return refused(rep.verification, rep.diagnostics, traceOf(rep, StepVerify)), nil
}

// traceOf builds the trace, with this package's own step.
//
// The engine's `step` names an internal stage and is deliberately not read.
func traceOf(rep *report, step Step) *Failure {
	failure := &Failure{step: step, kind: "unknown", diagnostics: rep.diagnostics}
	if rep.failure != nil {
		failure.kind = rep.failure.kind
		failure.message = rep.failure.message
	}
	return failure
}
