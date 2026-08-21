# Shojiku for Ruby

Ruby bindings for [Shojiku](https://shojiku.pages.dev) — a document engine that
turns a YAML template plus your data into a deterministic PDF, signs it,
and verifies it.

## Install

```bash
bundle add shojiku
```

Platform gems carry a prebuilt engine library, so there is no build step
on the supported platforms (Linux and macOS on x86-64 and arm64, Windows
on x86-64). The engine is loaded through `fiddle` from the standard
library rather than as a native extension, which means one binary serves
every supported Ruby — no recompile when you upgrade the interpreter.

## Usage

```ruby
require "shojiku"

client = Shojiku::Client.new(templates: "app/templates")

result = client.generate("receipt_ja", {
  customer: { name: "Yamada Shoji K.K." },
  items: [{ name: "Consulting", qty: 1, price: 120_000 }],
})

if result.success?
  result.artifact.write("receipt.pdf")
else
  result.failure.causes.each { |cause| warn cause.to_s }
end
```

`params` is a Hash, or a String you already have — JSON *or* YAML, since
the engine parses either and a String is passed through verbatim. There
is no per-format method: format dispatch is the engine's.

To render one template in several locales, derive a client:

```ruby
client.with_lang("ja-JP").generate("receipt_ja", params)
```

A derived client shares the loaded engine — deriving re-opens nothing —
and the locale it names beats the one the client was built with.

### Sources you already hold

`generate` resolves a template *name* against the configured root.
When the sources come from somewhere else — object storage, a database,
a heredoc — hand them over directly:

```ruby
result = client.generate_source(
  template: File.read("invoice.yml"),   # source text, never a path
  definitions: definitions_yaml,        # optional
  assets_dir: "app/templates/invoice",  # optional; bundled images resolve here
  params: params
)
```

Fetching the bytes stays your application's act: this gem opens no
sockets and reads no template off disk here. `template:` is **source
text** — a value that looks like a path is a template that fails to
parse, not a file this gem will open — so the containment rules that
guard the name entrance are not being bypassed, they are simply not
involved. A deployment that wants to forbid this entrance entirely
declares [`strict:`](#locking-down-where-signable-input-comes-from).

An archived document goes back in the same way:

```ruby
archived = client.artifact(File.binread("2026-invoices/0042.pdf"))
archived.verify(anchors: "ca.crt")
```

Signing is a separate step over the rendered document, and verification
is a separate step over that:

```ruby
signed = result.artifact.sign(
  Shojiku::LocalPem.new(key: "signer.key", cert: "signer.crt")
)

checked = signed.artifact.verify(anchors: "ca.crt")
checked.report.valid?        # every check this release performs passed
checked.report.not_checked   # => [:revocation, :timestamp]
```

**Read `not_checked` beside the verdict.** `valid?` means "nothing we
looked at was wrong", not "this document is trustworthy" — revocation
and timestamping are not checked in this release, and the report says so
on a passing verdict as well as a failing one. A document whose
signature does not verify comes back as a *failed* result that still
carries the full report.

### Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your block signs them wherever the key is and hands the signature
back, so the key never enters your application:

```ruby
provider = Shojiku::ExternalSigner.new(cert: "signer.crt",
                                       algorithm: :ecdsa_p256_sha256) do |to_be_signed|
  kms.sign(key_id: ENV.fetch("KEY_ID"), message: to_be_signed,
           message_type: "RAW", signing_algorithm: "ECDSA_SHA_256").signature
end

signed = result.artifact.sign(provider)
```

The call site is unchanged — which provider you pass is the only
difference, and a provider registered by name works the same way under
`strict:`. This gem ships no cloud client of its own: the block is
whichever client your application already uses.

Two details worth getting right. The bytes handed to the block are the
CMS **signed attributes**, not the document's digest — a service that
signs a digest must hash *these* bytes with SHA-256 itself. And the
signature is that operation's raw output: PKCS#1 v1.5 bytes for
`:rsa_pkcs1_sha256`, an ASN.1 DER sequence for `:ecdsa_p256_sha256`,
which is what AWS KMS and Google Cloud KMS both return unchanged.

Exceptions raised inside your block are *not* swallowed into a failed
result: an outage at your key service is not a fact about the document,
and `Result#failure?` would read as one.

### Results, not exceptions

Nothing raises in the normal flow. Every operation returns a result you
query — `success?`, the artifact or report, and the engine's diagnostics
either way (a render that *worked* can still have warned about an
overflowing box). A failure carries a trace: which step failed, a stable
`kind`, the message, and the cause chain underneath it.

```ruby
result.warnings.each { |d| logger.warn("#{d.code}: #{d.message}") }
result.failure.step        # => :generate
result.failure.kind        # => "template_not_found"
result.failure.causes      # => [the failure, its cause, …]
```

Diagnostics keep the engine's stable `code` and typed `args` untouched,
so an application that renders its own localized messages has everything
it needs. This gem never translates them.

Exceptions are reserved for what Ruby reserves them for: programmer
misuse (`Shojiku::UsageError`) and an environment with no engine in it
(`Shojiku::LibraryNotFound`).

For a script that would rather have a stack trace than a branch, there
is an opt-in unwrap:

```ruby
client.generate("receipt_ja", params).artifact!.write("receipt.pdf")
```

`artifact!` / `report!` raise `Shojiku::UnwrapError` (carrying the whole
failure) when the result failed. The ruling behind them is deliberate
and shared by every Shojiku SDK: **calling unwrap on a failed result is
programmer misuse** — a caller who has not checked `success?` is
asserting the operation worked. Application code that handles failure
keeps using `success?`.

## Templates

Template names are **identifiers, never paths**. A name resolves against
the configured template root:

```text
app/templates/
  receipt_ja/
    templates.yml     (required)
    definitions.yml   (optional)
    assets/           (optional — bundled images resolve against it)
```

Names containing a path separator, a `..` segment, a drive letter, a UNC
prefix, a control character, or a reserved Windows device name (`CON`,
`NUL`, `COM1`, …) are refused — on **every** platform, not only the ones
where they would resolve, so a name that works in development works in
production. A name that resolves outside the root through a symlink is
refused after canonicalization.

Every one of those is a *failed result*: a hostile name is a fact about
the request, not a bug in your program. A name that is not a String at
all is the other thing, and raises.

## Configuration

```ruby
Shojiku::Client.new(
  templates: "app/templates",   # the template root
  font_dirs: ["vendor/fonts"],  # extra font-pack search directories
  locale_dirs: ["vendor/locales"],
  lang: "ja-JP",                # overrides the template's own default
  library: "/opt/lib/libshojiku_capi.so",
  logger: Rails.logger,         # optional; host events only (see Logging)
  strict: true,                 # the input ceiling (see below)
  providers: { invoice: … },    # signing providers, by name
  env: true                     # consult SHOJIKU_* variables at all
)
```

| Variable | What it sets |
| --- | --- |
| `SHOJIKU_TEMPLATE_ROOT` | the template root |
| `SHOJIKU_FONT_DIR` | font-pack directories (`PATH`-separated) |
| `SHOJIKU_LOCALE_DIR` | locale-pack directories (`PATH`-separated) |
| `SHOJIKU_LIBRARY` | the engine library to load |

`env: false` disables **all** of them at once, for an application that
wants its configuration to come from nowhere but its own code.

The same settings can be defaults for every client, in the idiom an
initializer expects:

```ruby
Shojiku.configure do |config|
  config.templates = "app/templates"
  config.lang = "ja-JP"
  config.logger = Rails.logger
end
```

This sets defaults for the constructor; it does not add a precedence
layer. An explicit argument still wins, and a configured value still
wins over the environment — with `strict:` the one deliberate exception
(below). `Shojiku.reset_configuration!` drops the lot, which is what a
test suite wants between examples.

### Locking down where signable input comes from

Once you sign what you render, template input is a security boundary:
whoever controls the bytes controls what gets signed. An operator can
declare a ceiling:

```ruby
Shojiku.configure do |config|
  config.strict = true
  config.providers = { invoice: Shojiku::LocalPem.new(key: "signer.key", cert: "signer.crt") }
end

client.sign(document, :invoice)   # by name; the key path is not here
```

A strict client:

- refuses `generate_source`, so every document it signs came from the
  template root and its containment rules;
- signs only a document it rendered from that root — bytes handed over
  whole (`client.artifact`) and bytes laid out from a caller's own
  template are the same trust class, and signing does not launder them;
- takes signing material only as the **name** of a provider registered
  in configuration, so a key path never appears in request-handling code
  and the material is loaded by one object.

**Verification is never restricted.** Verifying bytes of unknown
provenance is the point of verify, and a locked-down deployment is
exactly the one that has to check an archived document it did not
produce.

Refusals raise `Shojiku::UsageError` rather than returning a failed
result: strict disables an *entrance*, so calling it is the program
contradicting its own deployment, not a fact about a document — and a
failed result is something `if result.success?` can swallow. Strict is
also the one setting `Shojiku.configure` wins outright: a restriction an
operator declared must not be lifted by `Client.new(strict: false)`.

### Logging

Optional, silent by default, and narrow on purpose:

```ruby
Shojiku::Client.new(templates: "app/templates", logger: Rails.logger)
```

Any object answering `debug` is accepted (this gem takes no logger
dependency). It reports what the *binding* did — which library it
loaded and why that one, the ABI revision it found, which lifecycle step
ran, for how long, and whether it worked. It never logs params, document
bytes, key material, a passphrase, or the engine's diagnostics: a log
line is the easiest way for a secret to leave a process, and the
diagnostics already belong to the result you are holding.

### Threads

A render, a signature and a verification each release Ruby's global VM
lock for the duration of the call into the engine, so a long render does
not block other threads in the process. `Client` is safe to share across
threads, and the engine library itself may be called concurrently — the
same params produce the same bytes whether one thread is rendering or
eight are.

Explicit configuration wins for the template root and the pack
directories — what an application renders is the application's own
decision. `SHOJIKU_LIBRARY` is the one that goes the other way and beats
an explicit `library:`, because *where the engine lives* is a deployment
decision that has to be able to override application code. That is the
same order `SHOJIKU_BIN` has in the SDKs that shell out to the CLI.

Nothing in this gem downloads anything, at install time or at run time.

## Building the engine library

The platform gems carry the library, so this is only for a platform they
do not cover, or for working against an engine you changed. Build it from
a clone:

```bash
make engine:capi-lib
```

It lands in `dist/capi/local/`; point `SHOJIKU_LIBRARY` at it, or pass
`library:` to the client.

## Development

Every gate runs in a container — no Ruby toolchain needed locally:

```bash
make sdk:ruby:verify
```

`make sdk:ruby:test` and `make sdk:ruby:lint` are the faster slices.

## Requirements

Ruby 3.3 or newer.

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
