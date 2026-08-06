//! Capability keys — output surfaces and host bindings.
//!
//! What this build can EMIT and the host surfaces that expose it
//! (render/preview backends, MCP, WASM, diagnostics shape).
//!
//! One slice of the `CAPABILITIES` registry (composed in `super`);
//! keys stay in append-only wire order — never reorder or remove one.

pub(super) const KEYS: &[&str] = &[
    // Output surfaces.
    "render.pdf",
    "preview.png",
    // Encode-free raw RGBA preview pages (un-premultiplied, ImageData
    // order) beside the PNG form — the WASM canvas paints these directly,
    // skipping the PNG decode. Same layout/caps/pixels as `preview.png`.
    "preview.raw",
    // Single-page preview selection: a 0-based page index on the WASM
    // render ops (1-based `page` on the CLI `--page` / MCP `render_preview`)
    // rasterizes ONE page instead of every page. The WASM raw all-pages
    // form is additionally page-capped so uncompressed pages cannot exhaust
    // the module heap.
    "preview.page",
    "inspect.boxes",
    // The stdio MCP server (`shojiku-mcp`): validate / render_preview /
    // inspect_layout / capabilities tools over this same authoring layer,
    // every template tool response carrying diagnostics alongside the
    // preview/layout payload.
    "mcp.stdio",
    // Inline source arguments on the MCP template tools: `definitions` /
    // `template` / `params` carry the source TEXT beside the existing
    // `*Path` file references (mutually exclusive per source, size-capped),
    // so a client without a shared filesystem — a remote host, a sandboxed
    // container — can use the same tools. Additive: the path form is
    // unchanged, and an inline template resolves no bundled assets unless
    // the call also passes `assetsDir`.
    "mcp.inline_sources",
    // Per-call asset policy on the MCP layout tools, mirroring the CLI's
    // `--assets-dir` / `--asset-mode` / `--allow|deny-dynamic-image`:
    // `assetsDir` picks the bundled-asset root, `assetMode`
    // (`open`|`bundled-only`) plus the `allowDynamicImage`/
    // `denyDynamicImage` id lists shrink what params-supplied image content
    // an item may carry. Defaults keep the previous behavior (open policy,
    // root = the template's directory).
    "mcp.asset_policy",
    // The MCP read surface: `instructions` in the initialize result, the
    // bundled examples listed by the `list_examples` tool and fetched by
    // `get_example` or `resources/read` over `shojiku://example/...` URIs,
    // and the `resources` capability (list + read; no subscribe, no
    // listChanged). Read-only and additive — the server still never writes
    // a file. A client can gate on this instead of probing for the tools.
    "mcp.examples",
    // The browser/Workers WASM bindings (`shojiku-wasm`): the same authoring
    // ops (validate / render / inspect / capabilities) wrapped for JS, with
    // bytes-first injected fonts/assets/locale packs and a three-part render
    // bundle (raw or PNG pages + inspect envelope + diagnostics).
    "wasm.bindings",
    // The WASM host-misuse errors are thrown as JS `Error`s carrying a
    // stable `code` string + a typed `args` object (mirroring the
    // diagnostics discipline), so a host branches on the code (e.g. clamp
    // a stale `page_out_of_range` and re-render) instead of matching the
    // message. Codes + per-code arg keys are append-only. Document
    // problems still ride the render bundle's diagnostics, not a throw.
    "wasm.errors.typed",
    // Subset font-pack loading for the WASM preview path (`loadFontsSubset`):
    // the store loads from whatever of the locale's `uses` packs are injected
    // so far, SKIPPING absent ones and returning their ids; a skipped pack's
    // glyphs degrade to `missing_glyph` until the host fetches, re-injects, and
    // reloads. The primary (default-face) pack stays required, and the
    // render/sign path is unchanged (it still requires the full chain).
    "wasm.fonts.subset",
    // Per-face fetch hints for the WASM host (`fontFacesNeeded`): the face
    // list a declared pack's manifest carries, each paired with its optional
    // `url` (the `fonts.face.url` pin), so a host can fetch the bytes of a
    // pack that travels as a pinned reference. Additive beside
    // `fontFilesNeeded`, whose file-name-only shape is unchanged. The sha256
    // stays engine-side — a host cannot skip verification via this list.
    "wasm.fonts.faces",
    // Real PDF output from the WASM host (`renderPdf`): the browser renders
    // the deliverable itself, byte-identical to what the CLI writes from the
    // same template/params/fonts — the same layout tree through the same PDF
    // backend, composed in the host exactly as the CLI composes it. No scale
    // and no page selection (a PDF is vector and whole-document), and no cap
    // of its own, so the download cannot differ from the CLI's.
    "wasm.render.pdf",
    // The shared C ABI library (`shojiku-capi`): the same authoring ops
    // (engine_info / validate / render / preview) plus `sign`, exposed over a
    // C ABI for the FFI SDKs to load. Everything crosses as (pointer, length)
    // — nothing NUL-terminated, since PDF bytes contain NUL — with one result
    // handle per call and one destructor, and a panic caught at the boundary
    // rather than unwound across it. Caller error is a non-zero status; a
    // refused document is status zero carrying diagnostics. The ABI revision
    // itself is reported by `shojiku_abi_version` (1 today) and moves only if
    // an existing symbol changes meaning.
    "capi.abi",
    // Signing in two calls over the C ABI (`shojiku_sign_prepare` /
    // `shojiku_sign_complete`): the first hands out the bytes a signature
    // must cover, the second takes a finished signature back and writes the
    // document, so the private key can live in a cloud KMS, an HSM or a
    // smartcard and never enter the calling process. Additive — the one-shot
    // `shojiku_sign` with a local PEM key is unchanged, and the two paths
    // produce byte-identical output for the same material. Shojiku ships no
    // KMS client of its own: the caller signs the bytes with whatever client
    // their language already has.
    "capi.sign.external",
    // The CLI's machine-readable operation report (`--report <path>` on
    // `render` / `sign` / `verify`): one JSON object carrying `ok`, the
    // engine's `diagnostics` on success as well as failure, a render's
    // `pageCount`, a verify's `verification` report on either verdict, and
    // — when it failed — a `failure` naming whether the CALLER or the
    // DOCUMENT was at fault beside the capi's own `{step, kind, message}`.
    // This is what the subprocess SDKs (php, go) read: stderr prose cannot
    // express a diagnostic's `code` or its typed `args`, and nothing else
    // on the wire tells caller error apart from a refused document.
    // Additive — absent the flag, stdout, stderr and the exit code are
    // exactly what they were.
    "cli.report",
    // Signing in two calls over the CLI (`sign-prepare` / `sign-complete`),
    // the same seam `capi.sign.external` exposes to the SDKs that link the
    // library. `sign-prepare` prints what a signature must cover — and
    // carries it in the `--report` envelope as `prepared` — while
    // `sign-complete` takes the finished signature back as a file of raw
    // bytes. Neither takes a key or a passphrase. This is what the
    // subprocess SDKs (php, go) need to offer a provider for a key held in a
    // cloud KMS, an HSM or a smartcard.
    "cli.sign.external",
    // User font packs from the CLI (`shojiku font add`): a licensed font
    // file a user holds becomes an ordinary pack — `manifest.yml` + the
    // face, sha256-pinned — under a font search dir, and `--font-pack <id>`
    // (repeatable, on render / preview / inspect) loads it in addition to
    // the locale's own `fonts.uses`, resolving BEFORE them so a user face id
    // shadows a bundled one. Never system-font scanning: a pack is loaded
    // because a run named it. A face whose OS/2 fsType forbids embedding is
    // refused at add time unless `--embedding-attested` asserts a separately
    // held licence.
    "cli.font.add",
    // Diagnostics v2: every diagnostic carries typed `args` (String |
    // Number | Bool) + a `category` + an `origin` alongside `code` +
    // `message`, so a GUI can localize from `code` + `args` instead of the
    // English string. Codes + per-code arg keys are an append-only contract.
    "diagnostics.args",
    // Structural parse failures are surfaced by `validate` as a
    // `parse_error` / `non_finite_number` diagnostic (with `path` +
    // line/column args) rather than an opaque error string.
    "diagnostics.parse_error",
    // Layout-stage diagnostics carry the offending item's structural
    // `path` in the same grammar as the box index, so an overflow or
    // ignored-key warning names WHICH item raised it (a data key rides
    // in `args.key`, never in `path`). Older engines emit most layout
    // diagnostics with no `path` at all, so a consumer cannot offer a
    // jump-to-item for them.
    "diagnostics.layout.path",
    // definitions.yml v2: the OpenAPI-schema shape (`type: object` +
    // `properties`/`items`, isomorphic to the params JSON), `format` as the
    // open data-semantic vocabulary, `displayFormat`/`displayFormats` for
    // display variants, and params-vs-schema validation diagnostics
    // (`params_*` + `definitions_format_ignored`). Absent this key, the
    // engine wants the retired v1 `groups` form.
    "definitions.schema",
    // An `enum` member may be authored as `{ value, label }` beside the
    // bare form, and a plain-text field renders the declared label in
    // place of its value (`{key:value}` renders the value instead).
    // Absent this key, the engine reads a mapping member as a parse
    // error, so only bare members are authorable.
    "definitions.enum.labels",
    // rect / ellipse / checkbox / text `mark` styled by the unified
    // `Style` (+ `styleNames`): `backgroundColor` replaced `fillColor`
    // (which older engines still require), rect gained per-side borders
    // + `borderStyle` and LOST its implicit 1pt default stroke; marks
    // keep a 1pt frame default. Absent this key, author `fillColor`.
    "style.shapes.unified",
];
