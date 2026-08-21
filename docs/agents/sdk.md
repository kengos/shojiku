# SDK Policy (`sdk/`)

> **Status: all seven SDKs are built.** `sdk/ruby` is a working gem with its
> own gate (`make sdk:ruby:verify`) and is the **reference implementation** —
> every interface-shape question in a later SDK is answered by reading it, not
> by re-deciding. `sdk/python` (`make sdk:python:verify`) is the first mirror
> of it; `sdk/dotnet` (`make sdk:dotnet:verify`) and `sdk/java`
> (`make sdk:java:verify`) are the next two; `sdk/js`
> (`make sdk:js:verify`) is the fifth — the only one whose transport is a
> native addon rather than the shared cdylib — and `sdk/php`
> (`make sdk:php:verify`) and `sdk/go` (`make sdk:go:verify`) are the two
> whose transport is a CLI SUBPROCESS. Where each ecosystem's
> idiom legitimately differs is recorded in
> [../code-map/sdk.md](../code-map/sdk.md), one section per language.
> All seven released together at v0.1.0, and all seven install from their
> registries — php through a derived repository, for the reason in
> § How php is published.
>
> The other integration surfaces are the CLI (see the render commands in
> [the template reference](../engine/README.md)), the stdio MCP server,
> the browser WASM bindings, and the **shared C ABI library**
> (`engine/capi`) the in-process SDKs load. The transport decisions per
> language and the **list of decisions the Ruby SDK froze for the other
> six** are below: § The decisions the reference froze, § Transports.
> All seven are published, and the five in-process ones ship a prebuilt
> engine binary through their ecosystem's own channel; php and go carry no
> binary at all, because they drive the CLI.

```text
sdk/
  python/
  js/          (node)
  ruby/
  dotnet/      (c#)
  php/
  java/
  go/
```

Seven languages, chosen for where business documents actually get
printed. The Japanese SMB vertical-software market — auto-repair,
sales-management and similar product lines — is Windows/.NET on-prem,
and it is the segment that prints the most documents: the same params
producing an internal archive copy and a customer print copy, with
sign/verify mapping onto the Electronic Books Preservation Act's
authenticity requirement. The JVM covers the enterprise and systems
integrator side, where one artifact serves Java, Kotlin and Scala. The
remaining five are the common web and scripting stack. Languages beyond
these seven use the CLI and Docker image as the universal fallback.

## The lifecycle contract

Every SDK exposes the same artifact lifecycle, in that language's
idiom. The names differ; the shape does not. **The Ruby SDK is built
first and is the reference implementation** — the other six mirror its
interface shape, adapting names to their own conventions, never
inventing a different shape.

```text
generate(template_name, params)  -> Result<DocumentArtifact>
generate_source(template, …)     -> Result<DocumentArtifact>
artifact(bytes)                  -> DocumentArtifact
artifact.sign(provider)          -> Result<SignedDocumentArtifact>
artifact.verify()                -> Result<VerificationReport>
```

**Two entrances, and the contract difference between them.** The first
resolves a template NAME against the configured root, with all the
hardening below. The second takes the sources as BYTES the application
already holds (object storage, a database, a heredoc) — fetching them
stays the application's act, since no SDK downloads anything — and
**root containment does not apply to caller-supplied bytes**, which each
SDK's documentation states rather than leaves implied. What that
entrance must never do is read a file: its template argument is source
text, so a path-shaped value is a template that fails to parse. An SDK
that opened it would make every containment rule bypassable by spelling
the same thing differently. `artifact(bytes)` re-enters an archived
document so it can be verified or re-signed.

**Results, not exceptions.** No lifecycle operation raises in the
normal flow — a template that cannot render, a key that cannot sign, a
signature that does not verify are all *data*, returned in a result
wrapper the caller queries:

- `success?` / `failure?` (per-language spelling),
- the artifact on success,
- the engine's diagnostics either way (a successful render can still
  carry warnings),
- on failure, a **trace**: which lifecycle step failed
  (generate / sign / verify), the structured cause — engine
  diagnostics, or a host-side cause such as a missing binary — and the
  cause chain when one failure wraps another. The shape takes
  effect-ts's `Cause` as its conceptual reference: failures are
  inspectable values, never control flow. No SDK depends on an effect
  framework to provide it.

Exceptions remain what each language reserves for programmer misuse
(nil where a value is required, a template name that is not a string, a
client used after close), following that ecosystem's norms. Two more
things count as misuse rather than as outcomes, and both are deliberate:
passing an entrance a `strict:` client disables (see below), and
unwrapping a result that failed — an SDK may offer a raising accessor
for scripts, but calling it without checking success is asserting the
operation worked.

### Locking input down (`strict:`)

Once an SDK signs what it renders, template input is a security
boundary: whoever controls the bytes controls what gets signed. Every
SDK offers the same operator-declared ceiling, with **identical
semantics — this is contract, not ecosystem idiom**. A strict client
refuses the bytes entrance; signs only a document it rendered from the
template root (an artifact carries its ORIGIN, and signing inherits it,
so appending a revision cannot launder provenance); and accepts signing
material only as the NAME of a provider registered in configuration, so
a key path never appears in request-handling code. **Verification is
never restricted** — verifying bytes of unknown provenance is the point
of verify, and a locked-down deployment is precisely the one that must
check an archived document it did not produce.

### Configuration, logging, and secrets

