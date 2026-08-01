package shojiku

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// generate runs the name entrance and insists the call itself succeeded — a
// refused NAME is a failed result, never an error, so a test that gets an
// error here has found a different bug from the one it was written for.
func generate(t *testing.T, client *Client, name string) *Result {
	t.Helper()
	result, err := client.Generate(context.Background(), name, map[string]any{})
	if err != nil {
		t.Fatalf("Generate(%q) returned an error rather than a failed result: %v", name, err)
	}
	return result
}

func assertRejected(t *testing.T, result *Result, kind string) {
	t.Helper()
	if result.Success() {
		t.Fatal("the name was accepted")
	}
	if got := result.Failure().Kind(); got != kind {
		t.Errorf("kind = %q, want %q (message: %s)", got, kind, result.Failure().Message())
	}
}

func TestABlankNameIsARefusedRequestRatherThanMisuse(t *testing.T) {
	// It can arrive straight from a form field, so it is a fact about the
	// request rather than a bug in the program.
	client := newTestClient(t)

	for _, name := range []string{"", "   ", "\t"} {
		assertRejected(t, generate(t, client, name), "template_name")
	}
}

func TestEveryHostileNameShapeIsRefused(t *testing.T) {
	// The union across platforms, not the host's: a name valid on one machine
	// is valid on all of them, which is the only way the same application
	// deploys to Linux and Windows both.
	client := newTestClient(t)
	for _, hostile := range []struct {
		name string
		why  string
	}{
		{"/etc/passwd", "an absolute path"},
		{"C:receipt", "drive-relative"},
		{`\\host\share`, "a UNC path"},
		{"../receipt", "traversal with a separator"},
		{"sub/receipt", "a forward-slash separator"},
		{`sub\receipt`, "a backslash separator"},
		{"receipt\x00.yml", "a NUL"},
		{"rec\x1feipt", "a control character"},
		{"CON", "a reserved device"},
		{"NUL", "a reserved device"},
		{"con.yml", "a reserved device with an extension"},
		{"CON.", "a reserved device with a trailing dot"},
		{"CON ", "a reserved device with a trailing space"},
	} {
		t.Run(hostile.why+"/"+hostile.name, func(t *testing.T) {
			assertRejected(t, generate(t, client, hostile.name), "template_name")
		})
	}
}

func TestBareTraversalIsRefusedByContainmentRatherThanByShape(t *testing.T) {
	// `..` carries no separator, so no name-shape rule fires on it. What
	// refuses it is canonicalization: the answer is outside the root.
	assertRejected(t, generate(t, newTestClient(t), ".."), "template_escapes_root")
}

func TestASymlinkPointingOutsideTheRootIsNotFollowed(t *testing.T) {
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, templateFile), []byte("version: 0.1.0\n"), 0o644); err != nil {
		t.Fatalf("writing the outside template: %v", err)
	}
	root := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatalf("linking: %v", err)
	}

	_, rejection := (&templateRoot{path: root}).resolve("escape")

	if rejection == nil || rejection.kind != "template_escapes_root" {
		t.Fatalf("rejection = %+v, want template_escapes_root", rejection)
	}
}

func TestASiblingSharingTheRootsPrefixDoesNotPassContainment(t *testing.T) {
	// The reason containment is a STRUCTURAL parent test rather than a string
	// prefix compare: `<root>-evil` starts with the root's own path.
	parent := t.TempDir()
	root := filepath.Join(parent, "root")
	evil := filepath.Join(parent, "root-evil")
	for _, dir := range []string{root, evil} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatalf("creating %s: %v", dir, err)
		}
	}

	resolved, rejection := (&templateRoot{path: root}).contained(evil)

	if rejection == nil || rejection.kind != "template_escapes_root" {
		t.Fatalf("contained(%q) = %q, %+v; want it refused", evil, resolved, rejection)
	}
}

func TestARootThatDoesNotExistIsNotFound(t *testing.T) {
	root := &templateRoot{path: filepath.Join(t.TempDir(), "absent")}

	_, rejection := root.resolve("receipt")

	if rejection == nil || rejection.kind != "template_not_found" {
		t.Fatalf("rejection = %+v, want template_not_found", rejection)
	}
}

func TestANameThatDoesNotExistIsNotFound(t *testing.T) {
	assertRejected(t, generate(t, newTestClient(t), "no-such-template"), "template_not_found")
}

func TestADirectoryWithNoTemplateFileIsRefusedAsUnreadable(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "empty"), 0o700); err != nil {
		t.Fatalf("creating the fixture: %v", err)
	}

	_, rejection := (&templateRoot{path: root}).resolve("empty")

	if rejection == nil || rejection.kind != "template_unreadable" {
		t.Fatalf("rejection = %+v, want template_unreadable", rejection)
	}
	if rejection.cause == "" {
		t.Error("the rejection carries no cause for the trace")
	}
}

func TestADirectoryWhereTheTemplateBelongsIsRefusedToo(t *testing.T) {
	// The structural form of "unreadable", which is the shape a gate running
	// as root can actually produce — a chmod proves nothing there.
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "odd", templateFile), 0o700); err != nil {
		t.Fatalf("creating the fixture: %v", err)
	}

	_, rejection := (&templateRoot{path: root}).resolve("odd")

	if rejection == nil || rejection.kind != "template_unreadable" {
		t.Fatalf("rejection = %+v, want template_unreadable", rejection)
	}
}

func TestAnOptionalDefinitionsFileIsUsedWhenPresentAndAbsentOtherwise(t *testing.T) {
	root := &templateRoot{path: fixtureTemplates(t)}

	withSchema, rejection := root.resolve("receipt")
	if rejection != nil {
		t.Fatalf("resolving receipt: %+v", rejection)
	}
	if !strings.HasSuffix(withSchema.definitions, definitionsFile) {
		t.Errorf("definitions = %q, want the fixture's own", withSchema.definitions)
	}

	without, rejection := root.resolve("warns")
	if rejection != nil {
		t.Fatalf("resolving warns: %+v", rejection)
	}
	if without.definitions != "" {
		t.Errorf("definitions = %q, want none", without.definitions)
	}
	if without.assetsDir == "" {
		t.Error("the assets directory is not set")
	}
}

func TestAHostileNameIsEchoedBoundedInItsRefusal(t *testing.T) {
	long := strings.Repeat("a", 200) + "/escape"

	result := generate(t, newTestClient(t), long)

	message := result.Failure().Message()
	if strings.Contains(message, strings.Repeat("a", textLimit+1)) {
		t.Errorf("the refusal echoed an unbounded name: %s", message)
	}
}

func TestGeneratingWithNoTemplateRootIsMisuse(t *testing.T) {
	// Not a failed result: nothing was asked about a document. The message
	// names every way to configure one.
	client, err := NewClient(WithEnv(false), WithBinary(engineBinary(t)))
	if err != nil {
		t.Fatalf("building the client: %v", err)
	}

	_, err = client.Generate(context.Background(), "receipt", nil)

	assertUsage(t, err, "WithTemplates")
	if client.TemplateRoot() != "" {
		t.Errorf("TemplateRoot() = %q, want empty", client.TemplateRoot())
	}
}
