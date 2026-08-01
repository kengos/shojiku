# Electronic Signature / Trust Policy (`engine/signing`, `engine/verify`)

> **Status: built.** The scope and architecture on
> this page are settled decisions. `engine/signing` carries both halves —
> the incremental-update writer with its signature placeholder and byte
> ranges, and the signer: PKCS#8 key loading (plain and encrypted), the
> `Signer` trait with a `ring`-backed local PEM implementation, CMS
> `SignedData` assembly, the `prepare_sign`/`complete_sign` split, and the
> CLI `sign` command. `engine/verify` checks one: the structural walk to a
> signature, byte-range coverage, the CMS signature, certificate validity
> and a chain to a caller-supplied anchor, and the CLI `verify` command
> (file-by-file maps: [../code-map/signing.md](../code-map/signing.md),
> [../code-map/verify.md](../code-map/verify.md)). The hardening stage has
> landed too: the bounded-error rule is a compile-time assertion, and the
> parsers that read attacker-chosen bytes have fuzz targets in
> `engine/fuzz` (`make fuzz`, with the committed corpus replayed by the
> ordinary test gates).

## Principle

Signing is a distinct stage of the Document Lifecycle, not a responsibility
of the renderer:

```text
params
  -> Layout Engine
  -> unsigned.pdf
  -> Signer
  -> signed.pdf
  -> Verifier
```

`render-pdf` never signs. A signed PDF is always the output of an explicit,
separate step, whether invoked via CLI, SDK, or MCP.

## Workflow

```text
render()        -> unsigned.pdf
prepare_sign()  -> digest / byte range
external signer -> signature
complete_sign() -> signed.pdf
verify()        -> verification result
```

