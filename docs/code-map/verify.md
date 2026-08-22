# Code map — engine/verify

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.
> Companion: [signing.md](signing.md) — this crate reads what that one writes,
> through that one's parser.

**Area-wide postures** (stated once; every entry below inherits them):

- **ONE parser, not two.** The document is read through
  `shojiku-signing`'s public PDF model (`PdfDocument`, `Dict`, `ObjRef`,
  `array_elements`, `parse_ref`/`parse_uint`, `dict_value_span`) and its
  `oid` table, never a second implementation. Two parsers over the same
  bytes can disagree, and a disagreement means the verifier checked
  something other than what a reader sees — the exact failure the design
  exists to prevent. `shojiku-verify` depends on `shojiku-signing`; never
  the reverse.
- **A verdict is not an error.** `Err(VerifyError)` means the document could
  not be EVALUATED (not a readable PDF, no signature, an undecodable
  container). A document that verifies badly returns `Ok(report)` whose
  checks name what failed. The split is what lets a caller tell "not
  trustworthy" from "I could not judge this".
- **Four independent checks, never collapsed**: signature / coverage /
  certificate validity / trust chain. "Valid signature over an incomplete
  range" and "wrong signature" are different accusations, and the
  distinguishability is a tested contract.
- **The report states its OMISSIONS on a passing verdict too** — revocation
  and timestamps are `not_checked`, present in the JSON of a valid result.
