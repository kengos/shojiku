# Code map — engine/authoring, engine/fetch, engine/cli, engine/mcp, engine/wasm, engine/capi, engine/napi

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).
> Read this BEFORE searching or editing the covered dirs; update it in the
> same PR whenever files/modules/boundaries here change. Granularity: file
> role + key exports + load-bearing contracts.

## engine/authoring — the shared authoring-surface lib layer

ONE contract, bytes-first (source strings + injectable font/asset bytes),
wrapped by every host (CLI / MCP / WASM); the only filesystem code is the
feature-gated `fs` module (default-on; WASM builds `default-features =
false`), no clap.

- `lib.rs` — module root + `InjectedPack`/`RawPage` re-export.
- `sources.rs` — `Sources`/`load_sources` (strings → parsed
  defs/template/params; hard-error render path) + `validate_strings`
  (the `validate` op; parse errors surface as a `parse_error`
  diagnostic).
- `locale.rs` — `resolve_locale_id` (explicit > template > ja-JP) +
  `valid_locale_id` (the ONE charset-guard home) + `load_pack` (id +
  overlay string → builtin(+merge) | standalone | NotFound; never
  touches the FS).
- `fs.rs` — the FS pack discovery both FS hosts share:
  `resolve_font_dirs`/`resolve_locale_dir` (flags > env > `./packs/*`),
  `primary_font_dir` (the dir a NEW pack is created in — the same
  precedence resolved directly rather than as `resolve_font_dirs(..)
  .first()`, which would leave an empty-list arm no input can produce; a
  test pins the two equal at every position), `find_locale_file`,
  `load_locale_pack`; errors = `FsPackError`.
- `prepare.rs` — `prepare`: the validate-gate → assets → layout → dedup
  pipeline shared by inspect/preview/render; `AssetsInput` = `Prepare`
  (FS walk) | `PrepareInjected` (bundled-byte walk) | `Prebuilt`;
  returns `Prepared { document, boxes, margin, diagnostics, assets }` or
  the full `Diagnostics` on any errors. (No `title`: the PDF title —
  and the rest of the document metadata — resolves in LAYOUT and rides
  `document.metadata`, so the hosts pass the tree and nothing else.)
- `inspect.rs` — `InspectEnvelope { engine, document, boxes, margin }` +
  `inspect_json`.
- `formats.rs` (+ `formats/{variants,probe,exemplar,facts}.rs`) — the FORMAT
  CATALOG: `format_catalog(Option<&Template>, &LangPack, &[PatternProbe])`
  → `FormatCatalog { types: [FormatTypeEntry { field_type, fixed,
  variants: [FormatVariant { spelling, origin, samples, drops_time }] }],
  probes }`. `drops_time` marks a variant that discards the TIME — a
  date-table name resolved on a datetime slot, or a datetime pattern the
  pack wrote without time tokens. It is MEASURED, not tabulated from
  spellings: the variant renders the exemplar and its same-day twin at a
  different time (`exemplar::DATED_OTHER_TIME`), and equal output means no
  time token survived — which answers for a third-party pack and for the
  document's own `formats:` entries, as a spelling list could not — both
  pinned (`drops_time_answers_for_the_documents_own_registry_entries`). The
  inference has ONE precondition, guarded rather than assumed: every token in
  `shojiku_formatter::PATTERN_TOKENS` must render differently for the two
  exemplars or across days, so a token added later that moves under neither
  cannot silently escape the measurement
  (`every_pattern_token_is_visible_to_the_two_exemplars`).
  `formats/facts.rs` is the catalog's sibling query, over the same
  exemplars and the same dispatch (`variants::render_one`, `pub(super)`
  precisely so there is one door): `locale_facts(Option<&Template>,
  &LangPack)` → `LocaleFacts { id, date, number, currency_default,
  amount }` — what picking a `defaults.locale` / `defaults.currency` DOES,
  as rendered samples rather than as pattern strings. Samples render at NO
  variant, which is what a bare `{key}` binding resolves, and through the
  DOCUMENT's own chain — so an undeclared document's amount carries the
  fraction digits and no symbol (`symbol`/`name` are per-placement
  variants), while one whose `defaults.formats.currency` names a variant
  gets that variant, which is what its page prints. An agreement test pins
  the UNDECLARED case against the catalog's `default` row; the declared case
  is pinned by a literal, not by the catalog. `currency_default` is EMPTY when the pack declares none —
  the engine reports the absence, and a consumer decides what to say. It
  answers for a pack the caller loads itself, so a host can describe a
  locale it is not rendering through. Capability key `locale.facts`.
  Deliberately NOT part of `inspect`: a catalog is a function of (pack,
  registry) rather than of a laid-out document, and a probe describes a
  pattern the document does not contain yet, which `inspect` cannot report
  by construction. The template is OPTIONAL because a live editor's
  document is invalid for much of the time somebody is typing in it.
  `exemplar.rs` holds the fixed sample values — chosen to DISCRIMINATE
  what they illustrate (8 significant digits separate uniform-3 grouping
  from lakh/crore; the instant is after noon and carries a weekday and an
  era-bearing year; percentage is a FRACTION; quantity samples both plural
  arms). `probe.rs` bounds the caller-supplied list (`MAX_PROBES`,
  `MAX_PROBE_PATTERN`). Echoed NAMES are guarded one file over, in
  `variants.rs` — `pickable()` is the whole rule, and it OMITS a name
  that would not survive the echo guard rather than offering a clipped
  or stripped spelling, because a catalog entry is re-authored back as
  `format: <spelling>` and a sanitized one would be a dangling reference.
