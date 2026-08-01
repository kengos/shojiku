package shojiku

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The two files a template directory may hold.
const (
	templateFile    = "templates.yml"
	definitionsFile = "definitions.yml"
)

// dosDevices are the reserved DOS device names. Windows resolves these no
// matter what directory you are in and no matter what extension you append.
var dosDevices = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true,
	"COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true,
	"LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

var (
	separatorRule     = regexp.MustCompile(`[/\\]`)
	controlRule       = regexp.MustCompile(`[\x00-\x1f\x7f]`)
	driveRelativeRule = regexp.MustCompile(`^[A-Za-z]:`)
)

// templateRejection is a refused template name, or a template that could not
// be read.
//
// Internal: [Client.Generate] turns it into a failed result, because a
// hostile template name is a fact about the request rather than a bug in the
// calling program. It carries the machine-readable kind the failure trace
// reports, and the underlying detail as the trace's cause when there is one.
type templateRejection struct {
	kind    string
	message string
	cause   string
}

// templateRoot resolves a template NAME to the sources behind it.
//
// A name is an identifier, never a path. A bundle format will take this
// lookup over later, so nothing outside this type may assume a directory is
// how names resolve — callers ask for "receipt_ja" and get sources back.
//
// The rejection rules are the union across platforms, not the host's. Windows
// is a first-class target (it is what the .NET SDK's market runs on), so a
// backslash is a separator, `C:name` is drive-relative, `\\host\share` is a
// UNC path and CON/NUL are reserved devices — every one of them refused on
// EVERY platform. A template name that is valid on one machine is valid on
// all of them, which is the only way the same application deploys to both.
//
// This transport resolves to PATHS, not bytes. The CLI reads files, so
// reading the template here only to hand the child a copy of it would add a
// rewrite between the operator's file and the render for no gain. What does
// NOT change is that the name never becomes a path outside this type, and
// that containment is proved after canonicalization rather than by the shape
// of the string alone.
type templateRoot struct{ path string }

// resolve resolves name, or says why it will not.
func (r *templateRoot) resolve(name string) (sources, *templateRejection) {
	if rejection := rejectName(name); rejection != nil {
		return sources{}, rejection
	}
	resolved, rejection := r.contained(filepath.Join(r.path, name))
	if rejection != nil {
		return sources{}, rejection
	}
	template := filepath.Join(resolved, templateFile)
	if rejection := readable(template); rejection != nil {
		return sources{}, rejection
	}
	definitions := filepath.Join(resolved, definitionsFile)
	if readable(definitions) != nil {
		definitions = ""
	}
	return sources{template: template, definitions: definitions, assetsDir: resolved}, nil
}

// rejectName applies every name-shape rule, or returns nil.
//
// A free function taking only the name, so each rule is provable without a
// root on disk. Note what is NOT here: a name that is not a string cannot
// reach this package at all, because [Client.Generate] takes a string — the
// other SDKs check at run time what Go's type system checks at compile time.
// A BLANK name is the other case and stays a refused request: it can arrive
// straight from a form field.
func rejectName(name string) *templateRejection {
	if strings.TrimSpace(name) == "" {
		return &templateRejection{
			kind:    "template_name",
			message: "a template name must not be empty",
		}
	}
	for _, rule := range []struct {
		broken bool
		why    string
	}{
		{separatorRule.MatchString(name), "a name is one segment, so `/` and `\\` are never " +
			"part of it (which is also what makes `..` traversal impossible)"},
		{controlRule.MatchString(name), "it contains a control character"},
		{driveRelativeRule.MatchString(name), "it is drive-relative, which Windows resolves " +
			"against that drive's current directory"},
		{isDOSDevice(name), "it is a reserved device name on Windows"},
	} {
		if rule.broken {
			return &templateRejection{
				kind:    "template_name",
				message: "`" + bounded(name) + "` is not a template name: " + rule.why,
			}
		}
	}
	return nil
}

// isDOSDevice reports whether name resolves to a reserved Windows device.
//
// Trailing dots and spaces are STRIPPED by Windows before it resolves a name,
// so `CON.` and `"CON "` are the CON device just as `CON` is. Without that
// strip they slip past this rule and are refused later, by containment —
// still refused, but with a message about a missing template rather than
// about a reserved name.
func isDOSDevice(name string) bool {
	stem, _, _ := strings.Cut(name, ".")
	stem = strings.TrimRight(stem, ". \t\n\r\x00\v")
	return dosDevices[strings.ToUpper(stem)]
}

// contained is the check a name-shape rule cannot make: after following
// whatever the filesystem has there, is the answer still inside the root? A
// symlink is what this exists for — it passes every rule above and still
// points out.
//
// filepath.EvalSymlinks ERRORS on a path that does not exist, which is the Go
// form of a trap every mirror has met at this check (php's realpath returns
// false, python's non-strict resolve succeeds happily). Here the branch is
// the ordinary error one, and a missing name is reported as not found rather
// than canonicalized and read.
func (r *templateRoot) contained(dir string) (string, *templateRejection) {
	notFound := &templateRejection{kind: "template_not_found", message: "no template by that name"}
	root, err := filepath.EvalSymlinks(r.path)
	if err != nil {
		return "", notFound
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return "", notFound
	}
	// STRUCTURAL, not a prefix compare: a sibling directory named
	// `<root>-evil` starts with the root's own path.
	if resolved != root && !strings.HasPrefix(resolved, root+string(filepath.Separator)) {
		return "", &templateRejection{
			kind:    "template_escapes_root",
			message: "the template resolves outside the template root",
		}
	}
	return resolved, nil
}

// readable reports whether path is a file this package can hand to the engine.
//
// A STRUCTURAL check — is it a regular file — rather than a permission probe.
// The gate container runs as root, where a mode-based "unreadable" fixture
// proves nothing, so the shape that can actually be tested is the one that is
// checked.
func readable(path string) *templateRejection {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return &templateRejection{
			kind:    "template_unreadable",
			message: "the template could not be read",
			cause:   bounded(path) + " is not a readable file",
		}
	}
	return nil
}
