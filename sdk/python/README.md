# Shojiku for Python

Python bindings for [Shojiku](../../README.md) — a document engine that
turns a YAML template plus your data into a deterministic PDF, then signs
and verifies the result.

## Install

```bash
pip install shojiku
```

Wheels carry a prebuilt engine binary, so there is no build step on the
supported platforms (Linux and macOS on x86-64 and arm64, Windows on
x86-64). The binding itself is `ctypes` from the standard library, so the
package has **no runtime dependencies at all** and works on every
supported interpreter without compiling anything.

## Usage

```python
import shojiku

client = shojiku.Client(templates="app/templates")

result = client.generate("receipt", {"customer": {"name": "Yamada Shoji K.K."}})

if result.success:
    result.artifact.write("receipt.pdf")
else:
    for diagnostic in result.failure.diagnostics:
        print(diagnostic)
```

`params` may be a dict, or a string you already hold — the engine parses
JSON or YAML, and a string is passed through verbatim:

```python
client.generate("receipt", "customer:\n  name: Yamada Shoji K.K.\n")
```

To render one template in several locales, pass `lang` per call. It beats
the client's own locale for that call only:

```python
client.generate("receipt", params, lang="ja-JP")
```

### Sources you already hold

When a template does not live in a directory this package can see —
fetched from object storage, read out of a database, written inline —
hand the sources over directly:

```python
result = client.generate_source(
    template=template_yaml,        # source TEXT, never a path
    definitions=definitions_yaml,  # optional
    assets_dir="/srv/assets",      # optional; without it bundled images are off
    params={"customer": {"name": "Yamada Shoji K.K."}},
)
```

Fetching them stays your application's act — nothing here opens a socket.
The `template` argument is source text, so a path-shaped value is a
template that fails to parse: this entrance never reads a file, because an
SDK that "helpfully" opened it would make every containment rule below
bypassable by spelling the same thing differently.