- `preview.rs` — `preview_pages` (PNG per page) + `preview_raw` (RGBA)
  + the single-page `preview_page{,_raw}` (CLI `--page` / MCP `page` /
  WASM `pageIndex` rasterize ONE page).
- `capabilities.rs` — `EngineInfo`/`engine_info`/`run_capabilities`;
  the `CAPABILITIES` key array lives under `capabilities/list.rs`
  composing per-concern slices `list/{items,boxes,style,hosts}.rs`
  (const-concat, wire order preserved) — **append a key to the matching
  submodule whenever the wire format, accepted asset surface, or output
  surface widens**.
- The verified bytes-first font path is `FontStore::load_from_injected`
  over `resolve_face_bytes`; `from_faces` (no verify) is never exposed
  through this layer.
- `reference.rs` — the **key catalog**: `CATALOG` (`include_str!` of the
  committed artifact — inside the crate root, so `cargo package` and the
  Docker builder both see it) and `CATALOG_PATH` (a compile-time constant
  from `CARGO_MANIFEST_DIR`; the generator takes no argument and reads no
  environment, so nothing a caller supplies steers a write).
  `ANNOTATIONS` (`include_str!` of `reference/annotations/en.yml`, the
  authored per-key prose; English only — the engine does not translate).
  `reference/generate.rs` (`schema` feature only) — two roots
  (`Template`, `Definitions`) into one `$defs`, `for_deserialize`, and the
  `StripDeveloperProse` transform that removes the `description`/`title`
  schemars lifts out of Rust doc comments, so the prose in the artifact is
  the AUTHORED layer rather than developer text in the wrong register.
  `reference/annotate.rs` (`schema` only) — merges the annotations onto
  the nodes they name, by LOOKUP not by walking, so a mistyped key cannot
  decorate an arbitrary subschema; it upgrades a boolean schema (`true`,
  from `Option<serde_json::Value>`) to the equivalent `{}` so the node can
  carry prose at all — `Schema.recommendedStyle` is the only one.
  `reference/annotations.rs` (DEFAULT feature) — the rule the gate is:
  `nodes()`, `branches()`, `anonymous_branches()`, `audit() -> Vec<Problem>`,
  `parse()`, plus `annotations/closed.rs` (`closed_values`/`closed_union`,
  the two spellings a closed value set reaches the catalog in).
  `src/bin/reference-gen.rs` — `[[bin]]` with `required-features =
  ["schema"]`, so a default build never compiles it.
  Artifact: `reference/catalog.schema.json` — 84 named shapes, and **420
  annotatable NODES**, which is not the same set: the wire's tagged unions
  are internally tagged, so schemars emits them as `oneOf` branches rather
  than named shapes and the 15 item types plus the 2 body kinds live only
  there. A node is a shape, one of its properties, a DISCRIMINATED branch,
  or one of that branch's properties (`Item.text.data`). Excluded, both
  pinned by the gate rather than trusted: the 7 anonymous branches and their
  20 keys (no name to address them by; described by the parent's prose or by
  the shape each key `$ref`s), and a branch's own `type` key, which IS the
  branch.
  Gates: `make reference:generate` regenerates, `make reference:check` runs
  the schema tests **and** the drift comparison — the comparison alone is
  an idempotence claim and would protect a wrong artifact just as well.
  The tests over the artifact's own properties read `CATALOG` and so run
  in the DEFAULT suite (and the coverage gate); only regeneration and
  determinism need the feature.