An SDK may offer its ecosystem's configuration idiom (a `configure`
block, an options object, properties). It **feeds the constructor and
never adds a precedence level**: an explicit argument still wins, and a
configured value still beats the environment, with the library
asymmetry below unchanged. `strict` is the ONE exception and the only
place configuration beats a call site, because a restriction an operator
declared must not be liftable by application code.

A log channel is optional, silent by default, and host-side only: each
SDK accepts its ecosystem's standard logger interface and reports what
the BINDING did — the library it loaded and which lookup position won,
the ABI revision, which lifecycle step ran and how long it took.
**Never** params, document bytes, key material, a passphrase, or the
engine's diagnostics; whatever does cross is bounded and stripped as the
engine bounds its own echoed values. For the same reason a signing
provider overrides its printed form: the default one dumps the private
key and passphrase into consoles and exception reporters.

Material is **explicit, never sniffed, in both directions** — passing a
path and bytes for the same thing is misuse rather than a silent
preference, and the bytes form of `X` is spelled `X_pem` without the
noun changing number between the two forms.

An artifact yields its bytes in whatever forms the language considers
natural — a path, a byte string, a stream/IO object — plus metadata
(page count, the diagnostics the render emitted). The application never
sees layout-engine internals, and never a handle it has to free itself:
that is the binding layer's job.

```ruby
client = Shojiku::Client.new(templates: "app/templates")

result = client.generate("receipt_ja", params)
if result.success?
  result.artifact.write("receipt.pdf")
else
  result.failure.diagnostics.each { |d| logger.warn(d.message) }
end
```

```python
client = shojiku.Client(templates="app/templates")
result = client.generate("receipt_ja", params)
if result.success:
    result.artifact.write("receipt.pdf")
```

```go
client := shojiku.NewClient(shojiku.WithTemplates("app/templates"))
result := client.Generate(ctx, "receipt_ja", params)
if result.Success() {
    result.Artifact().Write("receipt.pdf")
}
```

```ts
const client = new Client({ templates: "app/templates" });
const result = await client.generate("receipt_ja", params);
if (result.success) {
  await result.artifact.write("receipt.pdf");
}
```

(The Node surface is async-only, and that is the contract rather than this
sketch's shorthand: rendering is CPU work the addon runs on the libuv
threadpool, so blocking node's single event loop for the length of one is
not a shape this SDK offers. The other built SDKs stay synchronous, .NET
excepted — see § Deferred follow-ups below.)

(The Go surface returns `(*Result, error)`, and that split is the
contract in Go's own vocabulary rather than a sketch's shorthand: the
error carries the CALLER's mistakes and a transport that got no answer,
while a document the engine refused stays a failed result with a nil
error. Go has no exceptions to mirror, so where the other six raise, it
returns — including for the opt-in unwrap, which is spelled
`result.Err()`. `NewClient` returns an error for the same reason the
reference opens its engine in the constructor: a client cannot exist
over an engine that is not installed.)

**`verify` wraps `shojiku-verify`** (see
[signing.md](signing.md)) and nothing else: an SDK never grows
a verification path of its own. The result an SDK surfaces is the engine's
report, INCLUDING the checks it did not perform — dropping the
"not checked" list on the way through the binding would turn a missing
capability into a false assurance, which is the one thing a verification
API must never do.

### Template names are identifiers, not paths

Template names resolve against a configured **template root**. A bundle
format will take that lookup over later, so nothing in an SDK's public
API may assume the directory is how names resolve.

The root itself may come from explicit configuration or from the
`SHOJIKU_TEMPLATE_ROOT` environment variable (the same family as
`SHOJIKU_FONT_DIR` / `SHOJIKU_BIN`) — a system-wide install like
`/usr/local/shojiku/templates` is a supported deployment, which is
exactly why the lookup must be hardened:

- explicit configuration always wins over the environment for the
  template root, and an application can disable environment lookup
  entirely. The Ruby reference fixed that knob as a SINGLE flag
  (`env: false`) governing every `SHOJIKU_*` lookup — the template root,
  the pack directories and the library path — because an application
  that wants a hermetic configuration wants all of it off, and
  per-variable knobs are a shape seven languages cannot keep consistent.
  The engine LIBRARY path is the one lookup that resolves the other way
  round (environment first), for the same reason `SHOJIKU_BIN` does:
  see § The decisions the reference froze below;
- a template name never contains a path: absolute paths and any `..`
  traversal are rejected as a failed result, and the resolved file must
  still be inside the root after canonicalization — a name must not be
  able to escape the root via symlinks or encoding tricks;
- **the rejection rules are the union across platforms, not the host's
  own.** Windows is a first-class target (it is what the .NET SDK's
  market runs on), so a backslash is a separator, `C:name` is
  drive-relative, `\\host\share` is a UNC path, and names like `CON` and
  `NUL` are reserved devices — every one of them rejected on **every**
  platform, so the same template name is valid or invalid everywhere;
- **the ROOT, unlike a name, is a path, and every shape of one is
  accepted**: relative or absolute, with or without a trailing
  separator, `templates` and `templates/` and `./templates` alike. It is
  canonicalized once — absolute, symlinks followed, no trailing
  separator — and containment compares against that canonical form.
  This is stated because leaving it unstated cost a bug: six SDKs
  canonicalize through a `realpath` that drops a trailing separator as a
  side effect, .NET's `Path.GetFullPath` PRESERVES one, and a root
  configured as `templates/` therefore contained nothing — every parent
  the containment walk compared against canonicalized without the
  separator. The contract is the accepted shapes, not whichever
  normalization a language's standard library happens to perform.
  **Containment stays structural** (walk the parents), never a string
  prefix compare, which would admit a sibling named `<root>-evil` —
  normalizing the root makes that mistake easier to reach, so each SDK
  pins it with a test.

