# Shojiku for Java

JVM bindings for [Shojiku](../../README.md) — a document engine that
turns a YAML template plus your data into a deterministic PDF. Usable
from Java, Kotlin and Scala alike.

> **Built, not yet published.** The artifact is unreleased — all seven
> Shojiku SDKs publish together at v0.1.0. Until then, build it from a
> repository clone (`make verify:sdk:java` runs its whole gate in a
> container) or use the CLI or the Docker image — see the
> [quickstart](../../docs/quickstart.md).

## Install

Maven:

```xml
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.1.0</version>
</dependency>
```

Gradle:

```groovy
implementation 'jp.kengos:shojiku:0.1.0'
```

The engine binary ships in a platform classifier jar resolved for your
system, so there is no build step on the supported platforms (Linux and
macOS on x86-64 and arm64, Windows on x86-64). The engine is loaded
through JNA, which is what keeps the floor at Java 21 — the newer
foreign-function API would require 22 or later.

## Usage

```java
var client = ShojikuClient.builder().templates("src/main/templates").build();

var result = client.generate("receipt_ja", Map.of(
    "customer", Map.of("name", "Yamada Shoji K.K."),
    "items", List.of(Map.of("name", "Consulting", "qty", 1, "price", 120000))));

if (result.success()) {
    result.artifact().write(Path.of("receipt.pdf"));
} else {
    result.failure().diagnostics().forEach(d -> log.warn(d.message()));
}
```

Signing is a separate step over the rendered document:

```java
var signed = result.artifact().sign(new LocalPem(Path.of("signer.key"), Path.of("signer.crt")));
if (signed.success()) {
    signed.artifact().write(Path.of("receipt-signed.pdf"));
}
```

Verification takes the trust anchors explicitly — there is no fallback to
the machine's trust store, because the engine never consults one:

```java
var report = signed.artifact().verify(List.of(Path.of("ca.crt")));
// A signature that does not verify is a FAILED result that still carries the
// report, so `notChecked()` — what this release did NOT look at — reaches you
// either way.
```

Nothing throws in the normal flow: every operation returns a result you
query — `success()`, the artifact, and the engine's diagnostics (an
overflowing box, an unknown field). A failure carries a trace: which
step failed, and its structured cause, so it is data you log and
inspect rather than an exception you catch.

The template root can also come from the `SHOJIKU_TEMPLATE_ROOT`
environment variable (useful for system-wide installs); template names
are identifiers, never paths. An explicit `templates(…)` beats that
variable; `SHOJIKU_LIBRARY` is the deliberate exception and beats an
explicit `library(…)`, because where the engine lives is a deployment
decision.

The only runtime dependency is JNA.

## Requirements

Java 21 or newer.

## Documentation

- [Template reference](../../docs/engine/README.md) — how to write the
  YAML the engine renders
- [SDK policy](../../docs/agents/sdk.md) — the lifecycle contract every
  Shojiku SDK implements

## License

Licensed under any of [Apache-2.0](../../LICENSE-APACHE),
[MIT](../../LICENSE-MIT), or [BSD-3-Clause](../../LICENSE-BSD), at your
option.
