package shojiku

import "time"

// Logger is the log channel's interface, and it is deliberately log/slog's
// own shape: a *slog.Logger satisfies it as it is, so an application passes
// the logger it already has and this package still depends on nothing.
//
// A type of your own needs one method:
//
//	func (l myLogger) Debug(msg string, args ...any) { … }
type Logger interface {
	Debug(msg string, args ...any)
}

// logSink is the optional host-side log channel.
//
// Silent unless an application supplies a logger, and deliberately narrow: it
// reports what the BINDING did — which binary it found and which lookup
// position won, which lifecycle step ran and for how long, and whether it
// worked — and never what the document contained. Params, rendered bytes,
// diagnostics and key material are all outside this channel BY RULE, because
// a log line is the easiest way for a secret to leave a process, and because
// a diagnostic belongs to the [Result] the caller already has.
//
// What does cross is bounded first, so a hostile template name cannot smuggle
// control characters into a log file.
type logSink struct{ logger Logger }

func (l *logSink) event(name string, args ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Debug("shojiku "+name, args...)
}

// timed records one lifecycle operation and returns what body returned.
//
// The result's verdict is recorded as ok — the one thing worth knowing about
// an operation that is not its content. A returned error is recorded as a
// verdict too, since "it did not get that far" is not the same as a refusal.
func (l *logSink) timed(
	step Step, body func() (*Result, error), args ...any,
) (*Result, error) {
	started := time.Now()
	result, err := body()
	args = append(args,
		"ms", float64(time.Since(started).Microseconds())/1000,
		"ok", err == nil && result.Success(),
	)
	l.event(string(step), args...)
	return result, err
}