## The decisions the reference froze

Fixed by `sdk/ruby`, the reference implementation, and implemented by all
seven. Read `sdk/ruby` for the executable answer; this is the list of
decisions that are NOT that SDK's local taste. An SDK that deviates from
one of these is making a design decision — route it to the architect
pass, never treat it as local idiom.

- **The lifecycle surface is `engine_info` / `generate` / `sign` /
  `verify`, and nothing else.** `validate` and `preview` are the
  AUTHORING surface's operations; the Designer reaches them through the
  WASM bindings. Binding them in an SDK would be surface with no
  contract behind it.
- **The result object**: `success?` / `failure?`, `value` with
  `artifact` and `report` as aliases named for what the operation
  produced, `diagnostics` on success as well as failure, `errors` and
  `warnings` as severity slices, `failure` carrying the trace.
- **The trace**: `step` (`generate` / `sign` / `verify`), `kind`,
  `message`, `diagnostics`, `cause`, and `causes` flattening the chain
  outermost first. **`step` is always the SDK's own lifecycle step** —
  the engine's error object names an INTERNAL stage (`render`,
  `validate`) and passing that through would make the field mean
  different things depending on which layer refused. What the engine
  said specifically is the `kind`.
- **One environment knob governs every `SHOJIKU_*` lookup** (`env:
  false` in ruby), not one flag per variable. An application that wants
  a hermetic configuration wants all of it off, and per-variable knobs
  are a shape nobody keeps consistent across seven languages.
- **Precedence, with one deliberate asymmetry.** Explicit configuration
  beats the environment for the template root and the pack directories —
  what an application renders is the application's own decision. The
  engine LIBRARY resolves the other way (`SHOJIKU_LIBRARY` beats
  explicit config beats the copy inside the platform package), matching
  the recorded `SHOJIKU_BIN` order: where the engine lives is a
  deployment decision that has to be able to win over application code.
- **The template layout** is `<root>/<name>/templates.yml` plus optional
  `definitions.yml` and `assets/` — the same shape as `examples/*/`, so
  an example directory IS a template-root entry. It stays behind a
  resolver interface so a bundle can take the lookup over later.
- **Artifact metadata**: `bytes` (binary), `page_count`, `diagnostics`,
  `write(path)`, `sign(provider)`, `verify(anchors:)`. `page_count` is
  absent (not zero) on a SIGNED artifact — signing appends a revision to
  bytes it never laid out, and zero would read as "a document with no
  pages".
- **Verification fails closed.** A signature that does not verify is a
  FAILED result — so a caller who checks only `success?` is not told a
  forgery is fine — and the report rides that failed result, because
  `not_checked` must reach the caller either way. A document that cannot
  be evaluated at all (no signature, unreadable container) has NO report,
  which is a different fact from an empty one.
- **A signing provider is a class**, not arguments on `sign` — which is
  what let the second one (`ExternalSigner`, for a key held in a cloud
  KMS, an HSM or a smartcard) arrive as a class rather than as a
  signature change in seven languages. `LocalPem` holds the key in the
  process; `ExternalSigner` takes a callable that signs the bytes the
  engine hands out, and the SDK ships no key-service client of its own.
  Either takes its material as paths or bytes, explicitly — never
  sniffed. All seven carry both. The five that link the library reach the
  seam through `shojiku_sign_prepare` / `shojiku_sign_complete`; the two
  subprocess ones script the CLI's `sign-prepare` / `sign-complete` verbs
  and probe `cli.sign.external` before using them.
- **The two failure levels map as the capi defines them**: a non-zero
  status becomes that language's programmer-misuse exception; status
  zero with `success` false becomes a failed result. A refused document,
  a missing locale pack, an unusable key and an unreadable anchor file
  are all the second kind.

### The revisions made before anything mirrored it

A pre-mirror fix batch on the reference. Everything above still holds;
these sharpen or extend it, and together they are the surface each SDK
is diffed against.

- **Two entrances, and the contract difference between them.** A NAME
  resolves against the template root, with its containment rules. A
  BYTES entrance (`generate_source`) takes the template — and optional
  definitions and an assets directory — as sources the application
  already holds, for object storage, a database or a heredoc. Fetching
  stays the application's act; no SDK downloads anything. **Root
  containment does not apply to caller-supplied bytes** (there is no
  root to be contained by), and the doc says so rather than leaving it
  implied. What the entrance must NOT do is read a file: the template
  argument is source text, so a path-shaped value is a template that
  fails to parse. An SDK that "helpfully" opened it would make every
  containment rule bypassable by spelling the same thing differently.
- **Artifact re-entry.** `client.artifact(bytes)` re-enters an archived
  document so it can be verified or re-signed. Its `page_count` is
  absent, because nothing laid it out.
- **An artifact carries its ORIGIN** — rendered (from the root),
  source (from caller bytes) or loaded (bytes handed over whole) — and
  **signing inherits the origin of what it signed**: appending a
  revision does not launder where a document came from. This exists for
  the lockdown below, and a boolean "was it loaded" is not enough: an
  artifact from another client's bytes-first render has engine-laid-out
  bytes and a caller's template.
