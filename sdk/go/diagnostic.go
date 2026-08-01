package shojiku

import (
	"encoding/json"
	"strings"
)

// Diagnostic is one thing the engine noticed about a document.
//
// Passed through, never interpreted. Code and Args are the engine's frozen
// contract — a translating consumer renders its own message from them — so
// this type reads the wire and stops. It does not translate, it does not
// re-classify, and it never becomes an error: a render that warns still
// succeeded, and a render that failed says why in these.
//
// A field the engine did not send reads as the empty string. Absence and
// emptiness are not distinguished here because nothing branches on the
// difference; what does branch — the severity — is always present.
type Diagnostic struct {
	severity string
	code     string
	category string
	message  string
	path     string
	args     map[string]any
	origin   string
}

type diagnosticWire struct {
	Severity string         `json:"severity"`
	Code     string         `json:"code"`
	Category string         `json:"category"`
	Message  string         `json:"message"`
	Path     string         `json:"path"`
	Args     map[string]any `json:"args"`
	Origin   string         `json:"origin"`
}

type diagnosticsWire struct {
	Items []json.RawMessage `json:"items"`
}

// parseDiagnostics reads the {"items": [...]} object the engine emits.
//
// The object rather than a bare array is the shape every host publishes, so
// this is the same parse the other SDKs do. Anything that is not that shape
// yields no diagnostics rather than a guess, and one item that does not read
// is skipped rather than taking the rest of them down with it.
func parseDiagnostics(payload json.RawMessage) []Diagnostic {
	if len(payload) == 0 {
		return nil
	}
	var wire diagnosticsWire
	if err := json.Unmarshal(payload, &wire); err != nil {
		return nil
	}
	items := make([]Diagnostic, 0, len(wire.Items))
	for _, raw := range wire.Items {
		var item diagnosticWire
		if err := json.Unmarshal(raw, &item); err != nil {
			continue
		}
		items = append(items, Diagnostic{
			severity: item.Severity,
			code:     item.Code,
			category: item.Category,
			message:  item.Message,
			path:     item.Path,
			args:     item.Args,
			origin:   item.Origin,
		})
	}
	return items
}

// Severity is `error`, `warning` or whatever else the engine grows.
func (d Diagnostic) Severity() string { return d.severity }

// Code is the engine's stable machine-readable identifier for this
// diagnostic. Frozen and append-only: branch on this, never on the message.
func (d Diagnostic) Code() string { return d.code }

// Category is the engine's semantic grouping, which it may re-categorize.
func (d Diagnostic) Category() string { return d.category }

// Message is the engine's English default, untranslated.
func (d Diagnostic) Message() string { return d.message }

// Path points at what in the document this is about.
func (d Diagnostic) Path() string { return d.path }

// Args are the engine's typed arguments, untouched.
//
// An append-only wire this package does not model, exactly as
// [Client.EngineInfo] is: a typed value would owe a new field in seven
// languages every time the engine adds one.
func (d Diagnostic) Args() map[string]any { return d.args }

// Origin is where in the engine this came from — free to churn, so nothing
// should branch on it.
func (d Diagnostic) Origin() string { return d.origin }

// IsError reports whether this diagnostic explains a refusal.
func (d Diagnostic) IsError() bool { return d.severity == "error" }

// IsWarning reports whether this diagnostic rode along with a success.
func (d Diagnostic) IsWarning() bool { return d.severity == "warning" }

func (d Diagnostic) String() string {
	parts := make([]string, 0, 2)
	for _, part := range []string{d.path, d.message} {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, ": ")
}
