# Shojiku for .NET

.NET bindings for [Shojiku](https://shojiku.kengos.jp) — a document engine that
turns a YAML template plus your data into a deterministic PDF.

## Install

```bash
dotnet add package Shojiku
```

The engine binary ships as a runtime-identifier-specific asset inside the
package, so there is no build step on the supported platforms (Linux and
macOS on x64 and arm64, Windows on x64) and no native dependency to
deploy alongside your application.

## Usage

```csharp
using Shojiku;

using var client = new ShojikuClient(templates: "App/Templates");

var result = await client.GenerateAsync("receipt_ja", new {
    customer = new { name = "Yamada Shoji K.K." },
    items = new[] { new { name = "Consulting", qty = 1, price = 120000 } },
});

if (result.Success)
    await result.Artifact!.WriteAsync("receipt.pdf");
else
    foreach (var d in result.Failure!.Diagnostics) logger.LogWarning(d.Message);
```

Signing is a separate step over the rendered document:

```csharp
var signed = await result.Artifact!.SignAsync(new LocalPem(key: "signer.key", cert: "signer.crt"));
if (signed.Success)
    await signed.Artifact!.WriteAsync("receipt-signed.pdf");
```

Nothing throws in the normal flow: every operation returns a result you
query — `Success`, the artifact, and the engine's diagnostics (an
overflowing box, an unknown field). A failure carries a trace: which
step failed, and its structured cause, so it is data you log and
inspect rather than an exception you catch.

Every operation has a blocking form beside the `…Async` one, so a console
application is not pushed through `.GetAwaiter().GetResult()`.

The template root can also come from the `SHOJIKU_TEMPLATE_ROOT`
environment variable (useful for system-wide installs); template names
are identifiers, never paths. An explicit `templates:` beats that variable;
`SHOJIKU_LIBRARY` is the deliberate exception and beats an explicit
`library:`, because where the engine lives is a deployment decision.

## Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your code signs them wherever the key is and hands the signature
back, so the key never enters your application:

```csharp
var provider = new ExternalSigner(
    toBeSigned => kms.Sign(keyId, toBeSigned),
    Algorithm.EcdsaP256Sha256,
    cert: "signer.crt");
var signed = await artifact.SignAsync(provider);
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

.NET 10 or newer.

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