- **The lockdown (`strict:`) is contract, not ecosystem idiom — the six
  mirror it with identical semantics.** Once signing is in the loop,
  template input is a security boundary. A strict client refuses the
  bytes entrance; signs only an artifact whose origin is `rendered`;
  and takes signing material only as the NAME of a provider registered
  in configuration, so a key path never appears in request-handling code
  and material loads into one object (which also shrinks the `inspect`
  surface). **Verification is never restricted** — verifying bytes of
  unknown provenance is the point of verify, and a locked-down
  deployment is exactly the one that must check an archived document.
  A refusal is that language's programmer-misuse exception, NOT a failed
  result: strict disables an entrance, so calling it is the program
  contradicting its own deployment rather than a fact about a document,
  and a failed result is something a `success?` check can swallow.
- **Configuration sugar feeds the constructor and never adds a
  precedence level.** Each SDK may offer its ecosystem's idiom (a
  `configure` block, an options object, properties); explicit
  constructor arguments still beat it, and it still beats the
  environment, with the library asymmetry unchanged. **`strict` is the
  ONE exception and the only place configuration beats a call site**: a
  restriction an operator declared must not be liftable by application
  code. A provider registry REPLACES rather than merges — a client
  declaring its own registry is stating the whole set it may sign with.
  No memoized default client ships: a global singleton adds a
  reset-on-reconfigure lifecycle that seven languages would each get
  subtly wrong. A reset entry point for test suites does ship.
- **The log channel is optional, silent by default, and host-side
  only.** Each SDK accepts its ecosystem's standard logger interface
  (duck-typed where the language allows, so no SDK grows a logging
  dependency) and reports what the BINDING did: which library it loaded
  and which lookup position won, the ABI revision, which lifecycle step
  ran, how long it took, whether it worked. **Never** params, document
  bytes, key material, a passphrase, or the engine's diagnostics — a log
  line is the easiest way for a secret to leave a process, and the
  diagnostics belong to the result the caller already holds. Whatever
  does cross (a template name, a provider name) is bounded and stripped
  exactly as the engine bounds its own echoed values.
- **A signing provider redacts itself.** The default `inspect`/`toString`
  of a provider object prints the private key and the passphrase into
  consoles, exception reporters and log lines. Every SDK overrides it to
  show the class and which FORM each half came from, and nothing else.
  This holds for a provider that holds NO key too: a callable-backed one
  closes over whatever built it, which in practice is a client carrying
  credentials, so it prints its certificate's form and its algorithm and
  never the callable.
- **Explicit, never sniffed, in BOTH directions.** Passing a path AND
  bytes for the same material (`key:`/`key_pem:`, `anchors:`/
  `anchors_pem:`) is programmer misuse, not a silent preference for one
  of them: preferring one ignores the argument the caller meant, on the
  path where reading the wrong key matters most.
- **The bytes form of X is spelled `X_pem`, and the noun does not change
  number between the two forms** — so the anchors are `anchors:` /
  `anchors_pem:`, matching `key:`/`key_pem:` and `cert:`/`cert_pem:`.
  (This settled the recorded naming-symmetry question.)
- **A template name that is not a string is programmer misuse**, while
  every hostile STRING name stays a failed result. A blank name is a
  hostile string, not misuse: it can arrive straight from a form field.
- **Params accept the engine's formats, verbatim.** A string params is
  passed through untouched and the engine parses JSON or YAML (YAML is a
  superset). No per-format method family: format dispatch is the
  engine's, deliberately.
- **A per-call locale beats the client-wide one.** The spelling is
  ecosystem idiom — Ruby derives a client (`with_lang`) because a
  keyword beside its trailing-hash params would break the ordinary
  `generate(name, key: value)` call; languages whose params are an
  ordinary argument use a per-call option. What is contract is the
  precedence, not the spelling.
- **Unwrap is opt-in, and the ruling behind it is frozen**: an accessor
  that raises the failure (`artifact!` / `report!`) may exist for
  scripts, and **calling it on a failed result is programmer misuse** —
  a caller who has not checked success is asserting the operation
  worked. Go is the recorded exception: with no exceptions in the
  language it mirrors the shape as an error return rather than a panic.
- **`engine_info` returns the payload unmodelled** — a plain
  map/dictionary — because it is an append-only wire, exactly as a
  diagnostic's typed `args` are. A typed value object would owe a new
  field in seven languages every time the engine adds one.
- **Concurrency is stated, not assumed.** The capi header now carries a
  THREADING section (operations are concurrency-safe, a handle is
  single-owner, and a binding may release its runtime lock around a
  call), pinned by a test that renders from four threads and compares
  the bytes. Each SDK states what its own client guarantees; the ruby
  reference documents that fiddle releases the GVL, so a long render
  does not block other threads.

## Per-language idiom: what the mirrors settled

Each SDK's own map section in
[../code-map/sdk.md](../code-map/sdk.md) records what that language
decided and why. Three rules came out of those stages that are CONTRACT
rather than idiom, and belong here because every language faces them:

- **Predicates follow a rule, not taste.** Ruby spells every predicate
  `foo?`; a language without that suffix needs a stated convention or
  each SDK improvises. The rule: an ADJECTIVE or PARTICIPLE stands alone
  (`success`, `failed`, `passed`, `valid`, `loaded`, `strict`), while a
  NOUN takes an `is` (`is_error` / `IsError` / `isError`), because a bare
  `diagnostic.error` reads as "the error object" rather than as a
  question. C# cases it `Success`/`IsError`, Java `success()`/`isError()`,
  Go `Success()`/`IsError()`. A reviewer diffing against ruby's `?` or
  against .NET's usual blanket `Is` prefix will flag these wrongly — the
  rule is the contract, the casing is not.