## engine/fetch — the host-side font fetch layer

The FIRST and ONLY network code in the repo, and a host crate no engine
crate depends on (CLI only today). Turns a pinned reference (`FaceSpec`
with `sha256` + `url:` hint, no file) into bytes on disk BEFORE render,
so layout/render/sign/verify stay socket-free.

- `ensure.rs` — `ensure_faces(specs, cache, policy, transport, Mode)`:
  present file untouched → cache blob repoints → url fetched (≤3
  redirect hops, each re-policy-checked) → hash-verify against the pin
  (any mismatch = hard error, nothing unverified cached) → cache →
  repoint.
- `policy.rs` — `FetchPolicy` https-only host allowlist (exact or
  `.`-boundary suffix; IP literals + userinfo rejected;
  `with_extra_hosts` = CLI `--font-fetch-allow`).
- `transport.rs` — `Transport` trait + `HttpTransport` (ureq+rustls,
  native roots; redirects DISABLED so the core re-checks each hop).
- `read.rs` — `read_capped` (streaming size cap + sha256 in one pass;
  `is_sha256_hex` guards digests before they become cache paths).
- `cache.rs` — `FontCache` content-addressed blobs (atomic tmp+rename,
  re-hash-on-read self-heal; hand-rolled platform cache root — no
  `dirs` crate, MPL).
- `error.rs` — `FetchError`/`TransportError` + the clip guard on echoed
  URLs.

## engine/cli — thin wrapper over authoring

- `lib.rs` — the crate root is now the command TABLE alone
  (`render`/`validate`/`inspect`/`preview`/`formats`/`sign`/`sign-prepare`/
  `sign-complete`/`verify`/`font add`/`capabilities`) plus the module
  wiring and re-exports; `main.rs` thin.
  `VerificationFailed` carries an exit status only, and
  `ValidationFailed` carries the diagnostics as well (stderr already had
  them as prose; `--report` needs their codes and typed args) — both
  have already printed the JSON that explains them, so `main.rs`
  suppresses a second stderr line for each.
- `args.rs` (+ `args/signing.rs`) — the flags each command takes. Split out
  of the root when the two external verbs would have pushed it past the
  300-line cap, and split AGAIN by subject: the four commands that sign or
  check a signature live together, which is what makes "no key crosses the
  external verbs" readable rather than something to re-derive from a flag
  list. `ReportArg` (the `--report` flag) is flattened into every command
  whose outcome an SDK consumes.
- `external.rs` (+ `external/tests.rs`, `tests/{accept,refuse}.rs`) — the
  `sign-prepare` / `sign-complete` pair: signing with no key, no
  passphrase and no prompt in reach. `Prepared` carries the C ABI's own
  four key names (`toBeSigned`/`digest`/`byteRange`/`capacity`), because
  the two subprocess SDKs read the SAME object off both hosts. The
  algorithm SPELLINGS come from `shojiku_signing::SignatureAlgorithm`
  rather than a table here, and the finishing half goes through
  `PresignedSigner` + `sign_document` — the same writer the local-key path
  uses, so the external route cannot drift from it.
- `formats.rs` — `shojiku formats`: the catalog as JSON. `--templates` is
  OPTIONAL (the locale's vocabulary is useful with no document; a NAMED
  file that cannot be read is still an error, which is a different case),
  and `--probe <type>:<pattern>` splits at the FIRST colon only, because a
  pattern routinely contains one (`datetime:HH:mm`).
- `font.rs` (+ `font/{ids,write}.rs`, `font/tests/hostile.rs`) — the only
  command that writes to paths it DERIVES rather than paths the caller
  named (`--output`, `--report`): `font add` turns a licensed font file
  into a pack (`<font-dir>/<pack>/manifest.yml` + the
  copied face, sha256 pinned), creating the pack or APPENDING a face to
  it. Both rules a generated pack must satisfy are the LOADER's
  (`shojiku_layout::{face_sha256, embedding_restricted}`), never restated
  here — a pack this writes and the engine then refuses is the one
  failure a generator exists to prevent. `FontPackError` is its own
  vocabulary (one `CliError::FontPack` arm, kind `font_pack`), since
  `font add` carries no `--report` for an SDK to branch on. `ids.rs` =
  the pure rules (the pack-id charset applied to family/face ids too, the
  `-bold`/`-italic` face-id suffixes matching what the Designer's
  browser-side builder mints, the face file-name guard); `write.rs` = the
  FS half only, deciding nothing — pack dir via
  `authoring::fs::primary_font_dir`, the size cap + parse probe, the
  existing-manifest read, and the face-then-manifest commit with the
  manifest written tmp+rename. Its tests provoke every IO refusal with a
  DIRECTORY where a file belongs: the gates run as root, so an unreadable
  file proves nothing.