- **Every byte is attacker-chosen**: no panicking path, every offset
  bounds-checked, every accumulation checked, every loop bounded (see
  `limits.rs`, and `chain`'s visited-set argument). Errors carry
  `&'static str` + numbers ONLY — structurally incapable of echoing file
  content.
- **Trust is the caller's**: the OS trust store is NEVER consulted, and the
  clock is a parameter (`verify_document_at`), not a hidden global.
- **Host-side only**: not in the WASM build, no sockets, no filesystem.

- `engine/verify/src/lib.rs` — crate role + the public surface
  (`verify_document` / `verify_document_at`, `TrustAnchors`,
  `VerificationReport`, `CheckOutcome`, `NotChecked`, `VerifyError`) and the
  orchestration: parse → locate → decode window → decode container → read
  `/ByteRange` → coverage + signature + chain. `now_unix_seconds` degrades a
  pre-epoch clock to zero (everything reads "not yet valid" — the safe
  direction).

- `engine/verify/src/error.rs` (+ `error/tests.rs`) — `VerifyError`:
  `Document` (from `SigningError`) / `NoSignature` / `Unsupported` /
  `Malformed` / `LimitExceeded` / `NoTrustAnchors` / `AnchorNotPem`. ONE
  `From<der::Error>` conversion for DER failures with nothing specific to
  say — a `map_err` closure per site would be a separate never-executed
  instantiation, which the coverage summary counts per instantiation.

- `engine/verify/src/limits.rs` — **the ONE home for every cap**: trust
  anchors, `/Fields` entries, container certificates, container bytes
  (= signing's `MAX_CONTENTS_CAPACITY`). Deliberately **no chain-depth
  constant**: the chain walk is bounded by the certificates it can reach
  (anchors ∪ container, both capped) plus its refusal to revisit one — a
  proof rather than a number.

- `engine/verify/src/report.rs` (+ `report/tests.rs`) —
  `VerificationReport` (`valid` computed in `new` from the four outcomes, so
  the verdict cannot drift from the checks), `CheckOutcome`
  (`Passed` | `Failed { reason }`, serde internally tagged on `status`),
  `NotChecked` + the fixed `NOT_CHECKED` list. Serializes camelCase; the
  JSON shape is pinned by a test AND consumed by the CLI.

- `engine/verify/src/locate.rs` (+ `locate/tests.rs`) — the STRUCTURAL walk
  to the signature: trailer `/Root` → catalog → `/AcroForm` → `/Fields`
  (capped) → a field with `/FT /Sig` and `/V` → the signature dictionary,
  plus its `/Contents` value span via `dict_value_span`. Never a byte scan:
  a crafted file can make "the first `/ByteRange` in the bytes" and "the
  signature the structure points at" different objects. Refused by name: a
  second signature; a `/SubFilter` other than `adbe.pkcs7.detached`.

- `engine/verify/src/range.rs` (+ `range/tests.rs`) — `parse_byte_range`
  (four unsigned fields; a malformed array is an `Err`, since a document
  that states nothing has made no claim to disprove; a field past `usize`
  SATURATES, which no document can then satisfy) and `check_coverage` — the
  four equalities that catch the forgeries: starts at 0, runs up to the
  window, resumes after it, and reaches the end of the file (the
  appended-revision case). `covered_bytes` returns `None` rather than
  slicing outside the buffer.

- `engine/verify/src/container.rs` (+ `container/{window,attrs}.rs`,
  `container/tests/refuse.rs`) — CMS decode. `window.rs` turns the
  `/Contents` hex string back into DER (capped before allocating, every
  digit checked). `container.rs` decodes ONE value and ignores the window's
  zero padding — a reader takes the length from the DER header, so a
  whole-buffer decode would call the padding garbage. The signer's
  certificate is the one the identifier NAMES, not the first in the set.
  `attrs.rs` holds the two signed attributes and the rule that matters: the
  signature covers them under an EXPLICIT `SET OF` (RFC 5652 §5.4), which is
  the same `to_der()` the signer calls; **a missing `signingTime` is not a
  defect** (this engine writes none, for reproducibility). Refused by name:
  attached containers, zero or several signers, a key-identifier `sid`, a
  non-X.509 certificate choice.

- `engine/verify/src/signature.rs` (+ `signature/tests.rs`) —
  `SignatureAlgorithm` with **two OID tables, deliberately**: CMS spells RSA
  PKCS#1 v1.5 `rsaEncryption`, an X.509 certificate spells it
  `sha256WithRSAEncryption`; reusing one for the other rejects every real
  certificate. `check` compares the container's stated digest to the real
  digest of the covered bytes FIRST (that is what ties the cryptography to
  this document), then verifies. **Verification admits a wider RSA modulus
  range than signing** (backend: 2048–8192 vs 2047–4096), so this crate
  validates documents it could not produce.

- `engine/verify/src/chain.rs` (+ `chain/tests.rs`) — `TrustAnchors`
  (`from_pem`, capped; the whitespace-only GUARD is load-bearing — the
  decoder underneath computes `input.len() - 1` and underflows on empty
  input, a panic in debug builds) and the walk: DER identity against an
  anchor, else an issuer from anchors ∪ container that is marked CA:TRUE
  **and** whose key actually verifies the child (name chaining alone would
  let anyone who copies a subject name insert themselves). Validity is
  judged over whatever chain was established — even a failed one — so one
  failure never hides the other.

- `engine/verify/src/fuzz.rs` (+ `fuzz/tests.rs`) — `#[doc(hidden)] pub`
  entry points for the out-of-tree fuzz targets: `decode_contents_window`
  (the `/Contents` hex string, input = the window itself) and
  `decode_container` (raw CMS DER). They exist because `verify_document`
  reaches those parsers only through a structurally valid PDF carrying a
  signature dictionary, which byte mutation never invents — fuzzing the
  front door alone would leave the DER half untested forever. Hidden `pub`
  rather than `#[cfg(feature)]`: a feature-gated entry is invisible to
  `llvm-cov` (default features) while `clippy --all-features` still compiles
  it, i.e. shipped code no gate covers. `fuzz/tests.rs` replays the
  committed corpus through both, and asserts the corpus is NON-EMPTY — a
  lost seed directory would otherwise make every loop vacuous.

- `engine/fuzz/` — the libFuzzer crate, **outside the engine workspace**
  (`exclude = ["fuzz"]`; nightly + a sanitizer runtime + a C++ compiler for
  libFuzzer itself, and it ships nowhere, so `cargo test`/`llvm-cov`/`deny`
  should all keep describing what does). ELEVEN targets in two groups.
  **sign** — `pdf_document`, `verify_document`, `contents_window`,
  `cms_container`, `trust_anchors` — reads bytes out of a PDF nobody vetted.
  **wire** — `core_template`, `core_params`, `core_definitions`,
  `core_ruby`, `formatter_langpack`, `formatter_fontpack` — reads authored
  TEXT: each decodes UTF-8 and discards the rest, because every one of those
  doors takes a `&str`, so fuzzing the bytes would measure the decoder.
  Each wire target also touches the step AFTER the parse — a parse that
  succeeds and a tree that is then walked are different code: `validate`
  for the template, path resolution for params, the catalog flatten for
  definitions, the segment walk for ruby, the pack accessors for the locale
  pack, and `resolve_face_bytes` for the font pack (deliberately, not
  `face_specs`: only the resolver runs the path-confinement check the
  traversal seed is for).
  `src/lib.rs` generates the anchors a verifier needs, once per process —
  an empty anchor set short-circuits before any parser runs, so a target
  without one fuzzes nothing. `examples/seed.rs` writes the seeds that may
  NOT be committed (a signed document embeds a certificate): run by
  `make engine:fuzz` before fuzzing, gitignored, and the reason a mutating fuzzer
  reaches the container parsers at all. Committed seeds are structural only.
  Driven by `make engine:fuzz` (`FUZZ_GROUP=sign|wire`, `FUZZ_TARGET`,
  `FUZZ_SECS`), deliberately outside `make verify` — the gates run the corpus
  REPLAY instead: `engine/core/tests/fuzz_corpus/` and
  `engine/formatter/tests/fuzz_corpus/` for the wire group, engine/verify's
  two suites for the sign group. Every replay suite asserts its corpus is
  NON-EMPTY; the six WIRE ones additionally assert that at least one seed
  actually parses (for ruby, which cannot fail, that at least one seed
  SEGMENTS) — without that second half a suite is green over a directory of
  garbage it never really read. The three sign-group tests predate this and
  assert seed counts only.

- `engine/verify/src/testkit.rs` (+ `testkit/keys.rs`, `#[cfg(test)]`) —
  minimal signable documents, `layout()` (reads a signed document's
  `/ByteRange` + window back out of its own bytes, anchored on `/ByteRange`
  because `/Contents ` hits a page's content stream first in a real
  document), and `interior_gap_forgery` — a GENUINELY VALID signature over a
  shortened range, built rather than described. `keys.rs` runs
  `scripts/gen-test-keys.sh` ONCE per process through a `OnceLock` (the
  script writes its sentinel last, so a concurrent second run rewrites files
  under a reader).

- `engine/verify/tests/verify/` — near-e2e over the COMMITTED
  `examples/*/output.pdf` bytes (`main.rs` + `common.rs` + `roundtrip.rs` /
  `tamper.rs` / `chain.rs` / `coverage.rs` / `hostile.rs` / `corpus.rs` /
  `echo.rs`). Signer and
  verifier were written beside each other, so what these add is REAL engine
  output rather than a fixture shaped to suit both. `coverage.rs` carries
  the two contract tests: an appended revision (signature passes, coverage
  fails) and the interior-gap forgery. `corpus.rs` replays the three
  public-API fuzz corpora (document parser, whole verifier, anchor loader);
  it asserts NO verdict, because after a seeding run one of those seeds is
  validly signed — what it proves is that every seed is answered rather than
  crashed on. `echo.rs` is the behavioural half of the bounded-error rule:
  hostile documents carrying a planted marker, and neither an error nor a
  serialized report may come back holding it.

- **CLI seam** — `engine/cli/src/verify.rs` (+ `verify/tests.rs`):
  `shojiku verify --input --anchor …`. `--anchor` is REQUIRED and
  repeatable (files are concatenated, so one chain file and several
  single-certificate files behave identically); the report prints as JSON
  either way and the exit code carries the verdict
  (`CliError::VerificationFailed`, message-suppressed like
  `ValidationFailed` because the JSON already said it). Map:
  [hosts.md](hosts.md).