- **What the six mirror is the PRECEDENCE, not the spelling.** Ruby
  derives a client (`with_lang`) for the per-call locale only because a
  keyword beside its trailing-hash params breaks the ordinary
  `generate(name, key: value)` call form; every other language takes
  params as an ordinary argument and so spells it as a per-call option.
  Same for `success?`/`.success`/`Success`. Diff the rule, not the name.
- **A binding may need to make transport types PUBLIC, and that is not
  surface.** JNA instantiates argument and return types reflectively, so
  Java's `SizeT` cannot be package-private; both say so in their own
  javadoc. Found by a red test, not by review.

And one rule about the gate rather than the API: **the 100% bar is what
finds dead code and untestable guards.** It removed four unread members
across the .NET and JVM packages and forced three guards — the ABI
mismatch refusal, the blank-out-slot guard, the packaged-library
lookup's refusals — to be split into rules a test can call. A guard
nobody can exercise is a guard nobody knows works; reach for the split
rather than for an exclusion.

**But the bar measures lines, not SHAPES, and a packaging lookup is
about shape.** The JVM package's packaged-library lookup ran every line
at 100% and could not load one publishable artifact: its test planted
`native/` as an exploded directory on the classpath, while the thing
that ships is a jar, where the same entry is a `jar:` URL naming no
filesystem path. The suite even asserted the jar case resolved to
nothing, recording the defect as intended behaviour. Where a package
reaches its own installed payload — classifier jar, wheel, gem, RID
asset — the test builds the REAL container and reads through it; a
fixture that is merely convenient to construct tests the fixture. Go met the same wall from the other side:
an `interface{ marker() }` whose empty method nothing calls is a line no
coverage run can reach, so both of its closed interfaces carry a method
that does real work instead.

## Transports

One decision per language, and the reason it is not the others.

| Language | Transport | Why |
| --- | --- | --- |
| python | shared C ABI cdylib via `ctypes` | stdlib-only loading; no build step for the consumer |
| ruby | shared C ABI cdylib via `fiddle` | stdlib-only, and Ruby-version-independent — unlike a native extension, one binary serves every supported Ruby |
| c# | shared C ABI cdylib via P/Invoke | the platform's own FFI; RID-specific native assets are a solved NuGet pattern |
| java | shared C ABI cdylib via **JNA** | keeps the floor at Java 21. The FFM API is final only in 22, which would exclude the LTS the enterprise/SIer segment actually runs; JNI exports were rejected for adding a Rust-side surface the other three do not need |
| node | **napi-rs native addon** | the signing crates are host-side by design and never join the WASM build, so a WASM-transport SDK could not sign or verify in-process. The addon rides the same platform matrix as the cdylib. WASM stays what it already is: the browser/Workers path for the Designer |
| php | subprocess over the CLI | PECL is source-first with no good prebuilt channel; a pure-PHP package with no build step is the better trade |
| go | subprocess over the CLI | cgo is avoided deliberately; a subprocess SDK needs no build at all and stays a pure-Go module |

The cdylib is `engine/capi` (`shojiku-capi`), the **fourth thin host**
over `engine/authoring`, following the same rule as the CLI, MCP and
WASM hosts — it marshals, it does not re-implement. It is host-side only
and never joins the WASM build.

### Subprocess transport mechanics (php, go)

- The CLI binary is located in this order: the `SHOJIKU_BIN` environment
  variable, then explicit SDK configuration, then `PATH`.
- **Neither SDK downloads a binary, ever.** An SDK that fetches an
  executable at install or run time is a supply-chain surface the
  product's trust story cannot afford. Installation is the user's
  explicit act: today, a build from a repository clone or the Docker
  image (the [quickstart](../quickstart.md) has both); from the first
  public release, also a prebuilt binary off GitHub Releases and
  `cargo install shojiku-cli`, which needs the crates' `publish` gate
  flipped and so cannot work before then.
- A missing or unusable binary is a structured, named error that names
  the install channels — not a stack trace from a failed spawn.
- **The result comes back through `--report <path>`, not off stderr.**
  the CLI-report stage added it because the CLI could not otherwise serve the frozen
  contract: `shojiku: warning[…] …` on stderr carries no `code` and no
  typed `args`, nothing reported a render's page count, and every
  failure exited 1, so the two failure LEVELS were indistinguishable.
  The sidecar answers all three in one JSON object — `ok`,
  `diagnostics` (as the `{"items": […]}` object, the same shape the
  capi hands the other five SDKs), `pageCount`, `verification`, and a
  `failure` whose `class` is `usage` or `document`. Map `class` onto
  this track's two levels directly: `usage` is that language's
  programmer-misuse exception, `document` is a failed result. `kind`
  keeps the capi's spelling wherever the two overlap, so the mapping
  tables do not fork.
- **An unreadable INPUT FILE is `document`, not `usage`** — a template,
  key, certificate or anchor path that cannot be read comes back as a
  failed result, because § What the reference stage froze already rules that "an
  unusable key and an unreadable anchor file" are the second kind. It
  reads at first like the caller getting the invocation wrong; it is
  not, and the two subprocess SDKs must not re-decide it when they
  write their mapping tables.