- `error.rs` — `CliError` (wrapping `FsPackError`/`FetchError`/
  `SigningError`/`KeyError`/`VerifyError`) and its classification:
  `class()` splits caller error from a refused document, `kind()` is the
  stable string an SDK branches on. Both are APPEND-ONLY contract, and
  the kinds shared with `engine/capi` keep the capi's spelling — five
  SDKs already map those strings. `error/tests.rs` walks one case per
  variant, which is where the whole vocabulary is reviewable at once.
- `report.rs` — the `--report <path>` envelope: `ok`, `diagnostics`
  (the `Diagnostics` value itself, so it serializes as the
  `{"items": […]}` object the shipped SDKs parse), `pageCount` (render
  only), `verification` (verify only, on either verdict), `failure`
  (absent when ok). `clip` bounds the echoed message exactly as the
  capi's does. `main.rs`'s `fail()` writes the report on the FAILURE
  path — the path an SDK most needs and the easiest to leave out —
  swallowing the write's own error so the operation's real cause is
  what the caller is told.
- `commands.rs` — `run_*` wrap authoring; `run_render` returns
  `Rendered` (bytes + diagnostics + page count), all three of which the
  report needs and only the bytes of which used to survive the call.
  `prepare_layout` reads files,
  resolves the locale, then `load_fonts` (`resolve_face_specs` → fetch
  only when a face is absent via `shojiku_fetch::ensure_faces` →
  `FontStore::load_from_specs`; the all-present fast path skips fetch
  entirely), then `authoring::prepare` + `render_pdf` composition;
  `report_fetched` prints one stderr notice per downloaded face.
- `sign.rs` — `run_sign` over `shojiku_signing::sign_document`. The
  passphrase is asked for ONLY after the signing crate reports the key
  needs one, so an unencrypted key never prompts and a script never blocks
  on a question it cannot answer. `PassphraseSource` is a trait purely so
  the terminal read — the one line no test harness can run — does not drag
  the rest of the command out of the tests with it.
- `verify.rs` — `run_verify` over `shojiku_verify::verify_document`
  (map: [verify.md](verify.md)). `--anchor` is REQUIRED, because
  verification never consults the machine's trust store and so has no
  default to fall back on; several `--anchor` files are concatenated, so one
  flag holding a chain and several holding one certificate each behave
  identically. A document that fails to verify is NOT a `CliError`: the
  report prints either way and the exit code carries the verdict.
- Flags: pack `--font-dir`/`--locale-dir` (repeatable, earlier wins),
  `--font-pack` (repeatable — extra pack ids resolved BEFORE the locale's
  own `uses`, so a user face id shadows a bundled one; re-guarded by the
  resolver, since a flag is no more trusted than a parsed entry),
  `--lang`; fetch `--offline`/`--font-fetch-allow`; asset
  `--assets-dir`/`--asset-mode`/`--allow|deny-dynamic-image`; preview
  `--output`/`--scale`/`--page`; sign
  `--input`/`--key`/`--cert`/`--output`/`--passphrase-env`; verify
  `--input`/`--anchor`; the machine-readable `--report` on render/sign/
  verify (capability `cli.report`) — and deliberately NO flag carrying the passphrase
  itself, since `argv` is readable by other processes and lands in shell
  history (pinned twice: `tests/bin/sign.rs` proves it is absent from the
  help, `src/tests/args.rs` proves clap REJECTS it), and none sizing the
  signature window, since the default holds
  every signature this release can produce.

## engine/mcp — the stdio MCP server

Hand-rolled newline-delimited JSON-RPC 2.0 (zero new deps, no async
runtime — user decision, features.md § Decision log). The second thin
host over authoring.

- `lib.rs` — `ServerArgs` (pack flags like the CLI), `McpError` (only
  transport I/O aborts), `run_stdio`.
