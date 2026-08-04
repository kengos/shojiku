# Shojiku for PHP

PHP bindings for [Shojiku](https://shojiku.pages.dev) — a document engine that
turns a YAML template plus your data into a deterministic PDF.

> **Not on Packagist yet.** The other six Shojiku SDKs shipped at v0.1.0;
> this one waits on its Packagist registration. Until it lands, install
> from a clone of this repository (`composer config
> repositories.shojiku path /path/to/shojiku/sdk/php`).

## Install

```bash
composer require shojiku/shojiku
```

This package is pure PHP with **no dependencies and no extension to
compile**: it drives the `shojiku` command-line binary as a subprocess.
**Install that binary separately** — the package never downloads an
executable, by design. Take it from the [GitHub
release](https://github.com/kengos/shojiku/releases/latest) (a per-platform
archive plus the shared `packs` archive), `cargo install shojiku-cli`, or
the Docker image; the
[quickstart](https://github.com/kengos/shojiku/blob/main/docs/quickstart.md)
covers them.

The SDK looks for the binary in the `SHOJIKU_BIN` environment variable
first, then the path you configure, then `PATH`.

## Usage

```php
use Shojiku\Client;
use Shojiku\LocalPem;

$client = new Client(templates: 'app/templates');

$result = $client->generate('receipt_ja', [
    'customer' => ['name' => 'Yamada Shoji K.K.'],
    'items' => [['name' => 'Consulting', 'qty' => 1, 'price' => 120000]],
]);

if ($result->success()) {
    $result->artifact()->write('receipt.pdf');
} else {
    foreach ($result->failure()->diagnostics() as $d) {
        error_log($d->message());
    }
}
```

Signing is a separate step over the rendered document:

```php
$signed = $result->artifact()->sign(new LocalPem(key: 'signer.key', cert: 'signer.crt'));
if ($signed->success()) {
    $signed->artifact()->write('receipt-signed.pdf');
}
```

And verification answers with the whole report — including what it did
**not** check, which is a field rather than a footnote:

```php
$result = $client->artifact(file_get_contents('receipt-signed.pdf'))
    ->verify(anchors: 'ca.crt');

if ($result->success()) {
    echo 'valid; not checked: ', implode(', ', $result->report()->notChecked()), "\n";
}
```

Nothing throws in the normal flow: every operation returns a result you
query — `success()`, the artifact, and the engine's diagnostics (an
overflowing box, an unknown field) on a success as well as a failure. A
failure carries a trace: which step failed, and its structured cause, so
it is data you log and inspect rather than an exception you catch. A
signature that does not verify is a **failed** result, so a caller who
checks only `success()` is never told a forgery is fine.

Exceptions are reserved for programmer misuse — a template name that is
not a string, both forms of the same material at once, unwrapping a
result you did not check — plus the two the environment can produce: a
missing binary (`BinaryNotFoundException`, which names the install
channels) and one too old to report what it did
(`IncompatibleEngineException`).

## Templates the application already holds

`generate()` resolves a template NAME against the configured root, with
containment rules that reject paths, traversal, and every Windows
spelling of one. When the sources come from object storage, a database
or a heredoc instead, hand them over as bytes:

```php
$result = $client->generateSource(
    template: $yamlYouFetched,
    definitions: $definitionsYouFetched,
    params: $params,
);
```

That argument is source TEXT: a path-shaped value is a template that
fails to parse, never a file this package opens. Root containment does
not apply here, because there is no root to be contained by.

## Configuration

```php
Shojiku\Configuration::configure([
    'templates' => 'app/templates',
    'lang' => 'ja-JP',
    'strict' => true,
    'providers' => ['invoice' => new LocalPem(key: '/etc/shojiku/signer.key', cert: '/etc/shojiku/signer.crt')],
]);
```

An explicit constructor argument beats this, which beats the
`SHOJIKU_TEMPLATE_ROOT` / `SHOJIKU_FONT_DIR` / `SHOJIKU_LOCALE_DIR`
environment; `SHOJIKU_BIN` is the deliberate exception and beats both,
because where the engine lives is a deployment decision. `env: false`
turns every one of those lookups off — in this process **and** in the
engine child, which would otherwise read them itself.

`strict: true` is the other exception, and the only place configuration
beats a call site: it refuses the bytes entrance, signs only documents
this client rendered from its own template root, and takes signing
material only as the name of a registered provider. Verification is
never restricted.

## Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your code signs them wherever the key is and hands the signature
back, so the key never enters your application:

```php
$provider = new Shojiku\ExternalSigner(
    sign: fn (string $toBeSigned): string => $kms->sign($keyId, $toBeSigned),
    cert: 'signer.crt',
    algorithm: Shojiku\Algorithm::EcdsaP256Sha256,
);
$signed = $artifact->sign($provider);
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

PHP 8.3 or newer, and the `shojiku` binary installed as described above.

## Development

Gates run in a container, so no PHP toolchain is needed locally:

```bash
make verify:sdk:php
```

`make test:sdk:php` and `make lint:sdk:php` are the faster slices.

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
