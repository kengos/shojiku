package shojiku

import (
	"bytes"
	"context"
)

// passphraseVariable is the variable a key's passphrase crosses in, never argv.
const passphraseVariable = "SHOJIKU_PASSPHRASE"

// Client is the entry point: a configured engine, and the sources to render
// with it.
//
//	client, err := shojiku.NewClient(shojiku.WithTemplates("app/templates"))
//	if err != nil {
//	    return err
//	}
//	result, err := client.Generate(ctx, "receipt_ja", params)
//	if err != nil {
//	    return err
//	}
//	if result.Success() {
//	    result.Artifact().Write("receipt.pdf")
//	}
//
// Two entrances, deliberately. [Client.Generate] takes a template NAME and
// resolves it against the configured root, which is where the containment
// rules live. [Client.GenerateSource] takes the sources as BYTES the
// application already has — fetched from object storage, read out of a
// database, written inline — because fetching is the application's act and
// this package downloads nothing. Root containment does not apply to bytes a
// caller supplied: there is no root to be contained by, which is exactly why
// a strict client refuses that entrance.
//
// A Client is safe for concurrent use by multiple goroutines. Each call runs
// the engine in its own child process with its own private workspace; the
// only shared state is the once-per-binary capability probe, which is
// serialized.
type Client struct{ settings *settings }

// NewClient builds a client, finding the engine binary as it goes.
//
// It returns an error when no usable binary can be found — the reference SDK
// opens its engine in the constructor for exactly this reason, so a client
// cannot exist over an engine that is not installed and a container learns
// that at boot rather than at the first request.
func NewClient(opts ...Option) (*Client, error) {
	settings, err := newSettings(opts)
	if err != nil {
		return nil, err
	}
	return &Client{settings: settings}, nil
}

// TemplateRoot is the directory template names resolve against, or "" when
// nothing configured one.
func (c *Client) TemplateRoot() string {
	if c.settings.root == nil {
		return ""
	}
	return c.settings.root.path
}

// EngineInfo is what this build of the engine can do — its version,
// capability keys and builtin locales. Gate a feature on this rather than on
// a package version.
//
// A plain map, deliberately. The payload is an append-only wire this SDK does
// not model, exactly as a diagnostic's typed args pass through untranslated:
// a typed value would have to grow a field in seven languages every time the
// engine adds one, and an application reading a key its engine is too old to
// send already has to handle a missing one.
func (c *Client) EngineInfo(ctx context.Context) (map[string]any, error) {
	return c.settings.engine.engineInfo(ctx)
}

// Generate renders name with params.
//
// params may be a map or struct (serialized here), or a string or byte slice
// you already have — JSON or YAML, since the engine parses either and source
// text is passed through verbatim.
//
// A rejected template name is a FAILED RESULT, not an error: a hostile name
// is a fact about the request, not a bug in the program. What IS an error is
// having configured no template root at all.
func (c *Client) Generate(
	ctx context.Context, name string, params any, opts ...CallOption,
) (*Result, error) {
	if c.settings.root == nil {
		return nil, usagef("no template root: pass shojiku.WithTemplates(…) to NewClient, " +
			"set it with shojiku.Configure(), or set SHOJIKU_TEMPLATE_ROOT (which " +
			"WithEnv(false) disables). Sources you already hold go to GenerateSource.")
	}
	resolved, rejection := c.settings.root.resolve(name)
	if rejection != nil {
		return fromFailure(rejectionFailure(rejection)), nil
	}

	return c.settings.log.timed(StepGenerate, func() (*Result, error) {
		return c.render(ctx, func(*workspace) sources { return resolved },
			params, opts, OriginRendered)
	}, "template", bounded(name))
}

// GenerateSource renders sources the APPLICATION supplies.
func (c *Client) GenerateSource(
	ctx context.Context, src Source, params any, opts ...CallOption,
) (*Result, error) {
	if err := c.settings.lockdown.sourceEntrance(); err != nil {
		return nil, err
	}

	return c.settings.log.timed(StepGenerate, func() (*Result, error) {
		return c.render(ctx, src.materialize, params, opts, OriginSource)
	})
}

