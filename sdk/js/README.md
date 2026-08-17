# Shojiku for Node.js

Node.js bindings for [Shojiku](https://shojiku.pages.dev) — a document engine that
turns a YAML template plus your data into a deterministic PDF.

## Install

```bash
npm install shojiku
```

The engine ships as a native addon: the platform-specific binary is
pulled in through `optionalDependencies`, so there is no build step on
the supported platforms (Linux and macOS on x64 and arm64, Windows on
x64).

This package is for **Node.js**. Running the engine in a browser is a
different artifact — the WASM bindings the Designer uses (`engine/wasm`)
— and it cannot sign or verify, because those parts of the engine are
deliberately host-side only.

## Usage

```js
import { Client, LocalPem } from 'shojiku';

const client = new Client({ templates: 'app/templates' });

const result = await client.generate('receipt_ja', {
  customer: { name: 'Yamada Shoji K.K.' },
  items: [{ name: 'Consulting', qty: 1, price: 120000 }],
});

if (result.success) {
  await result.artifact.write('receipt.pdf');
} else {
  for (const d of result.failure.diagnostics) console.warn(d.message);
}
```

Signing is a separate step over the rendered document:

```js
const signed = await result.artifact.sign(
  new LocalPem({ key: 'signer.key', cert: 'signer.crt' }),
);
if (signed.success) await signed.artifact.write('receipt-signed.pdf');
```

And verification takes the trust anchors explicitly — there is no
fallback to the machine's trust store, because the engine never consults
one:

```js
const checked = await signed.artifact.verify({ anchors: 'ca.crt' });
if (!checked.success) console.warn('did not verify:', checked.failure.message);
// Read `notChecked` beside the verdict: it names what this release does
// NOT look at, and it is present whichever way the verdict went.
console.log(checked.report.notChecked);
```

Nothing throws (or rejects) in the normal flow: every operation
resolves to a result you query — `success`, the artifact, and the
engine's diagnostics (an overflowing box, an unknown field). A failure
carries a trace: which step failed, and its structured cause, so it is
data you log and inspect rather than an exception you catch. What *does*
throw is programmer misuse — a template name that is not a string, both
forms of the same material at once, unwrapping a result you have not
checked — and an environment with no engine in it.

**Everything is async.** Rendering is CPU work, and the addon runs it on
the libuv threadpool so your event loop stays free. There are
deliberately no synchronous variants.

The template root can also come from the `SHOJIKU_TEMPLATE_ROOT`
environment variable (useful for system-wide installs); template names
are identifiers, never paths. An explicit `templates` beats the
environment; `SHOJIKU_LIBRARY` is the one lookup that resolves the other
way round, because where the engine lives is a deployment decision.
`new Client({ env: false })` disables every `SHOJIKU_*` lookup at once.

Sources your application already holds go to `generateSource` instead —
fetching them is your act, and nothing here opens a socket:

```js
const result = await client.generateSource({
  template: templateYamlYouFetched,
  params: { customer: { name: 'Yamada Shoji K.K.' } },
});
```

A deployment that signs what it renders can forbid even that, and
restrict signing material to providers named in configuration:

```js
const client = new Client({
  templates: 'app/templates',
  strict: true,
  providers: { billing: new LocalPem({ key: 'signer.key', cert: 'signer.crt' }) },
});

await client.sign(artifact, 'billing'); // by NAME; a provider object is refused
```

Verification is never restricted by `strict` — checking an archived
document you did not produce is precisely what a locked-down deployment
needs to do.

## Signing with a key this process never holds

When the private key lives in a cloud KMS, an HSM or a smartcard, use
`ExternalSigner` instead. Shojiku hands out the bytes a signature has to
cover; your code signs them wherever the key is and hands the signature
back, so the key never enters your application:

```ts
const provider = new ExternalSigner({
  cert: 'signer.crt',
  algorithm: 'ecdsa-p256-sha256',
  sign: async (toBeSigned) => Buffer.from((await kms.sign(toBeSigned)).signature),
});
const signed = await artifact.sign(provider);
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

Node.js 22 or newer. The package is ESM-only.

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