**Root containment does not apply to caller-supplied bytes** — there is no
root to be contained by. A deployment that wants to forbid this entrance
entirely declares [`strict`](#locking-down-where-signable-input-comes-from).

To re-enter a document you archived earlier, so it can be verified or
signed again:

```python
artifact = client.artifact(pdf_bytes)
artifact.verify(anchors="ca.pem")
```

### Results, not exceptions

No lifecycle operation raises in the normal flow. A template that will not
render, a key that will not sign, a signature that does not verify are all
*data* you query:

```python
result = client.generate("receipt", params)

result.success          # bool
result.failed           # bool
result.artifact         # the DocumentArtifact, or None
result.diagnostics      # what the engine noticed — on SUCCESS too
result.errors           # the diagnostics that are errors
result.warnings         # the ones that are warnings
result.failure          # the trace, on failure
```

Diagnostics ride on a success as well: a render that worked can still have
warned about an overflowing box, and a caller that only looks at failures
never sees them. Each one carries the engine's stable `code` and its typed
`args` untranslated, so you can render your own message from them.

A failure is a value, not a control-flow event:

```python
failure = result.failure
failure.step          # "generate" | "sign" | "verify" — this SDK's own step
failure.kind          # a stable machine-readable class
failure.message
failure.diagnostics
failure.causes        # this failure and everything under it, outermost first
```

For a script that would rather have a traceback than a branch, `unwrap()`
raises instead of returning:

```python
artifact = client.generate("receipt", params).unwrap()
```

Calling it on a failed result is programmer misuse — a caller who has not
checked `success` is asserting the operation worked.

What *does* raise is programmer misuse (`shojiku.UsageError`) and an
environment with no engine in it (`shojiku.LibraryNotFoundError`).

## Templates

A template name is an **identifier, never a path**. Names resolve against
the configured template root, laid out as `<root>/<name>/templates.yml`
plus an optional `definitions.yml` and `assets/` directory — the same
shape as this repository's `examples/*/`.

Rejection rules are the union across platforms, not the host's: absolute
paths, `..` traversal, both separators, drive-relative names like
`C:receipt`, UNC paths, control characters and reserved DOS device names
(`CON`, `NUL`, `COM1`…) are refused on **every** platform, so a name that
is valid on one machine is valid on all of them. The resolved directory
must still be inside the root after canonicalization, which is what stops
a symlink that a name-shape rule cannot see.

A refused name is a failed result, not an exception — a hostile name is a
fact about the request, not a bug in your program. A name that is not a
string at all *is* a bug, and raises.

## Configuration

```python
shojiku.configure(templates="app/templates", lang="ja-JP")
```

This feeds the constructor; it never adds a precedence level of its own:

    explicit argument  >  shojiku.configure  >  SHOJIKU_*

for the template root and the pack directories. The engine **library**
resolves the other way round — `SHOJIKU_LIBRARY` beats both — because
where the engine lives is a deployment decision that has to be able to win
over application code.

`env=False` disables every `SHOJIKU_*` lookup at once (the template root,
the pack directories and the library path). One flag rather than one per
variable: an application that wants a hermetic configuration wants all of
it off.

`strict` is the one setting `configure` wins outright — see below.

### Locking down where signable input comes from

Once this SDK signs what it renders, template input is a security
boundary: whoever controls the bytes controls what gets signed. A strict
client narrows where signable input may come from.

```python
shojiku.configure(
    strict=True,
    providers={"invoice": shojiku.LocalPem(key="signer.key", cert="signer.crt")},
)

client.sign(artifact, "invoice")   # by NAME, not by object
```

A strict client refuses `generate_source`; signs only a document it
rendered from the template root (an artifact carries its `origin`, and
signing inherits it, so appending a revision cannot launder provenance);
and takes signing material only as the name of a provider registered in
configuration, so a key path never appears in request-handling code.

**Verification is never restricted.** Verifying bytes of unknown
provenance is the point of verify, and a locked-down deployment is
precisely the one that must check an archived document it did not produce.

A refusal raises `UsageError` rather than returning a failed result:
strict disables an *entrance*, so calling it is the program contradicting
its own deployment — not a fact about a document — and a failed result is
something an `if result.success:` check can swallow.

## Signing and verification

```python
provider = shojiku.LocalPem(key="signer.key", cert="signer.crt")
signed = artifact.sign(provider)

report = signed.artifact.verify(anchors="ca.pem").report
report.valid
report.signature, report.coverage, report.certificate_validity, report.trust_chain
report.not_checked        # what this release did NOT look at
```

Material is **explicit, never sniffed, in both directions**: paths go to
`key` / `cert` / `anchors`, bytes go to `key_pem` / `cert_pem` /
`anchors_pem`, and passing both forms of the same thing raises rather than
silently preferring one. A provider redacts itself when printed, because
the default `repr` would dump the private key and passphrase into consoles
and exception reporters.

Anchors are required — there is no fallback to the machine's trust store,
because the engine never consults one and a default would answer a
different question than you asked.

**Verification fails closed.** A signature that does not verify is a
*failed* result, so a caller who checks only `success` is never told a
forgery is fine. The report rides that failed result anyway, because
`not_checked` must reach you either way. A document that cannot be
evaluated at all — no signature, unreadable container — has no report,
which is a different fact from an empty one.

### Logging

Optional, silent by default, and host-side only. Any object with a
`debug` method is accepted, so this package grows no logging dependency:

```python
import logging

client = shojiku.Client(templates="app/templates", logger=logging.getLogger("shojiku"))
```

It reports what the *binding* did — which library it loaded and which
lookup position won, the ABI revision, which lifecycle step ran, how long
it took, whether it worked. **Never** params, document bytes, key
material, a passphrase, or the engine's diagnostics: a log line is the
easiest way for a secret to leave a process, and the diagnostics belong to
the result you already hold.

### Threads

Every operation may be called from several threads at once, and
concurrent calls produce identical bytes for identical input. This binding
loads the engine with `ctypes.CDLL`, which **releases the GIL** around
each foreign call, so a long render does not block the rest of your
process.

## Development

Nobody needs Python installed to work on this package — the gates run in a
container, like every other gate in this repository:

```bash
make verify:sdk:python
```

`test:sdk:python` and `lint:sdk:python` are the faster slices. The engine
library is injected already compiled; `make capi-lib` builds it.

## Requirements

Python 3.11 or newer.

## Documentation

- [Template reference](../../docs/engine/README.md) — how to write the
  YAML the engine renders
- [SDK policy](../../docs/agents/sdk.md) — the lifecycle contract every
  Shojiku SDK implements

## License

Licensed under any of [Apache-2.0](../../LICENSE-APACHE),
[MIT](../../LICENSE-MIT), or [BSD-3-Clause](../../LICENSE-BSD), at your
option.