// Artifact re-enters an archived document, so bytes signed some time ago can
// be verified — or re-signed — without hand-building an artifact.
//
// The result is marked as loaded: its bytes are the caller's rather than this
// client's own render, which is a distinction a strict client acts on. Its
// page count is absent, honestly: nothing here laid anything out.
//
// The bytes are COPIED in, for the same reason [DocumentArtifact.Bytes] copies
// them out: a Go slice is a window onto memory the caller still holds, and an
// artifact whose contents can change under it is one whose signature or
// verdict is about something other than what was checked.
func (c *Client) Artifact(pdf []byte) *DocumentArtifact {
	return &DocumentArtifact{bytes: bytes.Clone(pdf), client: c, origin: OriginLoaded}
}

// Sign signs an artifact with provider, returning a result carrying the
// signed artifact. The signed bytes begin with the input byte for byte —
// signing appends a revision.
//
// provider is a [LocalPem], or the [ProviderName] of one registered with
// [WithProviders]. A strict client takes the name only.
func (c *Client) Sign(
	ctx context.Context, artifact *DocumentArtifact, provider Provider,
) (*Result, error) {
	signer, err := c.settings.lockdown.provider(provider)
	if err != nil {
		return nil, err
	}
	if err := c.settings.lockdown.signable(artifact); err != nil {
		return nil, err
	}

	return c.settings.log.timed(StepSign, func() (*Result, error) {
		return signer.signWith(ctx, c, artifact)
	})
}

// Verify verifies an artifact against trust anchors, returning a result whose
// value is a [VerificationReport].
//
// Anchors are required and are given as paths ([Anchors]) or as PEM bytes
// ([AnchorsPEM], which may carry several concatenated). Which form you passed
// is explicit rather than sniffed, and passing both is an error rather than a
// silent preference for one. There is no fallback to the machine's trust
// store, because the engine never consults one — a default would answer a
// different question than you asked.
//
// A signature that does not verify is a FAILED result that still carries the
// report, so NotChecked reaches you either way.
func (c *Client) Verify(
	ctx context.Context, artifact *DocumentArtifact, opts ...VerifyOption,
) (*Result, error) {
	anchors, err := resolveAnchors(opts)
	if err != nil {
		return nil, err
	}

	return c.settings.log.timed(StepVerify, func() (*Result, error) {
		return inWorkspace(func(ws *workspace) (*Result, error) {
			input := ws.write("input.pdf", artifact.bytes)
			paths := anchors.paths
			if anchors.pem != nil {
				paths = []string{ws.write("anchors.pem", anchors.pem)}
			}
			rep, _, err := c.settings.engine.execute(ctx, verifyArgs(input, paths), ws, nil)
			if err != nil {
				return nil, err
			}
			return verdictOutcome(rep)
		})
	})
}

// render is the shared body of both entrances: whatever the entrance has, in
// the one form the CLI takes.
func (c *Client) render(
	ctx context.Context,
	build func(*workspace) sources,
	params any,
	opts []CallOption,
	origin Origin,
) (*Result, error) {
	// Serialized BEFORE the workspace exists: params that cannot be encoded
	// are programmer misuse, and there is no reason to create a directory to
	// find that out.
	encoded, err := encodeParams(params)
	if err != nil {
		return nil, err
	}
	lang := firstNonEmpty(resolveCall(opts).lang, c.settings.lang())

	return inWorkspace(func(ws *workspace) (*Result, error) {
		argv := renderArgs(build(ws), ws.write("params.json", encoded), lang,
			c.settings.fontDirs(), c.settings.localeDirs())
		rep, pdf, err := c.settings.engine.execute(ctx, argv, ws, nil)
		if err != nil {
			return nil, err
		}
		return documentOutcome(rep, pdf, StepGenerate, c, origin)
	})
}

func materialPath(ws *workspace, name, path string, pem []byte) string {
	if path != "" {
		return path
	}
	return ws.write(name, pem)
}

func rejectionFailure(rejection *templateRejection) *Failure {
	failure := &Failure{
		step:    StepGenerate,
		kind:    rejection.kind,
		message: rejection.message,
	}
	if rejection.cause != "" {
		failure.cause = &Failure{step: StepGenerate, kind: "io", message: rejection.cause}
	}
	return failure
}