- **A non-zero exit with no readable report is a HOST failure** — the
  spawn died, the binary is not the one we think, the arguments were
  rejected before anything ran. That is the "malformed CLI output"
  case in the stage bar, and it is programmer-misuse-shaped, not a
  fact about a document.
- Detect the flag through `capabilities`: the key is `cli.report`. An
  older binary without it cannot serve the contract, and saying so is
  better than parsing prose.
- The BYTES entrance materializes the caller's sources into a private
  temporary directory (0700, unique per call, removed afterwards) and
  passes paths, because the CLI reads files. That is the SDK WRITING
  what it was handed, which is a different act from the file-read the
  frozen contract forbids: a path-shaped `template` argument is still
  source text that fails to parse, never a file that gets opened.

## Boundary: never reimplement the layout engine

Every SDK calls into the same engine core through one of:

- the shared C ABI library (`engine/capi`, built — its contracts and
  status model are in [engine/features.md](../engine/features.md) and
  its header is `engine/capi/include/shojiku.h`, which also states the
  threading contract: operations are concurrency-safe, a handle is
  single-owner, and a binding may release its runtime's lock around a
  call),
- a native addon built from the same crates,
- a CLI subprocess, whose result comes back through the CLI's
  `--report <path>` sidecar (capability key `cli.report`) rather than
  off stderr: prose carries no diagnostic `code` and no typed `args`,
  and the report's `failure.class` (`usage` / `document`) is what maps
  onto the two failure levels below. Mechanics:
  § Subprocess transport mechanics below.

Which one a given language uses is decided per language in
§ Transports below. "Port the layout
algorithm to language X" is never an acceptable answer — it guarantees
drift between the SDKs, the GUI and the CLI, and it breaks the promise
that the same params produce the same bytes everywhere.

The same rule applies downward: an SDK does not re-format numbers or
dates, does not measure text, and does not construct PDF objects. If a
capability is missing, it is missing in the engine and gets added there.

Diagnostics returned by the engine are carried on the result wrapper
(see the lifecycle contract above) preserving the engine's stable
diagnostic `code` and its typed arguments — consistently across SDKs.
Don't invent per-SDK diagnostic shapes, don't convert them into thrown
exceptions, and don't translate messages: translation is a presentation
concern, as it is for the GUI.

**No SDK downloads anything at install or run time.** The subprocess
SDKs locate an already-installed CLI; the native ones ship their binary
inside the package the registry serves. An SDK that fetches an
executable is a supply-chain surface this product cannot justify.

## Supported language versions

The policy, which outlives any version number: **support every upstream
release line that is not end-of-life, except those whose upstream
support ends within six months** — a floor that dies a month after
release helps nobody. Re-derive at each release rather than trusting the
numbers below.

| Language | Floor | Note |
| --- | --- | --- |
| Python | 3.11 | 3.10 reaches end-of-life 2026-10 |
| Node | 22 | maintenance LTS; security support to 2027-04 |
| Ruby | 3.3 | end-of-life 2027-03 |
| .NET | `net10.0` | .NET 8 LTS and 9 STS both end 2026-11, leaving 10 the only admitted line |
| PHP | 8.3 | 8.2 reaches end-of-life 2026-12 |
| Java | 21 | the binding is JNA precisely so the floor can stay at this LTS; the FFM API would force 22+ |
| Go | 1.25 | see below |

Go is a documented exception: it supports only the two newest releases,
about a year each, so *every* possible floor falls inside a six-month
horizon and the rule would demand an unreleased version. Go's
compatibility promise makes the `go` directive a minimum rather than a
ceiling, so the floor is the older of the two supported releases.

## Mandatory lint/test gates, per language

Formatting/style and the 100%-coverage-in-CI requirement follow the
general rules in [../guidelines.md](../guidelines.md). Every SDK package
must have CI running its language's standard gate before merge,
including the coverage gate. No SDK ships without these.

**These gates run in a container, like every other gate in this
repository** — working on an SDK never requires that language's
toolchain installed locally, and the engine binary is injected into the
image already compiled rather than built from Rust source there. The
mechanics, and the `.dockerignore` trap that bites SDK images
specifically, are in § Development environment below.

**Python**
- `ruff check` and `ruff format --check`
- `mypy` with strict-ish settings on the package's own code
- `pytest --cov --cov-fail-under=100`
- Package builds via the standard `pyproject.toml` flow

**Node/TypeScript**
- Biome (the config family `gui/` uses) at zero warnings
- `tsc --noEmit`
- `vitest run --coverage` with `thresholds` set to `100`
- Package publishes cleanly under an `npm pack` dry run in CI

**Ruby**
- RuboCop clean (project-standard config, not a suppressed one)
- RSpec (preferred) or Minitest test suite
- SimpleCov with `minimum_coverage 100` in `.simplecov`
- Gem builds and installs cleanly (`gem build`, `bundle exec rake install`)

**C# / .NET**
- `dotnet format --verify-no-changes`
- Analyzers on with warnings as errors
- xUnit (preferred) or NUnit test suite
- Coverlet with a 100% line threshold (`/p:Threshold=100
  /p:ThresholdType=line`), which fails the build natively
- `dotnet pack` produces a package that restores cleanly

**PHP**
- `php-cs-fixer` (or PSR-12 via `phpcs`) clean
- `phpstan` at a high level (start at level 6+, raise over time)
- PHPUnit with Xdebug/PCOV coverage
  (`phpunit --coverage-clover=coverage.xml`), plus a CI step asserting
  the clover report shows 100% line coverage (PHPUnit has no native
  fail-under flag)
