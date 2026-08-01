package shojiku

import "fmt"

// Step is the lifecycle step a [Failure] belongs to.
//
// Always one of these three — the SDK's OWN vocabulary. The engine's report
// carries a step of its own naming an INTERNAL stage (`render`, `validate`),
// and passing that through would make the trace's step mean different things
// depending on which layer refused. What the engine said specifically is the
// failure's [Failure.Kind].
type Step string

// The three lifecycle steps.
const (
	StepGenerate Step = "generate"
	StepSign     Step = "sign"
	StepVerify   Step = "verify"
)

// Failure says why a lifecycle operation did not produce what was asked for.
//
// A VALUE, not an error. The shape takes effect-ts's Cause as its conceptual
// reference: which step failed, what class of thing went wrong, and — when
// one failure happened because of another — the chain underneath it, all
// inspectable rather than unwound. No framework is involved; only the idea
// that a failure is data.
type Failure struct {
	step        Step
	kind        string
	message     string
	diagnostics []Diagnostic
	cause       *Failure
}

// Step is the lifecycle step, which is always this package's own.
func (f *Failure) Step() Step { return f.step }

// Kind is a stable machine-readable class. Engine-side kinds come straight
// off the report; host-side ones are this package's own (`template_name`,
// `template_escapes_root`, …).
func (f *Failure) Kind() string { return f.kind }

// Message is the prose, already bounded by whoever produced it.
func (f *Failure) Message() string { return f.message }

// Diagnostics are what the engine noticed, when this failure carries any.
func (f *Failure) Diagnostics() []Diagnostic { return f.diagnostics }

// Cause is the failure underneath this one, or nil.
func (f *Failure) Cause() *Failure { return f.cause }

// Causes is this failure and everything under it, outermost first. What you
// log when you want the whole story rather than only its headline.
func (f *Failure) Causes() []*Failure {
	chain := []*Failure{f}
	for cause := f.cause; cause != nil; cause = cause.cause {
		chain = append(chain, cause)
	}
	return chain
}

func (f *Failure) String() string {
	return fmt.Sprintf("%s/%s: %s", f.step, f.kind, f.message)
}