The `prepare_sign` / `complete_sign` split exists specifically so a private
key never needs to touch this codebase or process — an external signer
(HSM, cloud KMS, Adobe/DocuSign) can consume the digest and return just the
signature. It is also the seam that keeps the engine socket-free (see
[Network boundary](#network-boundary)).

## First-release scope

**Local PEM signer + invisible signature only.** The built-in signer
reads a private key and certificate from disk, computes the signature
in-process, and embeds it in the PDF without drawing anything on the
page.

Explicitly **deferred** — decided deferrals, not oversights:

| Deferred | Why it is not in the first release |
| --- | --- |
| Visible signature appearance | Needs a template item type and its Designer operability pass; the wire split is decided (see [Template wire boundary](#template-wire-boundary)) but nothing ships until that phase |
| PAdES / LTV / PDF-A profiles | Each is a conformance surface with its own test corpus; the baseline signature must exist first |
| KMS / HSM / PKCS#11 providers | The `prepare_sign` seam already admits them without engine changes; provider work is host-side (see [Network boundary](#network-boundary)) |
| Timestamps (TSA) | Requires network I/O, which is host-side by the same rule |
| Revocation checking (OCSP / CRL) | Same network constraint, plus a caching/freshness policy this project has not decided |
| Signing arbitrary third-party PDFs | See [Input document scope](#input-document-scope) |

## Crate architecture

Two crates, matching the two lifecycle stages:

- **`engine/signing`** (`shojiku-signing`) — the shared PDF and CMS
  model, the trailer/cross-reference locator, the incremental-update
  writer, the `prepare_sign`/`complete_sign` API, the signer trait, and
  the built-in Local PEM signer.
- **`engine/verify`** (`shojiku-verify`) — signed-document parsing,
  byte-range and signature verification, certificate validity and chain
  checking, and the verification report.

`shojiku-verify` depends on `shojiku-signing` for the shared PDF/CMS
model; the dependency never runs the other way. The split is not
cosmetic — **the two crates have different threat surfaces.** Verify
parses bytes an attacker chose (cross-reference offsets, byte-range
values, DER structures) and must degrade rather than panic; signing
handles key material and must not leak it.

**As shipped, `shojiku-verify` depends on `shojiku-signing` in full**, so a
verify-only consumer does still link the key-handling code today. That is a
consequence of sharing ONE parser — the alternative, a second parser inside
the verifier, would be a second hostile-input surface that could disagree
with the first about what a document says, which is the failure the whole
design exists to prevent. Narrowing the link (a Cargo feature gating the
key/signer half) stays available and costs nothing structural, since the
crate boundary is already where it needs to be.

The signer trait lives in `engine/signing`. The built-in Local PEM
signer implements it **in-crate** — it is not a plugin. External
providers (cloud KMS, HSM, a corporate signing service) implement the
same trait host-side; see [plugins.md](plugins.md) for the plugin form
that applies to those.

## Cryptographic backend

**`ring` is the signing and verification backend**, covering RSA
PKCS#1 v1.5 with SHA-256 and ECDSA P-256 with SHA-256. CMS `SignedData`
and X.509 structures are built and parsed with the RustCrypto DER
crates (`cms`, `x509-cert`, `der`, `pkcs8`).

Why this combination:

- **RSA support is a requirement, not a preference.** Certificates
  issued by real certificate authorities — including the Japanese
  public and commercial ones this project's compliance story targets —
  are predominantly RSA. An ECDSA-only signer would only ever sign with
  self-generated certificates.
- **The `rsa` crate is not usable here.** It carries an unfixed
  timing-sidechannel advisory (the Marvin attack, RUSTSEC-2023-0071);
  as of this decision the fix is still unreleased on the stable line.
  `engine/deny.toml` keeps an empty advisory ignore list on purpose, so
  depending on it would mean either breaking that posture or shipping a
  known-vulnerable signing path.
- **`ring` is already in the dependency tree and already passes the
  gates.** It arrives through the host font-fetch path
  (`engine/cli` → `shojiku-fetch` → `ureq` → `rustls` → `ring`) and
  clears `cargo-deny` today, so the signing decision adds an algorithm
  surface rather than a new supply-chain risk.
- **The in-process `openssl` crate is rejected** — but not merely for
  "having C in it", which would be a rationale `ring` fails too (see
  below). The distinction is what the build depends on: `ring` vendors a
  small, fixed set of C and assembly sources it compiles itself, whereas
  the `openssl` crate binds to **OpenSSL as an external system library**
  — so the build acquires a system package, its headers, its version
  skew across platforms, and a very large audited-elsewhere surface, or
  else vendors the whole of OpenSSL. Either shape makes
  cross-compilation and supply-chain review markedly harder for a
  capability `ring` already covers. Using the `openssl` *command* as an
  external signer stays available to any caller through
  `prepare_sign`/`complete_sign`, and needs no engine support.

### Consequences of the backend choice

- **`ring` builds C and assembly** (it has a `cc` build dependency), so
  a build of these crates needs a C compiler — no system library, but
  not pure Rust either. This is not a new cost: the CLI already builds
  `ring` through the font-fetch path. It is new only for a consumer that
  builds `shojiku-signing` on its own, and it is a factor for the
  language-SDK cross-compilation matrix, where a target without a
  working C cross-toolchain cannot build the signing crates.
- **Signing and verification are host-side, and cannot join the WASM
  build.** `engine/wasm` does not depend on the font-fetch crate and so
  does not pull `ring` today; adding these crates to it would. So the
  Designer renders in the browser but **does not** sign or verify there
  — those are CLI/SDK/host operations. Treat any future "verify in the
  browser" request as a design change, not a wiring task.
- **The backend bounds RSA key sizes at both ends, and the bounds
  differ between signing and verifying.** For *signing*, `ring` requires
  a modulus of at least 2047 bits and at most 4096, with a public
  exponent of at least 65537. Its *verification* algorithms admit a
  wider modulus range (up to 8192 bits). Two consequences worth stating
  plainly rather than discovering at implementation: a legacy short key
  is refused, which is security-positive; but a caller holding an
  unusually large key (8192-bit) can have documents **verified** and not
  **signed**. Both limits surface as clear rejections naming the key
  size, never as a silent fallback to a weaker algorithm. The figures are
  confirmed against the pinned `ring` version's own source, and the
  verifier states the asymmetry in the crate: it validates documents this
  engine could not have produced.
- **The DER crates are on the `der` 0.7 line, deliberately.** `cms` has
  never released past `0.3.0-pre.N`, and a signature format is not a
  thing to build on a prerelease. The cost is a second `sha2`/`digest`
  copy — PBES2 key derivation sits on the 0.10 line while font-manifest
  hashing is on 0.11 — which `deny.toml` warns rather than fails on, and
  which becomes a one-line bump when `cms 0.3` ships. The dependency
  entry gate over the full transitive set (34 new crates: `ring`, `cms`,
  `x509-cert`, `der`, `pkcs8` with passphrase decryption, `zeroize`, and
  `rpassword` for the CLI prompt) reported `advisories ok, bans ok,
  licenses ok, sources ok` with the advisory ignore list still empty.
- If `ring` ever trips the advisory gate, the fallback is a
  RustCrypto-only, ECDSA-P-256-only signer — narrower, but pure Rust
  and available without a policy exception.

## Key input formats

Both are in scope for the first release:

- **Unencrypted PKCS#8** (`BEGIN PRIVATE KEY`) — passed to the backend
  directly.
- **Encrypted PKCS#8** (`BEGIN ENCRYPTED PRIVATE KEY`) — decrypted
  in-process from the passphrase before the key reaches the backend.
  This is the format `openssl` writes by default for a
  password-protected key, so requiring an unencrypted key on disk would
  push callers into storing key material in the clear.

**Legacy OpenSSL "traditional" encrypted PEM is out of scope** — the
form carrying a `Proc-Type: 4,ENCRYPTED` / `DEK-Info:` header pair
inside `BEGIN RSA PRIVATE KEY`. Its key derivation is a weak,
non-standard construction, and supporting it would mean implementing it
by hand. A caller holding one converts it once:

```bash
openssl pkcs8 -topk8 -in legacy-key.pem -out key.pem
```

That prompts for the old passphrase and a new one, and writes encrypted
PKCS#8 — the supported format. Adding `-nocrypt` writes the unencrypted
form instead, which is also supported but leaves the key readable on
disk.

The rejection must name this conversion, not merely report a parse
failure — a bare "unsupported key format" on a file the caller
considers a normal PEM is exactly the pain this project exists to
avoid.

Passphrase handling: read from an interactive prompt, or from an
environment variable for unattended use. **Never from a command-line
argument** — argv is readable by other processes on the machine and
lands in shell history. The environment variable is the weaker of the
two supported options (it is inherited by child processes and can be
captured in crash dumps and process listings), so the prompt is the
default and the variable is the documented opt-in for automation. The
passphrase and the decrypted key are zeroized after use, and neither
ever appears in an error message, diagnostic, or log line.

## Input document scope

The first release signs and verifies **documents this engine rendered**,
not arbitrary third-party PDFs.

This is a deliberate bound with a concrete basis: every bundled
example's rendered output is a single-revision PDF 1.7 file with a
classic cross-reference *table* and a classic `trailer` dictionary — no
cross-reference streams, no object streams, no encryption. Appending a
signature to that shape (new objects, an updated catalog, a fresh
cross-reference section, a trailer carrying `/Prev`) is a bounded piece
of work over a structure this project produces and therefore controls.

Accepting arbitrary PDFs would instead require a general reader —
cross-reference streams, object streams, encrypted documents, damaged
files needing reconstruction — which is a parser project of its own.
There is also no acceptable off-the-shelf crate to delegate it to: the
established Rust PDF-manipulation crate is excluded by the same
advisory policy discussed above (it is named in `engine/deny.toml`'s
own comment as a removed exception). So the incremental-update writer
is written in-house, and its input is constrained to what that scope
makes safe.

A document outside the supported shape must be rejected by an explicit
structural check with a message naming what was unsupported — never
signed on a best-effort basis, and never silently mis-parsed.

## Network boundary

**No crate in the signing or verification path opens a socket.** The
render, sign, and verify hot paths stay offline, which is what makes
"same inputs, same bytes" hold and keeps the signing surface free of
request-forgery exposure.

Every signing feature that inherently needs the network is therefore
**host-side, reached through the `prepare_sign`/`complete_sign` split**:

- A **cloud KMS or HSM** signer receives the digest from
  `prepare_sign`, signs it wherever the key lives, and hands the
  signature to `complete_sign`. The engine never learns that a network
  was involved.
- A **timestamp authority** is the same shape: the host fetches the
  timestamp token and supplies it.

This mirrors how font distribution already works — the host-level fetch
crate fills a cache *before* rendering, and the render path itself
never opens a socket. A future KMS provider is a host component, not an
engine dependency.

## Template wire boundary

**Signing configuration never enters the template.** Keys, certificates,
signer selection, and passphrases are caller and host concerns; a
template is a layout document that must stay safe to commit, diff, and
share.

What *will* enter the template — with the visible-signature phase, not
before — is the placeholder for where a signature appears
(`type: signature_field`). The split is decided now so the later phase
does not relitigate it: **appearance is template-owned, cryptography is
signer-owned.** The template declares the box and how it should look;
the signer produces the signature and knows nothing about layout.

Because the first release is invisible-signature-only, it needs **no
template wire change at all**. When the visible phase lands, its wire
addition takes the mandatory Designer operability consult (the Designer
must be able to place and address the field, and the raster preview
backends need a placeholder representation) — see
[gui.md](gui.md). How a fillable field composes with a signature over
the same document is the open question.

## Verification completeness

`verify` reports **what it checked and what it did not.** The first
release checks signature integrity over the declared byte range, that
the declared range actually covers the document (below), certificate
validity periods, and the chain up to a caller-supplied trust anchor. It
does **not** check revocation status or timestamps.

**The trust anchor is always supplied by the caller.** Verification does
not consult the operating system's trust store, even though a
native-certificate crate is already in the dependency tree for TLS.
Reaching for it would make the verdict depend on ambient machine state —
the same property the determinism posture rejects everywhere else — and
would silently widen who can vouch for a document. A caller who wants
system trust passes those roots in explicitly.

**A valid signature over an incomplete range is a forgery.** This is the
attack the incremental-update writer's own shape invites: because a PDF
can carry appended revisions, a document can hold a perfectly valid
signature that covers only the *original* bytes while a later appended
revision changes what a reader actually sees. So verifying the signature
is not sufficient — `verify` must also establish that the declared byte
ranges span the entire file except the signature placeholder window, and
treat trailing or interleaved unsigned bytes as a **verification
failure**, reported as such and distinguishable from a bad signature. A
verifier that skips this check reports "valid" on a document whose
visible content was altered after signing.

A verification result that omits a check must say so explicitly in its
output. A "valid" verdict that quietly skipped revocation is worse than
no verifier at all: it converts a missing capability into a false
assurance, which is precisely the trust the signing story is selling.

## Security requirements

- Never log private key material, passphrases, digests, or raw
  signature bytes at anything above debug level, and never persist them
  outside of what the caller explicitly requested.
- Prefer the external-signer flow (`prepare_sign`/`complete_sign`) over
  any design that requires a private key to be loaded into this
  process's memory long-lived; where a local key must be used, keep the
  key material scoped tightly and zeroize buffers after use.
- Treat everything the verifier reads as attacker-chosen. Parsed
  offsets and lengths get bounds checks, accumulated integers use
  checked or saturating arithmetic, and no input may reach a panicking
  path — a malformed signed document produces a structured failure, not
  a crash.
- Errors from both crates must not echo unbounded attacker-controlled
  content (a hostile file's strings, paths, or DER fragments). **This is
  enforced structurally, not by review**: `assert_errors_are_bounded!`
  (defined in `shojiku-signing`, invoked by both crates) asserts that no
  error type on this surface owns anything needing a drop, so a variant
  holding a `String` fails to compile. A message is `&'static str` plus
  numbers; names and offsets locate a problem without quoting it. The
  authoring surface's rule is deliberately the opposite — `CoreError`
  clips the author text it quotes, because naming the mistyped key is
  the whole point there.
- **The parsers that read attacker-chosen bytes are fuzzed.** Targets
  live in `engine/fuzz` (outside the workspace: nightly + libFuzzer) and
  cover the shared document reader, the whole verifier, the `/Contents`
  window decoder, the CMS container decoder and the anchor loader.
  `make fuzz` runs them on demand; the committed corpus is replayed by
  the ordinary tests so the targets cannot rot, and a crash becomes a
  corpus file rather than a story. Seeds that would embed a certificate
  are generated at fuzz time — nothing key-shaped is committed.
- No real or production-capable private key or certificate is committed
  to the repository. Test material is generated by a script.

## Mandatory lint/test gates

Inherits the Rust gates from [engine.md](engine.md)
(`cargo fmt`, `cargo clippy -D warnings`, `cargo test`, 100% coverage via
`cargo-llvm-cov` — see [../guidelines.md](../guidelines.md)), plus, given
the crypto surface area:

- Coverage exclusions in `engine/signing` or `engine/verify` need a
  written justification tied to the specific unreachable branch — the
  general guidance in [../guidelines.md](../guidelines.md) applies
  especially strictly here.
- `cargo deny`'s advisory check is **mandatory** for both crates — not
  merely recommended, unlike the general engine guidance.
- Round-trip test: sign → verify succeeds, for every supported signer
  and algorithm.
- Tamper test: flip one byte in a signed PDF after signing → `verify`
  must fail, for every supported signer.
- Certificate chain test: verify against a deliberately invalid or
  expired chain → `verify` must fail with a structured reason, not an
  unstructured error.
- Key-format tests: correct passphrase, wrong passphrase, and a legacy
  traditional-PEM file rejected with the conversion hint.
- Key-size tests: a key below the backend's floor and one above its
  signing ceiling, each rejected with a reason naming the size.
- Hostile-input tests: malformed cross-reference data, out-of-range
  byte ranges, and truncated or malformed DER, each producing a
  structured failure.
- Corpus replay: every committed fuzz seed runs through its target's
  entry point under `cargo test`, and the replay asserts the corpus is
  non-empty — an emptied directory would otherwise turn the whole check
  into a loop that never runs.