- `composer validate`

**Java**
- Spotless (or Checkstyle) clean
- ErrorProne or the compiler's own lint with warnings as errors
- JUnit 5 test suite
- JaCoCo with a `LINE` `COVEREDRATIO` rule of 1.0, which fails the
  build natively
- The Maven/Gradle build produces the sources and javadoc jars Central
  requires

**Go**
- `gofmt -l` clean (or `goimports -l`)
- `go vet`
- `golangci-lint run`
- `go test ./... -race -coverprofile=cover.out`, plus a CI step
  asserting 100% total coverage (Go has no native fail-under flag, so a
  small script or a tool like `go-test-coverage` is required)

## Development environment — Docker, with the binary injected

**Every SDK's development and gate environment is a container**, which
extends the rule the rest of the repo already follows: no local
toolchain, gates run through the `make` wrapper. Nobody needs Python,
Ruby, PHP, a JDK, .NET, Go or Node installed to work on an SDK.

**The engine binary is injected as a pre-compiled artifact — never
rebuilt from Rust source inside a language image.** Seven images each
compiling the CLI would make the gate grid unusable. The binary is
built once through the existing Rust wrapper, cached at a project-root
path, and `COPY`d into whichever SDK image needs it; in CI and at
release the same slot takes the artifact the platform matrix already
produces.

Two things every stage's image must get right:

- **The root `.dockerignore` excludes `sdk`.** It applies to every
  build that uses the repository root as its context, so an SDK image
  built naively cannot see the package it exists to test — and the
  failure reads as a missing directory, not as an ignore rule. Give
  each SDK Dockerfile a sidecar `<Dockerfile>.dockerignore`, which
  fully replaces the root file for that build; that is also what admits
  the cached binary into the context.
- **A brand-new image is not green on demand.** Building and running it
  once is part of the stage that adds it, not a later chore.

Each stage builds its image beside the package it gates, and adds that
language's `verify:sdk:<lang>` target to the gate grid at the same time.
the reference stage did both: `sdk/ruby/Dockerfile` with its sidecar ignore file, and
`sdk:ruby:verify` / `sdk:ruby:test` / `sdk:ruby:lint` beside the
engine/gui/docker scopes; the python stage, and then the .NET and JVM stage for two languages at once, did
the same. `make engine:capi-lib` is the shared half — it builds
the HOST-architecture cdylib once, through the pinned Rust image, into
the gitignored `dist/capi/local/`, and every later SDK image copies from
there rather than adding a Rust build of its own. The subprocess SDKs have
the same half under a different artifact: `make engine:cli-bin` builds the
host-architecture `shojiku` BINARY into `dist/cli/local/`, which
`sdk/php/Dockerfile` and `sdk/go/Dockerfile` both copy to
`/opt/shojiku/bin` and point `SHOJIKU_BIN` at.

Two things that image had to get right and every one since has too: the
library must be able to LOAD against the language image's libc, and it must
land OUTSIDE the repository path the gate mounts, or the mount hides it.

**The libc rule is "at least as new", not "the same distribution".** Ruby and
python could both say "bookworm on both sides"; .NET cannot, because Microsoft
ships no Debian-based .NET 10 image at all — the Linux tags are `noble`
(Ubuntu 24.04), `azurelinux3.0` and `alpine`. glibc is BACKWARD compatible, so
the cdylib built on the bookworm Rust image (glibc 2.36) loads on noble (2.39)
and only the reverse would fail; alpine would load nothing, being musl. A
later stage picking a base image checks that direction rather than matching a
distribution name.

## Install proofs — the gate the injected binary cannot be

Because every gate injects the engine, no gate can answer the question a
release poses: does the package reach the engine THROUGH ITS OWN
PACKAGING? The JVM package shipped unable to load from its own platform
classifier jar at 100% line coverage — its tests exercised an exploded
directory, the shipped shape is an archive — and that class of defect is
invisible to every per-language gate by construction.

`scripts/install-proof/<lang>.sh` (`make proof:<lang>`, all seven under
`make proof`, CI job `install-proof`) closes it: embed the host-arch
payload the way the release does, build the REAL package, install it
into a clean floor-version container with no injected engine and no
`SHOJIKU_LIBRARY`/`SHOJIKU_BIN`, construct a client, render a bundled
example. One platform deliberately — the shape of payload lookup does
not vary across the release matrix, only the binary does.

Two packaging rules exist because a proof failed without them, and the
proofs are what keep them true: the ruby gemspec's files list includes
`lib/shojiku/native/*` (a `*.rb` glob builds a platform gem with no
engine in it), and the dotnet csproj packs `runtimes/**` (a README-only
pack list builds a nupkg that installs and cannot render). The proofs
run with network (each installs its packaging toolchain), so they are
NOT in `make verify`; CI runs them as their own matrix.

## How php is published: a derived repository

Six SDKs publish by uploading a package. php cannot, and the reason is
structural rather than a gap in the tooling: **Packagist resolves
`composer.json` from a repository ROOT**, and this repo keeps php's at
`sdk/php/composer.json`. Moving the manifest to the root instead would
claim the whole monorepo as the php package and drag every font pack
into a `composer require` — roughly 47 MB for `ipamj-mincho` alone — so
that option is closed, not merely unattractive.

