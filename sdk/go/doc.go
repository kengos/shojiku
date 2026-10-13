// Package shojiku turns a YAML template plus your data into a deterministic
// PDF, and signs and verifies the result.
//
// The gallery, the tutorials, and a playground that renders in your browser
// are at https://shojiku.kengos.jp.
//
// Three things to know before reading any of it.
//
// # Results, not errors, for what a document did
//
// Every lifecycle call returns (*Result, error), and the two carry different
// kinds of bad news. The error is the CALLER's problem — a misused argument,
// an entrance this client's lockdown disables, or a transport that got no
// answer at all. The Result is the DOCUMENT's — a template that will not
// render, a key that will not sign, a signature that does not verify. Those
// are data you query, never errors you handle, because a caller who checks
// only err would otherwise be told a forgery is fine:
//
//	result, err := client.Generate(ctx, "receipt", params)
//	if err != nil {
//	    return err // your program is wrong, or the engine is not installed
//	}
//	if !result.Success() {
//	    log.Println(result.Failure()) // the document was refused
//	}
//
// The same split runs through every SDK in this family; Go spells it with an
// error return where the others raise, which is the whole difference.
//
// # Nothing here reimplements the engine
//
// Layout, formatting and PDF construction all happen in the engine. This
// package finds it, hands it what it was given, and passes its diagnostics
// back untranslated — a diagnostic's code and typed args are frozen contract
// that a translating consumer renders its own message from.
//
// # Nothing here downloads anything
//
// The engine is the `shojiku` command-line binary, and this module never
// fetches it: an SDK that pulls an executable at install or run time is a
// supply-chain surface this product does not take on. Install it yourself and
// point [WithBinary] or SHOJIKU_BIN at it; a missing binary is a named error
// that lists the channels rather than a stack trace from a failed spawn.
package shojiku
