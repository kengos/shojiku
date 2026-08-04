package shojiku

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
)

// maxReportBytes is the most report this package will read.
//
// Diagnostics scale with the document, so this is generous rather than tight;
// what it rules out is an unbounded read of a file that is not what we think
// it is.
const maxReportBytes = 8 * 1024 * 1024

// report is the `--report <path>` sidecar, read.
//
// This is the ONLY result channel. `shojiku: warning[…] …` on stderr is
// prose: it carries no diagnostic code, no typed args, no page count, and no
// way to tell caller error from a refused document — so this package never
// parses it, and the CLI grew the sidecar precisely so it would not have to.
//
// Everything here is defensive about a file it did not write. The engine is
// trusted to be the engine, but a stale binary, a truncated write or a
// different program under the same name all produce something that is not
// this envelope, and the honest answer to that is [EngineFailureError] —
// never a document failure nobody determined.
type report struct {
	ok           bool
	diagnostics  []Diagnostic
	pageCount    *int
	verification *VerificationReport
	prepared     *preparedWire
	failure      *reportFailure
}

// preparedWire is what `sign-prepare` reports, in the C ABI's own key names.
//
// Only ToBeSigned is read: the digest is offered for an audit trail and the
// ranges and capacity describe a document this package never inspects. They
// are named here anyway so the envelope this package accepts is the one the
// engine documents, rather than whatever subset today's code happens to use.
type preparedWire struct {
	ToBeSigned string `json:"toBeSigned"`
	Digest     string `json:"digest"`
	ByteRange  []int  `json:"byteRange"`
	Capacity   int    `json:"capacity"`
}

type reportFailure struct {
	class   string
	step    string
	kind    string
	message string
}

type reportWire struct {
	// A POINTER, so a payload that never mentioned `ok` is distinguishable
	// from one that said false. Anything without it is not this envelope.
	OK           *bool             `json:"ok"`
	Diagnostics  json.RawMessage   `json:"diagnostics"`
	PageCount    *int              `json:"pageCount"`
	Verification *verificationWire `json:"verification"`
	Prepared     *preparedWire     `json:"prepared"`
	Failure      *failureWire      `json:"failure"`
}

type failureWire struct {
	Class   string `json:"class"`
	Step    string `json:"step"`
	Kind    string `json:"kind"`
	Message string `json:"message"`
}

// readReport reads the sidecar the child was told to write.
//
// stderr is what the child said, quoted only when there is no report to
// explain a failure.
func readReport(path, stderr string) (*report, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, enginef("%s", noReport("the engine wrote no report", stderr))
	}
	defer func() { _ = file.Close() }()

	// One byte past the cap is read deliberately: that is what tells a report
	// AT the cap from one past it, without ever holding more than the cap
	// plus a byte of a file this package did not write.
	data, err := io.ReadAll(io.LimitReader(file, maxReportBytes+1))
	if err != nil {
		return nil, enginef("%s", noReport("the engine's report could not be read", stderr))
	}
	if len(data) > maxReportBytes {
		return nil, enginef(
			"the engine wrote a report past this package's %d-byte cap", maxReportBytes)
	}
	return parseReport(data, stderr)
}

// parseReport reads the envelope, or says why what it got is not one.
func parseReport(data []byte, stderr string) (*report, error) {
	var wire reportWire
	if err := json.Unmarshal(data, &wire); err != nil {
		// A TYPE error means it parsed as JSON and is simply not this
		// envelope — `"ok": "yes"` is a different fact from a truncated
		// file, and telling a caller "not JSON" about valid JSON would send
		// them looking in the wrong place.
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) {
			return nil, enginef("%s", noReport(
				"the engine's report is not a report envelope", stderr))
		}
		return nil, enginef("%s", noReport(
			"the engine's report is not JSON: "+err.Error(), stderr))
	}
	if wire.OK == nil {
		return nil, enginef("%s", noReport(
			"the engine's report is not a report envelope", stderr))
	}

	parsed := &report{
		ok:          *wire.OK,
		diagnostics: parseDiagnostics(wire.Diagnostics),
		pageCount:   wire.PageCount,
	}
	if wire.Verification != nil {
		parsed.verification = fromWire(*wire.Verification)
	}
	parsed.prepared = wire.Prepared
	if wire.Failure != nil {
		parsed.failure = &reportFailure{
			class:   orElse(wire.Failure.Class, "document"),
			step:    wire.Failure.Step,
			kind:    orElse(wire.Failure.Kind, "unknown"),
			message: wire.Failure.Message,
		}
	}
	return parsed, nil
}

// isUsage reports whether the failure is the CALLER's, which is the split the
// capi carries in its status code and the CLI carries in this field.
func (r *report) isUsage() bool {
	return r.failure != nil && r.failure.class == "usage"
}

func orElse(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

// noReport builds the message for a transport that explained nothing.
//
// The engine's stderr is quoted ONLY here, and bounded: it is the one place
// where a caller has nothing else to go on, and it stays out of the result
// values for the same reason it stays out of the log — prose is not a
// contract.
func noReport(reason, stderr string) string {
	said := strings.TrimSpace(stderr)
	if said == "" {
		return reason
	}
	return reason + " (it said: " + bounded(said) + ")"
}
