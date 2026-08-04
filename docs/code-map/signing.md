# Code map — engine/signing

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change.

**Area-wide postures** (stated once; every entry below inherits them):

- **Both halves live here** — the document half (read a rendered PDF,
  append a revision, reserve the signature window, report the byte ranges)
  and the cryptographic half (load a PKCS#8 key, build a CMS `SignedData`,
  write it into the window). Checking a signature is
  [`engine/verify`](verify.md), which reads through THIS crate's parser and
  OID table rather than one of its own.
- **The shallow PDF model and the OID table are PUBLIC API**, not
  incidental exports: `PdfDocument` (`catalog_number`/`dict_at`/
  `body_start`), `Dict`, `ObjRef`, `array_elements`, `parse_ref`,
  `parse_uint`, `dict_value_span`, and `pub mod oid`. One parser over these
  bytes, because two could disagree — and a disagreement means the verifier
  checked something other than what a reader sees.
- **Generation numbers must be ZERO**, refused by name at both sites that
  read one (an in-use xref entry, an object header; a FREE entry keeps its
  conventional 65535). That is what makes resolving on the object number
  ALONE sound: objects are identified by `(number, generation)`, so a file
  whose table and header disagree could otherwise resolve differently for a
  reader than for us.
- **A private key is optional.** `prepare_sign` hands out a digest and
  `complete_sign` takes a finished container back, so a caller whose key
  lives in a smartcard or a cloud service never puts it in this process.
  `LocalPemSigner` is one caller of that seam, not a privileged path.
- **Append-only**: the input bytes are a byte-identical PREFIX of every
  output. Nothing is ever rewritten in place except a fixed-width
  placeholder the writer itself reserved.
- **Hostile-input posture throughout** — the verifier reads
  attacker-chosen bytes through this same parser. No panicking path from
  parsed input (no unchecked indexing, no `unwrap`/`expect`), every offset
  bounds-checked against the real buffer, every accumulation checked, every
  loop/recursion over parsed structure capped in `limits.rs`.
- **Errors carry `&'static str` + numbers only** — structurally incapable of
  echoing hostile file content, key material, or a passphrase. Every rejection
  of an unsupported structure NAMES what was unsupported.
- **Host-side only**: not in the WASM build, no sockets, no filesystem.
  `ring` builds C and assembly, so these crates need a C toolchain.
- **This parser is fuzzed through `engine/fuzz`'s `pdf_document` target**
  (the crate lives outside the workspace; its entry is mapped in
  [verify.md](verify.md)). A crash there is a crash in the signer and the
  verifier at once, which is the point of there being one parser.

- `engine/signing/src/` — `lib.rs` (crate role + the public surface:
  `PdfDocument`, `RevisionBuilder`/`Revision`,
  `append_signature_placeholder`/`PlaceholderOptions`/`PreparedPdf`,
  `SigningError`), `error.rs` (`SigningError`: `NotAPdf` / `Unsupported` /
  `Malformed` / `OutOfRange` / `LimitExceeded` / `InvalidOption` — the
  bounded-content rule lives here), `limits.rs` (**the ONE home for every
  cap**: xref chain + entries, nesting depth, dict entries, page-tree depth,
  integer digits, tail-scan window, object-number ceiling, the ten-digit
  fixed field width + the offset ceiling it implies, and the public
  `MIN`/`MAX`/`DEFAULT_CONTENTS_CAPACITY`),
  `lexer.rs` (the shared scanning primitives — `skip_ws` incl. `%`
  comments, `read_token`, `expect_keyword`, checked `read_uint`,
  `offset_within`; the object scanner advances its own cursors but the
  posture is uniform: untrusted bytes are reached through `get`, never
  by direct slice indexing, in every scanner),
  `bounded.rs` (the error-echo decision as something the COMPILER checks:
  `assert_errors_are_bounded!` — exported, invoked by `lib.rs` over
  `SigningError`/`KeyError`/`CmsError` and by `shojiku-verify` over its own
  — asserts `!needs_drop::<T>()`, so a variant that grew a `String` from a
  hostile file stops the build instead of waiting for a reviewer. The other
  surface's answer is different and deliberately so: `CoreError` CLIPS the
  author text it quotes, because telling an author which key they mistyped
  is its job).

