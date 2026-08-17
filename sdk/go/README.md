# Shojiku for Go

Go bindings for [Shojiku](https://shojiku.pages.dev) — a document engine that
turns a YAML template plus your data into a deterministic PDF.

## Install

```bash
go get github.com/kengos/shojiku/sdk/go
```

This module is pure Go with **no dependencies and no cgo**: it drives the
`shojiku` command-line binary as a subprocess, so `go build` stays a plain
cross-compilable build. **Install that binary separately** — the module
never downloads an executable, by design. Take it from the [GitHub
release](https://github.com/kengos/shojiku/releases/latest) (a per-platform
archive plus the shared `packs` archive), `cargo install shojiku-cli`, or
the Docker image; the
[quickstart](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)
covers them.

The SDK looks for the binary in the `SHOJIKU_BIN` environment variable
first, then the path you configure, then `PATH`.

## Usage

```go
import shojiku "github.com/kengos/shojiku/sdk/go"

client, err := shojiku.NewClient(shojiku.WithTemplates("app/templates"))
if err != nil {
    return err // no engine installed; the message names the install channels
}

result, err := client.Generate(ctx, "receipt_ja", map[string]any{
    "customer": map[string]any{"name": "Yamada Shoji K.K."},
    "items": []any{map[string]any{"name": "Consulting", "qty": 1, "price": 120000}},
})
if err != nil {
    return err
}

if result.Success() {
    result.Artifact().Write("receipt.pdf")
} else {
    for _, d := range result.Failure().Diagnostics() {
        log.Println(d.Message())
    }
}
```

Signing is a separate step over the rendered document:

```go
signer, err := shojiku.NewLocalPem(
    shojiku.KeyPath("signer.key"),
    shojiku.CertPath("signer.crt"),
)
signed, err := result.Artifact().Sign(ctx, signer)
if err == nil && signed.Success() {
    signed.Artifact().Write("receipt-signed.pdf")
}
```

And verification answers with the whole report — including what it did
**not** check, which is a field rather than a footnote:

```go
archived, _ := os.ReadFile("receipt-signed.pdf")

result, err := client.Artifact(archived).Verify(ctx, shojiku.Anchors("ca.crt"))
if err == nil && result.Success() {
    fmt.Println("valid; not checked:", result.Report().NotChecked())
}
```

## The two return values, and which one carries what

Every operation returns `(*Result, error)`, and the two carry different
kinds of bad news.

The **error** is your program's problem, or your deployment's: a misused
argument, an entrance this client's lockdown disables, an engine that is
not installed, or a subprocess that gave no answer at all. Handle it the
way you handle any Go error; `errors.Is` matches the class sentinels
(`shojiku.ErrUsage`, `shojiku.ErrBinaryNotFound`, …).

The **result** is the document's: a template that will not render, a key
that will not sign, a signature that does not verify. Those are data you
query — `Success()`, the artifact, and the engine's diagnostics (an
overflowing box, an unknown field) on a success as well as a failure. A
failure carries a trace: which step failed, and its structured cause.

Keeping them apart is deliberate. A signature that does not verify is a
**failed result**, not an error, so a caller who checks only `err` is
never told a forgery is fine. `result.Err()` is there for scripts that
want one branch instead of two.

## Templates the application already holds

`Generate` resolves a template NAME against the configured root, with
containment rules that reject paths, traversal, and every Windows
spelling of one. When the sources come from object storage, a database
or a heredoc instead, hand them over as bytes:

```go
result, err := client.GenerateSource(ctx, shojiku.Source{
    Template:    yamlYouFetched,
    Definitions: definitionsYouFetched,
}, params)
```

`Template` is source TEXT: a path-shaped value is a template that fails
to parse, never a file this module opens. Root containment does not
apply here, because there is no root to be contained by.

## Configuration

```go
shojiku.Configure(
    shojiku.WithTemplates("app/templates"),
    shojiku.WithLang("ja-JP"),
    shojiku.WithStrict(true),
    shojiku.WithProviders(map[string]shojiku.Provider{"invoice": signer}),
)
```

An explicit option passed to `NewClient` beats this, which beats the
`SHOJIKU_TEMPLATE_ROOT` / `SHOJIKU_FONT_DIR` / `SHOJIKU_LOCALE_DIR`
environment; `SHOJIKU_BIN` is the deliberate exception and beats both,
because where the engine lives is a deployment decision.
`WithEnv(false)` turns every one of those lookups off — in this process
**and** in the engine child, which would otherwise read them itself.

`WithStrict(true)` is the other exception, and the only place
configuration beats a call site: it refuses the bytes entrance, signs
only documents this client rendered from its own template root, and
takes signing material only as the `ProviderName` of a registered
provider. Verification is never restricted.

A `*Client` is safe for concurrent use. Each call runs the engine in its
own child process with its own private working directory; the one piece
of shared state, the capability probe, is serialized. There is
deliberately no built-in timeout — how long a render may take is a
property of the document — but the `context.Context` you pass cancels
one.

## Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your code signs them wherever the key is and hands the signature
back, so the key never enters your application:

```go
provider, err := shojiku.NewExternalSigner(
    func(toBeSigned []byte) ([]byte, error) { return kms.Sign(ctx, keyID, toBeSigned) },
    shojiku.ExternalCert("signer.crt"),
    shojiku.ExternalAlgorithm(shojiku.ECDSAP256SHA256),
)
signed, err := client.Sign(ctx, artifact, provider)
```

The call site does not change — which provider you pass is the only
difference, and a provider registered by name works the same way under a
strict client. This package ships no cloud client of its own: the
callback is whichever client your application already uses.

Two details worth getting right. The bytes you are handed are the CMS
**signed attributes**, not the document's digest — a service that signs a
digest must hash *these* bytes with SHA-256 itself. And the signature is
that operation's raw output: PKCS#1 v1.5 bytes for `rsa-pkcs1-sha256`, an
ASN.1 DER sequence for `ecdsa-p256-sha256`, which is what AWS KMS and
Google Cloud KMS both return unchanged.

A failure inside your own code is *not* swallowed into a failed result:
an outage at your key service is not a fact about the document.

## Requirements

Go 1.25 or newer, and the `shojiku` binary installed as described above.

## Development

Gates run in a container, so no Go toolchain is needed locally:

```bash
make verify:sdk:go
```

`make test:sdk:go` and `make lint:sdk:go` are the faster slices.

## Documentation

- [Template reference](https://github.com/kengos/shojiku/blob/main/docs/engine/README.md) —
  how to write the YAML the engine renders
- [SDK policy](https://github.com/kengos/shojiku/blob/main/docs/agents/sdk.md) —
  the lifecycle contract every Shojiku SDK implements

## License

Licensed under any of
[Apache-2.0](https://github.com/kengos/shojiku/blob/main/LICENSE-APACHE),
[MIT](https://github.com/kengos/shojiku/blob/main/LICENSE-MIT), or
[BSD-3-Clause](https://github.com/kengos/shojiku/blob/main/LICENSE-BSD),
at your option.
