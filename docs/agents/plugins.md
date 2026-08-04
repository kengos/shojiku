# Plugin Policy (`plugins/`)

```text
plugins/
  format-japanese-era/
  format-accounting/
  format-address-jp/
  format-invoice-tax/
  signer-aws-kms/
  signer-gcp-kms/
  signer-azure-key-vault/
  data-source-csv/
  data-source-sql/
```

Plugins extend the engine and `lang/` with anything that is
business-specific, region-specific-beyond-basic-locale, or an external
integration.

## Responsibilities / candidate scope

- Special/business formatters (Japanese era, accounting notation)
- Country-specific address formatting (beyond generic locale defaults)
- Tax/invoice-system-specific formatting (e.g. JP invoice system rules)
- **External** signer providers (PKCS#11, cloud KMS, HSM, a corporate
  signing service) — see [signing.md](signing.md) for the signer
  interface and the network rule that puts them host-side. Note the
  **local PEM signer is not a plugin**: it is built into
  `engine/signing`, so a caller signing with a key on disk needs no
  plugin at all.
- Timestamp providers
- Data source providers (CSV, SQL, ...)
- External service integrations

## Boundary

- If a formatter is needed by *every* user of a locale regardless of
  business domain, it belongs in `lang/`, not here. If it's specific to an
  industry, jurisdiction, or company's own convention, it belongs here.
- Plugins implement one of two stable interfaces — they do not invent new
  extension points ad hoc:

```text
formatter interface:
  format(value, type, locale, options) -> string | image | structured output

signer interface:
  sign(message, options) -> signature
```

An external signer implements **only** that one operation. Wrapping the
signature into a document (`prepare_sign` / `complete_sign`) belongs to
`engine/signing`, and verification is a separate crate
(`engine/verify`) — a provider is asked to sign the bytes it is handed,
wherever the key lives, and is never given the document or asked for a
verdict. Those bytes are the CMS signed ATTRIBUTES, which carry the
document digest; a provider that signs the digest itself produces a
document that fails verification. See [signing.md](signing.md).

## Extension mechanism order

Same priority as the engine overall (see
[engine.md](engine.md)):
1. Cargo feature / optional dependency
2. Bundled lang/plugin metadata
3. WASM plugin
4. Subprocess plugin
5. Dynamic library plugin

Most formatter plugins should be satisfiable with (1)-(2). Reach for
subprocess/dynamic-library plugins only for genuinely external integrations
(e.g. a signer that must run in an isolated process for key-handling
reasons).

## Mandatory lint/test gates

Formatting/style and the 100%-coverage-in-CI requirement follow
[../guidelines.md](../guidelines.md), regardless of which language a given
plugin is implemented in.

- If implemented in-process as a Rust crate: the same gates as
  [engine.md](engine.md) (`cargo fmt`, `cargo clippy -D
  warnings`, `cargo test`, `cargo llvm-cov --fail-under-lines 100`), plus
  contract tests asserting the plugin satisfies the `formatter` or
  `signer` interface's documented behavior (not just "compiles against the
  trait").
- If implemented out-of-process (subprocess/other-language plugin): that
  language's standard lint/test/coverage gate applies (see
  [sdk.md](sdk.md) for the per-language tool list), plus a
  protocol conformance test suite run from the Rust side against the
  plugin binary.
- Every formatter plugin needs golden-output tests for representative
  sample values (not just "doesn't crash").
- Every signer plugin needs a round-trip test: sign → verify succeeds, and
  a tamper test: modify one byte post-signature → verify must fail.

## Notes

A full plugin-authoring guide (how to package, publish, and version a
third-party plugin) is planned for Phase 6 (OSS Ready) and is not written
yet.