- `engine/signing/src/object.rs` (+ `object/scan.rs`) — the **shallow**
  dictionary model: `Dict` maps keys to RAW byte spans of their values, which
  is what lets a rewritten catalog/page carry every untouched key through
  byte-for-byte. `scan.rs`'s `scan_value` returns one object's span (dict,
  array, hex/literal string, name, number, keyword) and extends a number
  across `<int> <int> R` because an indirect reference is ONE value to the
  dictionary around it; `walk_dict` is the shared dictionary walk. Depth is
  guarded in `scan_value` alone — every nested element passes through it.
  Typed reads (`get_uint`, `get_ref`, `array_elements`) are on demand.
  `dict_value_span` answers WHERE a value sits rather than what it holds —
  the verifier needs it because the signed byte ranges are defined by the
  position of the `/Contents` window and by nothing else, and recovering an
  offset from a borrowed slice would otherwise mean pointer arithmetic.

- `engine/signing/src/xref.rs` — the classic cross-reference TABLE parser
  (subsection headers + entries; all three lawful two-byte terminators).
  Entry offsets are bounds-checked against the buffer AT the table. A
  `startxref` that does not land on the `xref` keyword is reported as an
  unsupported cross-reference STREAM. An in-use entry's generation must be
  zero (see the area-wide posture); a free entry's 65535 is untouched. The entry budget is threaded in by the
  caller so a `/Prev` chain cannot add up to an unbounded allocation.

- `engine/signing/src/document.rs` (+ `document/pages.rs`) —
  `PdfDocument::parse`: header check, tail scan for `startxref`, the
  `/Prev` chain merged **newest-first** (first offset recorded wins; loops and
  length are both refused), the by-name rejections (`/Encrypt`, `/XRefStm`),
  and object resolution (`body_start` verifies the header names the number
  the table claimed — the check that catches an entry aimed into the middle
  of another object — AND that its generation is zero). `pages.rs` descends
  `/Kids` to the first page, depth-capped.

- `engine/signing/src/revision.rs` — `RevisionBuilder` (allocate / set_object
  / finish) writes the appended revision: objects, a cross-reference section
  covering exactly them (contiguous numbers grouped into subsections, entries
  exactly 20 bytes), and a trailer carrying `/Root`, `/Info` and `/ID` as raw
  bytes plus `/Prev`. `Revision::body_offset`/`patch` are how a caller
  overwrites a fixed-width window it reserved. `/ID` is carried UNCHANGED:
  the format's "should change" is traded for the repo's determinism posture,
  so the same input yields the same appended bytes.

- `engine/signing/src/placeholder.rs` (+ `placeholder/objects.rs`) — the
  invisible-signature placeholder. `objects.rs` emits the signature dictionary
  (with the `/ByteRange` fields and the `/Contents` window reserved at fixed
  width so patching moves no byte), the zero-rect widget annotation, the
  interactive-form dictionary, and the REWRITTEN catalog (`/AcroForm` added)
  and page (widget merged into an existing `/Annots` array, or the key added).
  `compute_byte_range` is a pure function so its integer-maximum behavior is
  unit-testable: the signed ranges span the whole file **except** the
  `/Contents` string, and the excluded gap **includes both angle brackets**.
  Rejected by name: an existing `/AcroForm`, and an indirect `/Annots`.

- `engine/signing/src/oid.rs` — **`pub mod`**: the ten object identifiers
  the signature format is built from, each checked against the `const-oid`
  generated database rather than transcribed. Public so the verifier
  recognizes exactly what the signer writes; a second transcription would be
  a second chance to get one wrong. Note the pair that differs by CONTEXT:
  CMS spells RSA PKCS#1 v1.5 `rsaEncryption`, an X.509 certificate spells it
  `SHA_256_WITH_RSA_ENCRYPTION`. `new_unwrap` in a `const` item is a
  compile-time check, not a runtime unwrap.