- `rpc.rs` — framing (`read_frame` bounded 1 MiB with drain-resync,
  `write_frame`, error codes incl. MCP's `RESOURCE_NOT_FOUND` -32002,
  `RpcError { code, message, data }` — the tool surface's `(code,
  message)` pair converts into it — and the clip echo guard).
- `server.rs` — the serve loop + dispatch (`initialize` version
  negotiation + declared capabilities + `instructions`, `ping`,
  `tools/list`, `tools/call`, `resources/list`, `resources/read`;
  notifications never answered).
- `instructions.rs` — the `INSTRUCTIONS` const returned at initialize:
  three-file model, the authoring loop, the example surface, and the
  staleness rule. A signpost, size-pinned by its tests.
- `examples.rs` — the bundled-example catalog: `SourceFile`,
  `CatalogEntry { id, title, description, files }`, `catalog()` (built
  once behind a `OnceLock`) and `find(id)`. Prose COMPOSES from
  `examples/gallery.yml` (`include_str!` + serde_yaml) for the 24 listed
  entries plus an `EXTRAS` table for the showcase and the 7 presets —
  never a second copy of the gallery text. `examples/embed.rs` — the
  compile-time `include_str!` table of all 32 entries' source files (the
  one place that knows the repo layout); `examples/uri.rs` — the
  `shojiku://example/…` grammar, a closed charset that refuses `.`/`..`,
  `%`-escapes, control bytes and separators, so a reference NEVER becomes
  a filesystem path. `examples/tests.rs` holds the DRIFT GATE: the
  embedded set is asserted equal to the real `examples/` directory in
  both directions, per-entry file lists included, plus the build-time
  per-file size bound.
- `resources.rs` — `resources/list` (all 32 entries, complete, no
  cursor) + `resources/read` (an entry's files together, or one named
  file). `MAX_ENTRY_BYTES` 64 KiB caps a BUNDLE and refuses with the
  per-file URIs rather than truncating; a named file is served whole.
- `tools.rs` — dispatcher + content parts (base64 PNG image parts +
  diagnostics JSON part; `failure_result` — in-band `isError` carries a
  message OR full diagnostics). `tools/examples.rs` — `list_examples`
  (the catalog + how to fetch) and `get_example` (delegates to
  `resources::read`, so the two entry points cannot drift; an unreadable
  target comes back in-band as `isError` rather than as a protocol
  fault, unlike the resource spelling). `tools/schema.rs` — the pinned tool
  descriptors (`validate`/`render_preview` (page cap without `page`)/
  `inspect_layout`/`capabilities`/`list_examples`/`get_example`/
  `format_catalog`); inline/path either-or rides
  `allOf`+`anyOf`. `format_catalog` is the only descriptor that TAKES
  arguments and requires none of them — no `allOf`, no `required` —
  because a catalog answers without a document (`capabilities` and
  `list_examples` also declare neither, but they accept no arguments at
  all). `tools/sources.rs` — `Source` Path|Inline (`<name>`
  XOR `<name>Path`, `MAX_INLINE_BYTES` per-argument cap).
  `tools/assets.rs` — `AssetArgs` → `AssetPolicy` + root (capped id
  lists). `tools/pipeline.rs` — args → `prepare_from` (validation gate
  BEFORE pack/font loading — CLI-parity precedence). Per-tool impls in
  `tools/{validate,preview,inspect}.rs`. `tools/formats.rs` (+
  `formats/tests/{catalog,probes,refusals}.rs`) — `format_catalog`, the
  THIRD host over `shojiku_authoring::format_catalog` (the CLI and the
  wasm binding are the other two; `engine/capi` does not expose it). It
  is the only tool that loads a locale pack WITHOUT a font store —
  `pipeline.rs` is the one other `load_locale_pack` caller and builds a
  `FontStore` on the next line, while `validate` and the example tools
  need no pack at all — and the only one outside `pipeline.rs` that
  turns a source into a parsed document. A catalog is a function of
  (locale pack, template registry), so no params are read and no fonts
  are loaded. It parses the template ITSELF rather than through
  `load_sources`, because an unparseable one must still answer the
  pack-and-builtins catalog — with the `parse_error` beside it, since a
  registry-free half and no reason given reads as "the registry does not
  work"; those diagnostics are PARSE-only, never a second `validate`.
  Its probe list arrives as `{ fieldType, pattern }` objects (the wasm
  host's shape, not the CLI's `<type>:<pattern>` string): the COUNT cap
  refuses the call as invalid params — the descriptor declares
  `maxItems`, so an over-long list is a wrong-shaped argument — while an
  over-long PATTERN rides through to the engine's per-probe `refused`,
  which names WHICH probe. Every template tool response
  carries diagnostics (docs/agents/mcp.md bundle principle); binary e2e
  in `tests/bin/`.

