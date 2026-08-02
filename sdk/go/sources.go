package shojiku

// sources is what a render is given, in the one form the CLI can take: paths.
//
// Produced either by the template root (paths it resolved and proved
// contained) or from caller-supplied bytes (which the workspace materializes
// first). That is what keeps the second entrance from being a second code
// path — by the time anything reaches the transport there is one shape.
//
// The materialization is NOT the file-read the contract forbids. Writing
// bytes the caller handed over is a different act from opening a path the
// caller handed over: a path-shaped Template argument is still source text
// that fails to parse, never a file that gets read.
type sources struct {
	template    string
	definitions string
	assetsDir   string
}

// Source is a template the APPLICATION supplies, as bytes it already holds.
//
// For templates that do not live in a directory this package can see: fetched
// from object storage, stored in a database, or written inline. Fetching them
// stays the application's act — nothing here opens a socket.
type Source struct {
	// Template is source TEXT. A path-shaped value is a template that fails
	// to parse, never a file that gets opened: an SDK that "helpfully" read
	// it would make every containment rule bypassable by spelling the same
	// thing differently.
	Template string
	// Definitions is the optional schema, also as source text.
	Definitions string
	// AssetsDir is where bundled image sources resolve against. Per call
	// rather than per client, because bundled assets belong to a template
	// rather than to a deployment. Without it, bundled image sources are
	// disabled: inline sources have no directory of their own.
	AssetsDir string
}

// materialize writes caller-supplied source text into ws and returns the
// paths the CLI will read.
func (s Source) materialize(ws *workspace) sources {
	out := sources{
		template:  ws.write(templateFile, []byte(s.Template)),
		assetsDir: s.AssetsDir,
	}
	if s.Definitions != "" {
		out.definitions = ws.write(definitionsFile, []byte(s.Definitions))
	}
	return out
}
