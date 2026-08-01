package shojiku

import (
	"errors"
	"fmt"
)

// Error is implemented by every error this package produces, so a caller who
// wants "anything Shojiku returned" has one thing to test for — and can ask
// which CLASS of thing it was without a type switch.
//
// Class is also what each error unwraps to, so errors.Is works at whichever
// granularity the caller wants: the concrete type, or the class. The PHP SDK
// makes the same distinction by extending \LogicException for a mistake in
// the calling program and \RuntimeException for a condition only the
// environment can produce; here that split is [ErrUsage] and [ErrUnwrap] on
// one side, [ErrBinaryNotFound], [ErrIncompatibleEngine] and
// [ErrEngineFailure] on the other.
//
// Returning an error is deliberately rare. A template that will not render, a
// key that will not sign, a signature that does not verify are OUTCOMES —
// they come back as [Result] values you query, never as errors.
type Error interface {
	error
	// Class is the sentinel naming what kind of failure this is.
	Class() error
}

// The class sentinels. errors.Is(err, ErrUsage) is true for any usage error
// regardless of which rule produced it.
var (
	// ErrUsage marks a mistake in the calling program.
	ErrUsage = errors.New("shojiku: usage")
	// ErrUnwrap marks reading the value of a result that failed.
	ErrUnwrap = errors.New("shojiku: unwrap of a failed result")
	// ErrBinaryNotFound marks a missing or unusable engine binary.
	ErrBinaryNotFound = errors.New("shojiku: engine binary not found")
	// ErrIncompatibleEngine marks a binary that cannot serve this contract.
	ErrIncompatibleEngine = errors.New("shojiku: incompatible engine")
	// ErrEngineFailure marks a transport that got no answer at all.
	ErrEngineFailure = errors.New("shojiku: engine failure")
)

// UsageError is returned when the caller passed something this API cannot
// accept: both forms of the same material at once, an entrance this client's
// lockdown disables, or params that cannot be serialized.
//
// A BLANK template name is deliberately not in that list — an empty string
// can arrive straight from a form field, so it comes back as a refused
// request like every other bad name. A name that is not a string cannot
// arrive at all: [Client.Generate] takes a string, so the type system
// enforces what the other SDKs check at run time.
type UsageError struct{ Message string }

func (e *UsageError) Error() string { return e.Message }
func (e *UsageError) Unwrap() error { return e.Class() }

// Class is [ErrUsage].
func (e *UsageError) Class() error { return ErrUsage }

// UnwrapError carries the failure of a result whose value was read with
// [Result.Err].
//
// Every other SDK in this family raises here; Go has no exceptions, so the
// frozen ruling is mirrored as an error return rather than a panic. The
// failure travels on the error, so nothing is lost by taking the short road.
type UnwrapError struct{ Failure *Failure }

func (e *UnwrapError) Error() string { return e.Failure.String() }
func (e *UnwrapError) Unwrap() error { return e.Class() }

// Class is [ErrUnwrap].
func (e *UnwrapError) Class() error { return ErrUnwrap }

// BinaryNotFoundError is returned when the `shojiku` binary could not be
// found, or is not executable.
//
// The message names the install channels, because the fix is always an
// installation step and a bare "executable file not found in $PATH" names
// none of them. This is the subprocess transport's counterpart to the FFI
// SDKs' "the engine library was not found".
type BinaryNotFoundError struct{ Message string }

func (e *BinaryNotFoundError) Error() string { return e.Message }
func (e *BinaryNotFoundError) Unwrap() error { return e.Class() }

// Class is [ErrBinaryNotFound].
func (e *BinaryNotFoundError) Class() error { return ErrBinaryNotFound }

// IncompatibleEngineError is returned when the binary runs but cannot serve
// this package's contract.
//
// The FFI SDKs ask the library for its ABI revision; a subprocess SDK asks
// the binary for its capability list, and the key that matters is
// `cli.report`. Without it there is no machine-readable result at all — only
// prose on stderr, which carries no diagnostic code, no typed args, no page
// count, and no way to tell caller error from a refused document.
type IncompatibleEngineError struct{ Message string }

func (e *IncompatibleEngineError) Error() string { return e.Message }
func (e *IncompatibleEngineError) Unwrap() error { return e.Class() }

// Class is [ErrIncompatibleEngine].
func (e *IncompatibleEngineError) Class() error { return ErrIncompatibleEngine }

// EngineFailureError is returned when the transport got no answer at all.
//
// The contract has two failure levels — caller error, and something a
// document did — and both arrive in the `--report` sidecar. This is neither:
// the process died, wrote no report, wrote something that is not the
// envelope, or is not the binary we think it is. Manufacturing a document
// failure out of that would tell the caller something about their document
// that nobody actually determined.
//
// The in-process SDKs have no counterpart because a linked library cannot
// fail this way; it is the price of a subprocess, and it is named rather than
// hidden.
type EngineFailureError struct{ Message string }

func (e *EngineFailureError) Error() string { return e.Message }
func (e *EngineFailureError) Unwrap() error { return e.Class() }

// Class is [ErrEngineFailure].
func (e *EngineFailureError) Class() error { return ErrEngineFailure }

func usagef(format string, args ...any) *UsageError {
	return &UsageError{Message: fmt.Sprintf(format, args...)}
}

func enginef(format string, args ...any) *EngineFailureError {
	return &EngineFailureError{Message: fmt.Sprintf(format, args...)}
}