## engine/wasm — the browser/Workers bindings

The third thin host (no FS). Two layers: a pure host-testable core (the
workspace gates run on it) + a `#[cfg(target_arch = "wasm32")]`
marshalling shim (never host-compiled; wasm-bindgen/js-sys
target-gated).

- `session.rs` — `Session` pure state machine: locale pack, accumulated
  `InjectedPack`s, `font_faces_needed` (the manifest's pinned `url`
  hints surfaced to the host), the retained `FontStore` (`load_fonts` =
  verified injected load; `load_fonts_subset` = the lenient browser
  preview load returning absent `uses` pack ids the host lazily
  fetches + re-injects on `missing_glyph` OR `unknown_font_family`),
  injected asset byte map.
- `formats.rs` — the format catalog's pure core, INCLUDING the probe-list
  parser, plus `Session::locale_facts(template_src, locale_id, overlay)`.
  That one takes `&self` and touches NO session state: it `load_pack`s the
  named locale from the host's own pack text and discards it, so the panel
  can explain the tag the DOCUMENT declares while the preview keeps
  rendering the tag `set_locale` stored. An id that resolves to neither a
  builtin nor the overlay is a `WasmError::Locale` refusal — the id is
  author-typed, so its echo rides the same clip/control-strip guard as
  every other host-misuse detail. The parser lives here rather than in the shim because the shim is
  never compiled by host clippy/test/coverage, and a parser is not
  marshalling: putting it there would have shipped it unexercised by every
  host gate. It refuses (`deny_unknown_fields`, an unknown type name, a
  type with no pattern form) rather than defaulting, and sanitizes the
  echoed type name; `WasmError::BadProbes` is its host-misuse error.
- `error.rs` — `WasmError` = host-API misuse ONLY (document problems
  are diagnostics, never thrown), carrying a stable snake_case `code()`
  + typed `args()` (control-stripped/clipped) — an append-only registry
  a JS host branches on instead of matching the message.
