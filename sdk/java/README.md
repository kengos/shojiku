# Shojiku for Java

JVM bindings for [Shojiku](https://shojiku.kengos.jp) — a document engine that
turns a YAML template plus your data into a deterministic PDF. Usable
from Java, Kotlin and Scala alike.

## Install

The engine binary ships in a **platform classifier jar**, and you ask for
it by name: Maven resolves a classifier only when a dependency declares
one, so the main artifact alone installs cleanly and then fails at first
render with `no engine library was found`. This is the same shape Netty
and LWJGL use — the alternative, one jar carrying every platform, would
put ~23 MB of binaries no build needs into every consumer's dependency
tree. Declare both — the classifier for the system you build for:

| System | Classifier |
| --- | --- |
| Linux x86-64 | `linux-x64` |
| Linux arm64 | `linux-arm64` |
| macOS x86-64 | `darwin-x64` |
| macOS arm64 (Apple Silicon) | `darwin-arm64` |
| Windows x86-64 | `win-x64` |

Maven:

```xml
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.2.0</version>
</dependency>
<dependency>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>0.2.0</version>
  <classifier>linux-x64</classifier>
</dependency>
```

Gradle:

```groovy
implementation 'jp.kengos:shojiku:0.2.0'
runtimeOnly 'jp.kengos:shojiku:0.2.0:linux-x64'
```

### Building for more than one platform

A build that runs on several systems picks the classifier per platform.
Maven has os activation built in, so this needs no plugin. Profiles in
**your own** POM are activated normally — the limitation is only on
profiles inside a dependency's POM, which is why this package does not
ship them for you:

```xml
<profiles>
  <profile>
    <id>shojiku-linux-x64</id>
    <activation><os><name>Linux</name><arch>amd64</arch></os></activation>
    <properties><shojiku.classifier>linux-x64</shojiku.classifier></properties>
  </profile>
  <profile>
    <id>shojiku-linux-arm64</id>
    <activation><os><name>Linux</name><arch>aarch64</arch></os></activation>
    <properties><shojiku.classifier>linux-arm64</shojiku.classifier></properties>
  </profile>
  <profile>
    <id>shojiku-darwin-x64</id>
    <activation><os><family>mac</family><arch>x86_64</arch></os></activation>
    <properties><shojiku.classifier>darwin-x64</shojiku.classifier></properties>
  </profile>
  <profile>
    <id>shojiku-darwin-arm64</id>
    <activation><os><family>mac</family><arch>aarch64</arch></os></activation>
    <properties><shojiku.classifier>darwin-arm64</shojiku.classifier></properties>
  </profile>
  <profile>
    <id>shojiku-win-x64</id>
    <activation><os><family>windows</family><arch>amd64</arch></os></activation>
    <properties><shojiku.classifier>win-x64</shojiku.classifier></properties>
  </profile>
</profiles>
```

then use `<classifier>${shojiku.classifier}</classifier>` on the second
dependency.

In Gradle, branch on the running platform:

```groovy
def shojikuClassifier = {
  def os = System.getProperty('os.name').toLowerCase()
  def arch = System.getProperty('os.arch')
  def cpu = (arch in ['aarch64', 'arm64']) ? 'arm64' : 'x64'
  if (os.contains('win')) return 'win-x64'
  return (os.contains('mac') ? 'darwin-' : 'linux-') + cpu
}()

implementation 'jp.kengos:shojiku:0.2.0'
runtimeOnly "jp.kengos:shojiku:0.2.0:${shojikuClassifier}"
```

Note that these select for the machine running the BUILD. A build that
produces an artifact for a different target — a Linux container image
built on a Mac — must pin the classifier to the target instead.

The engine is loaded through JNA, which is what keeps the floor at Java
21 — the newer foreign-function API would require 22 or later.

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

## Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your code signs them wherever the key is and hands the signature
back, so the key never enters your application:

```java
var provider = ExternalSigner.of(
    toBeSigned -> kms.sign(keyId, toBeSigned),
    Algorithm.ECDSA_P256_SHA256,
    Path.of("signer.crt"));
var signed = artifact.sign(provider);
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

Java 21 or newer.

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