- `engine/signing/src/key.rs` (+ `key/{error,pem,size}.rs`) — `PrivateKey`
  (`Rsa` | `Ecdsa`, deliberately NOT `Debug`/`Clone`/serializable) +
  `SignatureAlgorithm`. `pem.rs` classifies the file BEFORE the PEM decoder
  runs — an encrypted OpenSSL "traditional" key carries `Proc-Type:`/
  `DEK-Info:` headers RFC 7468 forbids, so checked afterwards the caller
  would be told "not PEM" about a file that plainly is one; the refusal
  names `openssl pkcs8 -topk8`. `SignatureAlgorithm` also owns the host-boundary SPELLINGS
  (`wire_name` / `from_wire`, `rsa-pkcs1-sha256` / `ecdsa-p256-sha256`):
  two hosts take an algorithm by name, and a host that transcribed the
  strings itself would be a second chance to disagree about what one means.
  `size.rs` reads the modulus bit length out
  of the PKCS#1 body so a rejection can NAME the size — the backend refuses
  out-of-range keys opaquely — and holds the backend's SIGNING bounds
  (2047..=4096; verification admits more, which is why a key can verify
  documents it cannot sign). `error.rs` = `KeyError`.

- `engine/signing/src/cms.rs` (+ `cms/{error,attrs}.rs`) —
  `SignatureContainer`: `new` (certificate + digest) → `to_be_signed` →
  `finish(signature)`. Built field by field rather than through the `cms`
  crate's builder, which signs through a RustCrypto trait `ring` does not
  implement. `attrs.rs` holds the TWO signed attributes (`contentType`,
  `messageDigest`) and the encoding rule that matters: the signature covers
  them under an EXPLICIT `SET OF` tag, NOT the `[0] IMPLICIT` form inside
  `SignerInfo` (RFC 5652 §5.4). **No `signingTime`** — a wall-clock
  attribute would end reproducibility and proves nothing. `error.rs` =
  `CmsError` with ONE `From<der::Error>` conversion (a `map_err` closure per
  site is a separate never-executed instantiation, which the coverage
  summary counts per instantiation).

- `engine/signing/src/signer.rs` (+ `signer/tests.rs`) — the `Signer` trait
  (algorithm, certificate, bytes → signature), `LocalPemSigner`, and
  `PresignedSigner`. Small on purpose: everything a signer might otherwise
  want to know is the caller's business, which is what lets a host-side
  provider implement it without this crate learning anything about it.
  `PresignedSigner` is the FINISHING half of the external flow — a signature
  the caller already made, answered back — and it lives here rather than in
  each host so both the C ABI and the CLI complete through the SAME
  `sign_document`. Its test states the byte equality that makes that claim
  checkable, plus the documented outcome nothing else asserted: a signature
  made over a DIFFERENT document writes a well-formed file that fails
  verification.

- `engine/signing/src/sign.rs` — `prepare_sign` (placeholder + SHA-256 over
  the byte ranges) → `PreparedSign` (`digest`, `byte_range`, `capacity`) →
  `complete_sign` (size-checked, hex into the window), plus the one-shot
  `sign_document`. The size check is the real guard, not a shortcut: the
  buffer continues past the window, so an overlong container would land on
  valid indices and corrupt the document rather than fail. The write goes
  through a clamped iterator, never an index.

- `engine/signing/src/testkit.rs` (+ `testkit/keys.rs`, `#[cfg(test)]`) —
  fixture builders emitting the same shape a rendered document has, so parser
  tests and real files exercise one code path; `keys.rs` runs
  `scripts/gen-test-keys.sh` ONCE per process into a pid-keyed directory (no
  key material is committed, and parallel binaries cannot see each other's).

- `engine/signing/tests/sign/` — near-e2e signing over the COMMITTED
  `examples/*/output.pdf` bytes (`main.rs` + `common.rs` + `documents.rs` /
  `external.rs`). `common.rs` re-reads the `/ByteRange` array and the
  `/Contents` window from the finished bytes and verifies from THOSE, never
  from what the signing call returned — "the ranges say one thing while the
  file says another" is the failure that matters. It anchors on `/ByteRange`
  to find the window: a plain search for `/Contents ` hits a PAGE's content
  stream first in any real rendered document.

- `engine/signing/tests/append/` — near-e2e over the COMMITTED
  `examples/*/output.pdf` bytes (`main.rs` + `common.rs` + `bundled.rs` /
  `hostile.rs` / `reject.rs`). `common.rs` re-reads the tail, table and object
  headers from raw bytes **without this crate's parser** — a suite that
  checked the writer with the reader written beside it would pass on any pair
  of mistakes that agree. It works in BYTES throughout: decoding a rendered
  PDF as text substitutes replacement characters for compressed-stream bytes
  and silently moves every offset under test.