- `render.rs` — `validate` → diagnostics JSON; the shared `ready` +
  `stage` (parse → validate → layout); `render(PageFormat, …, page?)` →
  `RenderResult` (PNG or raw pages + inspect + diagnostics; raw
  all-pages capped by `MAX_RAW_PAGES` so uncompressed pages cannot
  exhaust the heap); `render_pdf` → `PdfOutcome` composing
  `shojiku_render_pdf::render_pdf` HERE in the host exactly as the CLI
  does (authoring stays PDF-free; no scale/page/cap so browser bytes
  cannot differ from the CLI's).
- `shim.rs` (wasm32-only) + `shim/marshal.rs` — the `#[wasm_bindgen]
  Engine` binding surface + value conversions: setLocale /
  fontPacksNeeded / fontFilesNeeded / fontFacesNeeded / addFontPack /
  addFontFile / loadFonts / loadFontsSubset / addAssetFile / validate /
  renderPng / renderRaw (one arg order surface-wide: template, params,
  definitions, scale, pageIndex?) / renderPdf / formatCatalog /
  localeFacts; a `WasmError` becomes a
  thrown JS Error carrying `code` + typed `args`.
- Built via `make engine:wasm` (Docker: wasm32 target + pinned wasm-bindgen +
  pinned `wasm-opt -Oz` + `wasm-release` profile → `engine/wasm/pkg`,
  size-budgeted; in `make verify`). Browser golden path in
  `engine/wasm/e2e/` (Playwright, `make engine:wasm-e2e`, on-demand).

## engine/capi — the shared C ABI cdylib

The FOURTH thin host (`cdylib` + `rlib`, the wasm crate's shape — the rlib is
what keeps the workspace test/clippy/coverage gates on it). Host-side only:
never in the wasm build, no crate depends on it, and **no `shojiku-fetch`
dependency**, so the render path it exposes is socket-free. The FFI SDKs
(python/ruby/c#/java) load it; `engine/napi` LINKS it (node has no stdlib FFI,
so its addon reaches the engine through this host rather than beside it) and
php/go get the CLI.

**Three contracts the whole surface rests on** (`include/shojiku.h` states
each for the C side): nothing is NUL-terminated — every string and buffer
crosses as (pointer, length), because PDF bytes contain NUL; ONE allocation
kind crosses (`ShojikuResult`) with ONE destructor, and accessors LEND
pointers into it that die with it; a failure is data, never an unwind
(`catch_unwind` at every entry point — so **no profile building this crate
may set `panic = "abort"`**).

**Two failure levels, and they are not the same thing.** A non-zero status
means the CALLER erred (null pointer, non-UTF-8, a request the schema
rejects) or a panic was caught. A document that will not lay out, a pack that
is not installed, a key that will not sign are OUTCOMES: status 0,
`success` 0, diagnostics attached. That split is what lets an SDK raise for
the first and return a result object for the second (`docs/agents/sdk.md`).
Both levels render the same `{step, kind, message}` object, so one mapping
per SDK covers both.

- `src/lib.rs` — crate role + the unsafe discipline this crate introduces to
  the workspace (`deny(unsafe_op_in_unsafe_fn)` +
  `deny(clippy::undocumented_unsafe_blocks)`); re-exports the surface.
- `src/api.rs` (+ `api/tests.rs`) — the entry points
  (`shojiku_abi_version`/`engine_info`/`validate`/`render`/`preview`/`sign`/
  `sign_prepare`/`sign_complete`/`verify`) and the shared frame: check `out`,
  BLANK it (so an unconditional
  free in a binding's cleanup path is well defined), run under the shield,
  write the result or the failure-as-result. `deliver` is function-pointer
  taking, not generic, so one copy exists in the binary.
- `src/api/work.rs` — the `Work` enum (one variant per entry point) and the
  pointer borrowing. A VALUE, not a closure per entry point: a closure is a
  separate function in every copy of this crate, and each copy the caller
  does not reach reads to the coverage gate as dead code. Split from
  `api.rs` when the verify arm pushed that file at the 300-line budget.
- `src/status.rs` (+ `status/wire.rs`) — the status codes, `Failure` (one
  enum for both levels; `status()` decides which), and the two shields.
  **Both shields are non-generic on purpose**: a generic shield is
  monomorphized per call site and each copy carries an unwind arm no test can
  reach. `wire.rs` holds the `{step, kind, message}` rendering, the `clip`
  echo bound, and `encode` — infallible by signature, with the refused-value
  arm handled once in a non-generic helper.
- `src/input.rs` — the ONE place raw pointers are dereferenced: null rejected
  whatever the length says, cap checked before any read, zero length never
  touching the pointer.
- `src/result.rs` (+ `result/access.rs`) — the handle and its accessors.
  One shape for every operation (an operation with no pages simply has none),
  so a binding learns one calling convention. The `json` slot is per-operation:
  engine info, a render's `{"pageCount": n}`, a verification report, or
  `sign_prepare`'s bytes-to-sign object. The last two take the SAME
  constructor (`json_and_diagnostics`, named for the shape rather than for
  either caller) — a second one for the second caller is how one shape
  acquires two spellings.
  A render's page count could NOT reuse `shojiku_result_page_count` — that
  one counts a preview's PNG buffers, and redefining it would move the ABI
  revision instead of appending to it.
- `src/request.rs` — the JSON envelope, `deny_unknown_fields` (a misspelled
  SDK key is a located error). Host-level caps mirroring MCP: the asset id
  lists and `scale`. Sources travel as TEXT — this host reads no template
  from disk.
- `src/ops/verify.rs` — the verifier wrapped. `success` is the VERDICT, not
  "a report came back": a binding that checked only `success` on a document
  whose signature fails would otherwise be told everything is fine, and
  fail-closed is the only direction a verification API may lean. The report
  rides the result EITHER WAY, because it names the checks this release does
  not perform; a failed verdict adds an error object naming the first failed
  check (scanned in the report's own order, so two runs blame the same one).
  A document that cannot be EVALUATED has no report at all — a different
  fact from an empty one. Anchors are required: there is no trust store to
  default to.
- `src/ops/sign/external.rs` (+ `external/tests.rs`) — the two-call signing
  surface for a key this process is never given. **Stateless on purpose**:
  no prepared-document handle crosses (one allocation kind, one destructor),
  so both halves take the same document/certificate/algorithm and `complete`
  RE-PREPARES — exact because appending the placeholder is deterministic, and
  it makes a digest that disagrees with the bytes impossible. `complete`
  builds a private `Fixed` `Signer` whose `sign()` returns the caller's
  finished signature and hands it to the SHIPPED `sign_document`, so the
  external route cannot fork the local one (a test pins byte identity).
  `prepare` takes the certificate + algorithm it does not need for
  `to_be_signed` so unusable material fails BEFORE a key-service round trip.
  `parse_algorithm` (the kebab wire spellings, refusal naming what IS
  accepted) and `require_signature` (empty is refused, not written) are free
  functions so the crate's OWN test binary covers them.
  `MAX_SIGNATURE_BYTES` = `DEFAULT_CONTENTS_CAPACITY`: longer than the whole
  window fits no container.
- `src/ops.rs` + `ops/{info,validate,render,preview,sign,verify}.rs` — safe Rust over
  borrowed strings; by the time these run the pointers are gone. `lay_out` is
  the CLI's `prepare_layout` without the file reads and without the fetch.
  The render/preview backend refusals are `From` impls rather than per-site
  `map_err` closures, since the backends refuse only inputs the engine does
  not produce.
- `include/shojiku.h` — hand-written (cbindgen was rejected: a new toolchain
  dependency for a 15-symbol surface, and the prose is the point). A parity
  test in `tests/capi/header.rs` runs BOTH ways against the `#[no_mangle]`
  attributes, so the two cannot drift.
- `tests/capi/` — the near-e2e suite, driven through the exported symbols and
  the real accessors only: anything an SDK cannot do, the tests do not do.
  `external_signing.rs` (+ `external_signing/refusals.rs`) drives the two-call
  surface the way a KMS-backed SDK does, with an in-test key standing in for
  the service — the round trips (RSA, ECDSA, a leaf chaining to its CA), the
  byte-identity claim against the one-shot path, prepare idempotence, and the
  two outcomes the header says are NOT caught at the boundary (a signature
  over another document; a tampered file) proven to fail verification.
  `threading.rs` pins the header's THREADING paragraph — four threads render
  one document and must produce the SAME BYTES as a single-threaded call, so
  both halves of the claim (no shared mutable state; determinism is not a
  single-threaded property) ship executed.
- Built via `make engine:capi-dist` (Docker, on-demand — not in `verify`): release
  cdylibs for linux x64/arm64 + windows x64-gnu with cross toolchains, plus
  `SHA256SUMS`, into the gitignored `dist/capi/`. darwin needs a macOS
  runner and is produced at release time.

## engine/napi — the N-API addon the npm package loads

The FIFTH thin host, and the only one that reaches the engine THROUGH another
host: it links `shojiku-capi` as an rlib and calls its entry points. Node has
no stdlib FFI, so it needs a native addon — but an addon that re-parsed the
request envelope and re-dispatched the operations would be a FORK of the C
host, two definitions of one append-only wire. So the envelope crosses this
crate UNPARSED and the status integers are capi's own. (`cdylib` + `rlib`,
the same shape as wasm/capi.)

**The shim is behind a non-default `shim` cargo FEATURE**, which is what a
target gate does for `engine/wasm`: `cargo test`/`llvm-cov --workspace` build
the default set, so the N-API marshalling glue never enters the 100%-lines
coverage surface, while `clippy --all-features` still lints it. Keep napi's
DEFAULT features on (`napi4` + `dyn-symbols`) — without them the addon links
and `dlopen`s and then fails at `require()` with `Module did not
self-register`.

- `src/call.rs` — the ONE place this crate crosses into capi: one handle per
  call, read into an owned value and freed on every path, every lent buffer
  copied out before the free. `read` takes the handle by POINTER so a null one
  is an ordinary answer rather than undefined behaviour — which is also what
  lets a test exercise that arm.
- `src/outcome.rs` — the owned result, carrying `status` beside `success`
  because those are the two levels the SDK contract rests on.
- `src/shim.rs` — the `#[napi]` surface. Every lifecycle call is an
  `AsyncTask` on the libuv threadpool (hence the npm package's async-only
  surface); ONE task type over a `Work` enum rather than four. `Buffer`
  borrows V8 memory and is not `Send`, so bytes are copied on the JS thread
  before the hand-off. `abiVersion` is the exception — a constant read.
- `build.rs` — `napi_build::setup()` under the feature; an empty `main`
  without it, so it costs no coverage.
- `src/call/tests/` — unit tests against the REAL engine (the crate's own
  binary, not the integration one, so the coverage gate sees them): the four
  operations, the two-level split both ways, hostile non-UTF-8 request bytes,
  and a byte-identity check against the capi path — the node SDK's determinism
  claim, made checkable.
- Built via `make engine:napi` (Docker: `--features shim` → `dist/napi/local/
  shojiku.node`, then LOADED under the node floor image to prove the artifact
  is what node thinks it is). In `make verify`.
