# Shojiku for .NET

.NET bindings for [Shojiku](../../README.md) — a document engine that
turns a YAML template plus your data into a deterministic PDF.

> **Built, not yet published.** The package is unreleased — all seven
> Shojiku SDKs publish together at v0.1.0. Until then, build it from a
> repository clone (`make verify:sdk:dotnet` runs its whole gate in a
> container) or use the CLI or the Docker image — see the
> [quickstart](../../docs/quickstart.md).

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

## Requirements

.NET 10 or newer.

## Documentation

- [Template reference](../../docs/engine/README.md) — how to write the
  YAML the engine renders
- [SDK policy](../../docs/agents/sdk.md) — the lifecycle contract every
  Shojiku SDK implements

## License

Licensed under any of [Apache-2.0](../../LICENSE-APACHE),
[MIT](../../LICENSE-MIT), or [BSD-3-Clause](../../LICENSE-BSD), at your
option.
