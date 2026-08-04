package shojiku

import (
	"bytes"
	"encoding/json"
)

// The one place a call's arguments are assembled.
//
// The reference gem builds a JSON envelope here because its transport takes
// one; this transport takes an argument VECTOR, so that is what these build —
// same position in the package, same job (nothing else in the codebase knows
// the engine's flag names), different wire.
//
// Every element is passed to the child literally: os/exec takes a slice and
// execs the binary directly, so a value carrying spaces, quotes, $(…) or a
// newline is one argument containing those characters and nothing interprets
// it. No shell ever runs.

func renderArgs(src sources, paramsPath, lang string, fontDirs, localeDirs []string) []string {
	argv := []string{"render", "--templates", src.template, "--params", paramsPath}
	if src.definitions != "" {
		argv = append(argv, "--definitions", src.definitions)
	}
	if src.assetsDir != "" {
		argv = append(argv, "--assets-dir", src.assetsDir)
	}
	if lang != "" {
		argv = append(argv, "--lang", lang)
	}
	for _, dir := range fontDirs {
		argv = append(argv, "--font-dir", dir)
	}
	for _, dir := range localeDirs {
		argv = append(argv, "--locale-dir", dir)
	}
	// `-` is the CLI's spelling of stdout, and it is what keeps a rendered
	// document out of the filesystem entirely.
	return append(argv, "--output", "-")
}

func signArgs(pdfPath, keyPath, certPath, passphraseVariable string) []string {
	argv := []string{
		"sign",
		"--input", pdfPath,
		"--key", keyPath,
		"--cert", certPath,
		"--output", "-",
	}
	if passphraseVariable != "" {
		// The NAME of a variable, never the passphrase: argv is readable by
		// other processes on most systems and lands in shell history, which
		// is why the CLI offers no flag that takes one.
		argv = append(argv, "--passphrase-env", passphraseVariable)
	}
	return argv
}

// signPrepareArgs asks what a signature must cover. No key crosses: the two
// external verbs take a certificate and an algorithm and nothing else.
func signPrepareArgs(pdfPath, certPath, algorithm string) []string {
	return []string{
		"sign-prepare",
		"--input", pdfPath,
		"--cert", certPath,
		"--algorithm", algorithm,
	}
}

// signCompleteArgs writes a signature produced elsewhere into the document.
// The same input, certificate and algorithm the prepare half was given.
func signCompleteArgs(pdfPath, certPath, algorithm, signaturePath string) []string {
	return []string{
		"sign-complete",
		"--input", pdfPath,
		"--cert", certPath,
		"--algorithm", algorithm,
		"--signature", signaturePath,
		"--output", "-",
	}
}

func verifyArgs(pdfPath string, anchorPaths []string) []string {
	argv := []string{"verify", "--input", pdfPath}
	for _, anchor := range anchorPaths {
		argv = append(argv, "--anchor", anchor)
	}
	return argv
}

// encodeParams turns params into the source text the engine will parse.
//
// A string (or a byte slice) is the caller's own source text, passed through
// VERBATIM: the engine parses JSON or YAML — YAML is a superset — so
// re-encoding it here would only be a chance to change it. Anything else is
// serialized as JSON.
//
// There is deliberately no per-format function family. Format dispatch is the
// engine's, and an SDK that offered GenerateYAML would be claiming a
// distinction the engine does not make.
func encodeParams(params any) ([]byte, error) {
	switch typed := params.(type) {
	case nil:
		return []byte("{}"), nil
	case string:
		return []byte(typed), nil
	case []byte:
		return typed, nil
	}

	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	// The engine reads UTF-8 and this is not a web page: escaping `<`, `>`
	// and `&` into \u sequences would rewrite the caller's data for a threat
	// model that does not apply here.
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(params); err != nil {
		return nil, usagef("params could not be serialized as JSON: %v", err)
	}
	return bytes.TrimRight(out.Bytes(), "\n"), nil
}