php therefore publishes as **`kengos/shojiku-php`, a derived repository
that Packagist tracks**, produced by `git subtree split --prefix=sdk/php`
(`scripts/release/split-php.sh` builds the commits;
`publish-packages.yml`'s `php` job pushes them). Four rules hold it in
place:

- **It is a build ARTIFACT.** Never hand-edited; the monorepo stays the
  source, and `composer.json`'s `support.source` keeps pointing here — a
  reader who wants the code should land where the code is developed.
- **It carries the REAL history**, not a synthetic commit per release, so
  the split is a pure function of this repository's history: re-running
  it reproduces the same shas and a push is a fast-forward.
- **Its tags are a strict MIRROR of this repository's `v*` tags.** The job
  creates only tags that already exist here and never moves one, so the
  derived repo cannot serve a version the monorepo has not released. That
  matters because the release procedure creates the tag by publishing the
  draft GitHub Release — i.e. after the publish run — so php is dispatched
  a second time, on its own, once the tag exists.
- **The split root must stand on its own.** A subtree split cannot inject
  files, so anything a Packagist visitor needs has to live in `sdk/php/`
  in this tree: the README (which is why its links are absolute, and why
  it names the monorepo as the development home) and a copy of the licence
  set, gated against drift by `scripts/check-php-licenses.sh`.

`make proof:published:php` is the arm that proves it, and it is the only
proof drawing on two publish channels — the composer package from
Packagist, the CLI from the GitHub Release — because this package drives
a binary rather than carrying one.

Two properties of the **backfilled `v0.1.0`** are worth knowing, because
both read as defects and neither is one. That tag reproduces `sdk/php` as
it stood at v0.1.0, so it carries no licence FILES (they were added with
this publish path) and its `homepage` is the GitHub repo rather than the
site (the metadata pass that moved it landed afterwards). The tag is
faithful to what shipped; both resolve at the next release.

Three things only the real registry could have caught, all of them found
that way and worth not rediscovering. `actions/checkout` leaves an
`http.https://github.com/.extraheader` that overrides the credentials in
a remote URL, so the push went out as `github-actions[bot]` until
`persist-credentials: false` — which is also why the dry run ends with a
`git push --dry-run` rather than an `ls-remote`: the derived repo is
PUBLIC, so reading it authorizes nothing and succeeds with any token at
all. And Packagist serves the package as a dist ZIP, which the floor php
image cannot open without `unzip`.

## Deferred follow-ups

Each is a decided deferral with a recorded reason, not an open question.
None is queued; raise any of them with the user before filing.

1. **Languages beyond the seven** — the CLI and Docker image remain the
   universal fallback, and that is the story the integration
   documentation tells rather than an eighth binding.
2. **musl / additional platform targets** — added on demand rather than
   carried through every stage's build matrix from the start.
3. **A WASM-transport node package** — a separate artifact from the napi
   addon, worth revisiting only if a Workers/edge deployment target
   appears; it can never carry sign or verify.
4. **Async APIs beyond what an ecosystem requires** — node and .NET get
   async surfaces because blocking their runtimes for the length of a
   render is not acceptable there (the .NET and JVM stage shipped .NET's, over `Task.Run`,
   beside the blocking calls); the other five stay synchronous,
   since rendering is CPU work with no I/O to overlap and an async
   wrapper would be ceremony over a blocking call. Revisit only if a
   language's users ask.
5. **Streaming output** — artifacts are handed over whole. Streaming
   matters only for documents large enough that nothing in the current
   test corpus approaches it.

## Package metadata: where the URLs point

Every registry renders a *homepage* link and a *source* link, and they
are different places: **homepage is `https://shojiku.pages.dev`**, the
product's own site, and **source / repository / documentation stay on
GitHub**. This holds for everything published, the engine's crates
included. The fields, per registry, are the whole list — there is no
other lever:

| registry | homepage field | source/doc fields |
| --- | --- | --- |
| RubyGems | `spec.homepage` (+ `metadata["homepage_uri"]`) | `source_code_uri`, `documentation_uri` — built off the `SHOJIKU_REPO` constant, *not* off `spec.homepage` |
| PyPI | `[project.urls] Homepage` | `Source`, `Documentation` |
| npm | `homepage` | `repository`, `bugs` |
| NuGet | `<PackageProjectUrl>` | `<RepositoryUrl>` |
| Maven Central | `<url>` | `<scm><url>` |
| Packagist | `homepage` | `support.source`, `support.issues`, `support.docs` |
| pkg.go.dev | **none** — derived from the module path | none |
| crates.io | `homepage` | `repository` — both set once in `engine/Cargo.toml` `[workspace.package]`, inherited by every published crate |

Go therefore carries its link in prose: the package comment in
`sdk/go/doc.go` and the README, which pkg.go.dev renders. The five
platform addon packages `scripts/release/assemble.sh` generates
(`@shojiku/<os>-<cpu>`) get their own npm pages, so their generated
`package.json` carries the homepage too.

**A shipped README's links must be absolute.** npm, PyPI, NuGet,
Packagist and pkg.go.dev render the README as the package page, where a
link written relative to the repository resolves against the registry's
own host and 404s. (RubyGems does not render it — it shows the gemspec
description and the sidebar links, which is why the metadata URIs above
carry the weight there.) Link to the site for the product and to
`https://github.com/kengos/shojiku/blob/main/…` for anything in the
checkout.

## Versioning

SDK versions move in lockstep with the engine's workspace version while
everything is pre-1.0, and all seven publish together at the first
public release. Once a bundle format exists, each SDK's README documents
the bundle-format compatibility its version tracks.
