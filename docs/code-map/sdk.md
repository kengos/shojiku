# Code map — sdk/

> AI-only, token-dense. Index + repo-wide conventions: [CLAUDE.md](../../CLAUDE.md).

Seven language wrappers over the same engine. **Ruby is built and is the
REFERENCE**: interface-shape questions in the other six are answered by
reading `sdk/ruby`, not re-decided (deviation = a design decision, route to
the architect). Policy: `docs/agents/sdk.md`. Staged queue + the frozen
reference decisions: `docs/agents/sdk.md` § The decisions the reference froze.

All seven are built. Directory names are load-bearing elsewhere: `sdk/js` is
the node one (`scripts/generate-sbom.sh`, `verify:sdk:js`,
`docs/guidelines.md`), `dotnet` is c#. The SBOM script gates on a LOCKFILE,
not the directory — `sdk/js` has one, so it is scanned; `sdk/php` and
`sdk/go` deliberately have none (no dependencies to lock, and a
dependency-free Go module has no `go.sum` at all).

## sdk/ruby — the reference SDK

Loads `engine/capi` through **fiddle** (stdlib, so one binary serves every
supported Ruby — a native extension would not). Floor 3.3. Only the SDK
CONTRACT's lifecycle is bound — `engine_info` / `render` / `sign` / `verify`;
`validate` and `preview` are the AUTHORING surface's and reach consumers
through `engine/wasm`, so binding them here would be surface with no
contract behind it.

- `lib/shojiku.rb` — requires + the three things to know before reading any
  of it (results not exceptions; nothing reimplements the engine; nothing
  downloads).
- `lib/shojiku/client.rb` — the entry point. TWO render entrances:
  `generate(name, params)` through the root, and `generate_source(template:,
  definitions:, assets_dir:, params:)` over bytes the app holds (no root, no
  containment, and deliberately no file read — a path-shaped `template:` is a
  parse failure). Plus `artifact(bytes)` (archived-PDF re-entry), `sign` /
  `verify` / `engine_info`, and `with_lang` (a derived client sharing the open
  library — Ruby's spelling of the per-call locale, because a keyword beside
  the trailing-hash `params` breaks `generate(name, key: value)`).
- `lib/shojiku/settings.rb` — one client's RESOLVED configuration
  (`Config` defaults merged with the constructor's arguments) and the
  collaborators built lazily from it; where the precedence rules read as one
  piece. `lib/shojiku/config.rb` — `Shojiku.configure` / `.config` /
  `.reset_configuration!`; `merge` is nil-means-unset plus the ONE inversion
  (`strict` is OR-ed, so a declared lockdown cannot be lifted by a call site).
- `lib/shojiku/outcome.rb` — Snapshot → `Result`, the two-level split made
  concrete: non-zero status → `UsageError` (caller misuse), status 0 with
  `success` false → a failed `Result`. `verdict` parses diagnostics on BOTH
  paths. `lib/shojiku/request.rb` — the one JSON envelope both entrances
  build; a String params crosses verbatim (the engine parses JSON or YAML).
  `lib/shojiku/sources.rb` — `Sources`, produced either by the root or from
  caller bytes, which is what keeps the second entrance from being a second
  code path.
- `lib/shojiku/lockdown.rb` — the `strict:` ceiling AND the named-provider
  registry, in one object the six mirror: refuses the bytes entrance, refuses
  to sign anything whose `origin` is not `:rendered`, takes providers by name.
  Verification is never restricted. Refusals are `UsageError`, not failed
  results. `lib/shojiku/log.rb` — the optional duck-typed logger; host events
  only (library discovery + which position won, ABI, step/duration/verdict),
  never params, diagnostics or key material.
- `lib/shojiku/engine.rb` — the declared C surface and the ONE place a call
  crosses. `SIGNATURES` is the surface as a TABLE (`PAIR` = the
  (pointer, length) every data argument crosses as, `OUT` = the result slot),
  so an operation's arity is the count of its arguments and cannot drift from
  the header by a hand-typed list. `Snapshot` (a Data value) is copied out of
  the handle and the
  handle is freed in an `ensure`, so no Ruby object ever holds an engine
  pointer. `INT32`/`SIZE` unpack directives are picked to match the C types
  EXACTLY — `unpack1` returns nil rather than raising when the directive is
  wider than the slot, which silently made every flag false once.
- `lib/shojiku/library.rb` — discovery (`SHOJIKU_LIBRARY` → explicit config →
  the copy in a platform gem) + the ABI check at load. Deliberately the
  REVERSE precedence from the template root; both reasons are in the file.
- `lib/shojiku/template_root.rb` — names are identifiers. Rejection rules are
  the UNION across platforms (separators, control chars, drive-relative, DOS
  devices) plus a realpath containment check no name-shape rule can make.
  Layout `<root>/<name>/templates.yml` (+ optional `definitions.yml`,
  `assets/`), behind this class so a bundle can take the lookup over.
- `lib/shojiku/env.rb` — the ONE place the environment is read; one
  `enabled:` flag governs every `SHOJIKU_*` lookup.
- `lib/shojiku/result.rb`, `failure.rb`, `diagnostic.rb` — the result/trace
  shape six SDKs mirror. Diagnostics pass through with `code` + `args`
  untranslated; `Failure#step` is always the SDK's lifecycle step, never the
  engine's internal one.
- `lib/shojiku/artifact.rb` — bytes (always `ASCII-8BIT`), `page_count`
  (absent, not zero, on a signed artifact), `write`, `sign`, `verify`, and
  `origin` (`:rendered` / `:source` / `:loaded`) — the provenance the lockdown
  signs on, INHERITED through a signature so appending a revision cannot
  launder it. A boolean "was it loaded" is not enough: another client's
  bytes-first render has engine-made bytes and a caller's template.
- `lib/shojiku/verification_report.rb` — the four checks as separate fields
  plus `not_checked`, passed through on a FAILING verdict too.
- `lib/shojiku/external_signer.rb` — the SECOND signing provider, for a key
  this process is never given (cloud KMS, HSM, smartcard). A block receives
  the bytes to sign and returns the signature; the SDK ships no cloud client,
  so the block is whatever client the application already has. Both engine
  calls happen inside ONE method, which is what makes pairing a prepare of
  one document with a complete of another impossible from Ruby. The block's
  own exceptions are deliberately NOT rescued — a key-service outage is the
  caller's, not a fact about the document — while a block returning a
  non-String or an empty one is `UsageError`. The certificate takes the same
  explicit path-XOR-bytes rule `LocalPem` uses, and `#inspect` prints the
  form and the algorithm only. Decodes the payload with core
  `String#unpack1("m")` rather than the `base64` gem, keeping this SDK's
  runtime dependency list at fiddle alone. `sign_with(engine, pdf)` is the
  polymorphic hook BOTH providers implement, so `Client#sign` branches on
  nothing.
- **Every mirror now carries `ExternalSigner` too**, and the shape is the
  same in all seven: cert path XOR cert bytes, an algorithm named by that
  language's idiomatic enum whose VALUE is the wire spelling, a callable
  that signs, BOTH engine calls inside one method, a redacted printed form,
  and the callable's own failure passed through rather than filed as a
  document failure. Two things differ by transport and are worth reading
  before diffing: the five that link the library call
  `shojiku_sign_prepare`/`shojiku_sign_complete`, while php and go run the
  CLI's `sign-prepare`/`sign-complete` verbs and probe `cli.sign.external`
  first; and `.NET`/`java` narrowed their public provider interface to a
  MARKER (`ISigningProvider` / `SigningProvider`) with the hook on an
  internal one (`IEngineSigner` / `EngineSigner`), because the hook crosses
  types those packages keep internal.
- `lib/shojiku/local_pem.rb` + `errors.rb` — the signing provider (paths or
  bytes, explicit never sniffed in EITHER direction — both forms at once is a
  `UsageError` — with a redacting `#inspect`, since the default one prints the
  key and passphrase into consoles and exception reporters) and the small
  exception set: `UsageError`, `UnwrapError` (`Result#artifact!`/`report!`),
  `LibraryNotFound`, `AbiMismatch`, `MaterialUnreadable`. `errors.rb` also
  holds `Echo.bounded`, the one place caller-supplied text is stripped and
  capped before a message or a log line quotes it.
- `spec/` — RSpec against the REAL library; nothing at the boundary is
  mocked (the one exception is `outcome_spec.rb`, which builds `Snapshot`
  VALUES for the one case the library cannot produce: verify emits no
  diagnostics today, and the binding must still carry them). `spec/support/
  engine_fixtures.rb` wires the repo's own packs, runs `scripts/gen-test-keys.sh`
  (shared with the Rust suites), and builds inline template SOURCE for the
  bytes entrance (`source_template` / `text_item`; assets in
  `spec/fixtures/sources/`). Fixture templates under `spec/fixtures/templates/`:
  `receipt` (clean), `warns` (a box one line-height too short — the "succeeded
  WITH diagnostics" case), `broken` (an image with no `src`). `spec_helper.rb`
  resets `Shojiku.configure` after every example — it is process-wide state and
  the suite runs in a random order. SimpleCov `minimum_coverage 100`.
- `Dockerfile` + `Dockerfile.dockerignore` — the gate container. The sidecar
  ignore file REPLACES the root `.dockerignore` (which excludes `sdk`), and
  the engine library is COPYed in pre-built to `/opt/shojiku/lib` — outside
  `/repo`, or the gate's mount would hide it.
- Gates: `make verify:sdk:ruby` (rubocop + rspec at 100% + gem
  build/install), `test:sdk:ruby`, `lint:sdk:ruby`; `sdk-ruby` is in
  `make verify`. `make capi-lib` builds the host-arch cdylib into
  `dist/capi/local/` (gitignored) that every SDK image copies from.

## sdk/python — the first mirror of the reference

Loads the same `engine/capi` through **ctypes** (stdlib, so no build step for
a consumer and no C extension module — hence no abi3/interpreter-tag
coupling). Floor 3.11. Same bound lifecycle as ruby, and the same 21-module
split, deliberately: the frozen bar is "later stages diff their public surface
against ruby's shape", which a re-grouped package would make unreadable. Read
`sdk/ruby`'s map above for what each module MEANS — the notes below are only
where python differs.

- `src/` layout (so the packaging test imports the INSTALLED wheel, not the
  source tree) + `py.typed`. Module names match ruby's file-for-file:
  `client/settings/config/outcome/request/sources/lockdown/log/engine/library/
  template_root/env/result/failure/diagnostic/artifact/verification_report/
  local_pem/errors/version`.
- **Two recorded deviations, both spelling** (the contract is the
  PRECEDENCE, not the name — `docs/agents/sdk.md` § Per-language idiom): a per-call `lang=` argument replaces ruby's
  `with_lang` derived client — that is the frozen contract applied, since only
  Ruby's trailing-hash params forced the derived-client spelling — and
  `unwrap()` replaces `artifact!`/`report!`, with `artifact`/`report` staying
  as non-raising aliases. Exceptions carry PEP 8's Error suffix
  (`LibraryNotFoundError`, `AbiMismatchError`, `MaterialUnreadableError`).
- `engine.py` — the ctypes surface. `argtypes`/`restype` on EVERY function
  (the default `restype` is a C `int` and truncates returned pointers, the
  same class of bug fiddle's missing declarations cause). Engine-owned
  buffers are read as `c_void_p` + `c_size_t` and copied with
  `ctypes.string_at`, **never** typed `c_char_p` — ctypes would eagerly build
  a `bytes` and drop the pointer that still has to be freed. `Snapshot` is a
  frozen dataclass copied out before the handle is freed in a `finally`.
- `library.py` — same discovery order and the same 6 candidate names, but the
  packaged directory is located via `importlib.resources`, not path math from
  `__file__`. Opens with `ctypes.CDLL` (never `PyDLL`): CDLL releases the GIL
  around each call, which is what `test_concurrency.py` pins.
- `template_root.py` — same union-of-platforms rules, but containment uses
  `Path.resolve(strict=True)`: unlike ruby's `File.realpath`, a plain
  `resolve()` does NOT raise for a missing path, so a non-strict resolve would
  canonicalize a nonexistent template happily and fall through.
- `tests/` — pytest against the REAL library, 19 modules mirroring ruby's 19
  spec files (240 examples, 100% line coverage). `conftest.py` is the
  `spec_helper` + `engine_fixtures` equivalent; `keys` is session-scoped so the
  shared generator runs ONCE. Fixture templates are copies of ruby's
  (`receipt` clean / `warns` a box one line-height short / `broken` an image
  with no `src`). Hostile control characters in fixtures are written as python
  ESCAPES (`"pay\x00roll"`), never as raw bytes — a raw one makes the whole
  file binary-classified and silently absent from every `grep`. Every SDK
  writes them as escapes now, ruby included.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as ruby's (sidecar
  REPLACES the root ignore file; library COPYed to `/opt/shojiku/lib`, outside
  the `/repo` mount). Runs on the 3.11 FLOOR. The wheel is built and installed
  in a scratch dir with `PYTHONPATH` cleared, so the source tree cannot satisfy
  the import and pass a broken artifact.
- Gates: `make verify:sdk:python` (ruff format+check, mypy strict, pytest at
  100%, wheel build/install/import), `test:sdk:python`, `lint:sdk:python`;
  `sdk-python` is in `make verify`. Packaging is hatchling — pure python, with
  the prebuilt cdylib riding as package data in the platform wheels.

## sdk/dotnet — the .NET mirror

Loads the same `engine/capi`, but resolves entry points BY HAND
(`NativeLibrary.Load` + `GetExport`, held as `delegate* unmanaged[Cdecl]`)
rather than through `[LibraryImport]`: that attribute names its library at
COMPILE time and resolves it through one process-wide `DllImportResolver`,
which cannot express the frozen per-client precedence. TFM `net10.0` (the
floor). Same bound lifecycle and the same module split as ruby; read the ruby
map above for what each MEANS.

- `Shojiku/` — the library. One file per reference module, PascalCased:
  `ShojikuClient/Settings/Configuration/Outcome/Request/Sources/Lockdown/Log/
  Engine/Library/TemplateRoot/Env/Result/Failure/Diagnostic/DocumentArtifact/
  VerificationReport/LocalPem/Errors/Wire`. `Wire.cs` has no ruby counterpart:
  it is the one place a `JsonElement` is CLONED out of the `JsonDocument` that
  owns it, since an element outliving its document throws far from the mistake.
- **Async beside sync.** `GenerateAsync`/`GenerateSourceAsync`/`SignAsync`/
  `VerifyAsync`/`EngineInfoAsync`/`WriteAsync` over `Task.Run`, per the recorded
  deferral granting node and .NET an async surface; the blocking calls stay so a
  console app is not pushed through `.GetAwaiter().GetResult()`.
- `Engine.cs` — the boundary. `size_t` is `nuint` and success is `int32_t`,
  never `bool` (whose default marshalling is the 4-byte Win32 BOOL). `Snapshot`
  is a record copied out before `ResultHandle` (a `SafeHandle`) is disposed, so
  the finalizer is a back-stop rather than the release path. `Read` is internal
  rather than private so the blank-out-slot guard can be exercised.
- `Library.cs` — same discovery order and the same 6 candidate names; the
  packaged directory is probed both beside the assembly and at
  `runtimes/<rid>/native/`, because a published app flattens the second into the
  first. `RequireAbi` is split out from the call that feeds it so the REFUSAL is
  testable against a library that only ever reports revision 1.
- `TemplateRoot.cs` — same union-of-platforms rules, with `[GeneratedRegex]`
  source generators; containment checks existence explicitly and compares
  STRUCTURALLY (a sibling `root-evil` beats a prefix compare). `Canonical`
  TRIMS the trailing separator: .NET's `Path.GetFullPath` preserves one where
  the other six SDKs' realpath equivalents drop it, so a root written
  `templates/` used to contain nothing at all.
- `Shojiku.Tests/` — xunit against the REAL library, 20 suites / **231 tests**,
  100% line coverage. One xunit COLLECTION, so the process-wide `Configuration`
  cannot leak between tests and the key generator runs once. Generated code is
  excluded from coverage by attribute (the regex generator's state machine is
  the framework's, not this package's).
- `.editorconfig` — analyzers run at `All` with warnings-as-errors; every rule
  turned down is listed with the contract decision it argues against.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as the others, but the
  base is `mcr.microsoft.com/dotnet/sdk:10.0-noble`: **Microsoft ships no
  Debian-based .NET 10 image**, and glibc's backward compatibility makes a
  bookworm-built cdylib load on noble (only the reverse would fail).
- Gates: `make verify:sdk:dotnet` (`dotnet format --verify-no-changes`, xunit at
  100% via coverlet, `dotnet pack` in a scratch dir), `test:sdk:dotnet`,
  `lint:sdk:dotnet`; `sdk-dotnet` is in `make verify`. Zero package references —
  the transport is in the framework.

## sdk/java — the JVM mirror

Loads the same `engine/capi` through **JNA** interface mapping
(`Native.load(path, ShojikuLibrary.class)`, not `Native.register` direct
mapping — again for per-client paths). Floor 21, and JNA is the decided
transport precisely so it can stay there: the FFM API finalizes in 22. Same
bound lifecycle and module split as ruby.

- `src/main/java/jp/kengos/shojiku/` — one file per reference module, plus four
  with no ruby counterpart: `Json.java` (a hand-written reader/writer, so the
  runtime dependency list stays at ONE entry — Jackson in every application's
  classpath is a large cost for a handful of flat, append-only payloads),
  `SizeT`/`SizeTByReference` (**public because JNA instantiates argument types
  reflectively from its own package** — transport plumbing, not lifecycle
  surface), and `ShojikuLogger` (a one-method interface, so no logging
  dependency).
- **A BUILDER, not keywords.** `ShojikuClient.builder().templates(…).build()`
  and `LocalPem.builder()` — the ecosystem's answer to nine optional settings in
  a language with no keyword arguments. `Config` is a record with `with*`
  derivations, and it is both the defaults and the per-client overrides.
- **Synchronous**, with the five: rendering is CPU work with no I/O to overlap,
  and a JVM application that wants async has its own executor.
- `Engine.java` — the boundary. Nothing data-bearing crosses as `String` (JNA's
  String marshalling uses the PLATFORM charset, which is not UTF-8 on Windows);
  buffers cross as `byte[]` with an explicit `SizeT` length and are decoded with
  `StandardCharsets.UTF_8`. One handle in, one `shojiku_result_free` in a
  `finally`. `read` is package-private so the blank-out-slot guard is testable.
- `EngineLibrary.java` — same discovery order and the same 6 candidate names,
  probed as CLASSLOADER RESOURCES (`/native/<name>`) and materialized through
  JNA's resource extraction, which returns the file in place when the classpath
  entry is unpacked and a copy in JNA's own temp directory when it is inside a
  classifier jar. Resolving `native/` to a directory instead is the shape that
  cannot work: inside a jar it is a `jar:` URL naming no filesystem path.
  `packagedFrom` takes the loader as a parameter so a test can hand it a real
  jar; it and `requireAbi` are split out so their refusals can be exercised.
- `TemplateRoot.java` — same union-of-platforms rules; containment uses
  `toRealPath()` (which DOES raise for a missing path) and a structural
  parent walk.
- `src/test/java/` — JUnit 5 against the REAL library, 21 suites / **244
  tests**, 100% line coverage via jacoco. One surefire fork, tests serial, so
  process-wide `Configuration` cannot leak. Fixture templates are copies of
  ruby's; hostile control characters are written as Java ESCAPES
  (`"recei\0pt"`, `"recei\u001bpt"`), never as raw bytes.
- `pom.xml` — spotless (google-java-format), `-Xlint:all -Werror` (the
  sdk.md-sanctioned alternative to ErrorProne), jacoco `LINE COVEREDRATIO 1.0`,
  and the **sources + javadoc jars Maven Central requires**, produced by the
  ordinary build rather than a release profile. The javadoc plugin needs an
  explicit `<locale>`: without one it passes `-J-Duser.language=` with an EMPTY
  value in a bare container and javadoc refuses to start.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as the others. Its warm
  layer runs the WHOLE `verify` lifecycle once over a throwaway test, because
  `dependency:go-offline` does not fetch surefire's test-framework PROVIDER
  (surefire picks it at TEST time) and the gate runs `mvn -o`.
- Gates: `make verify:sdk:java` (`mvn -B -o verify`, which IS the full bar here
  — spotless, compiler lint, junit, jacoco, all three jars), `test:sdk:java`,
  `lint:sdk:java`; `sdk-java` is in `make verify`.

## sdk/js — the node mirror, and the only non-cdylib transport

Loads `engine/napi` (a native addon) rather than the shared cdylib: node has
no stdlib FFI. Floor 22, **ESM-only** (`"type": "module"`; dual CJS+ESM would
double the build and split the addon-loading path, and `require(esm)` is
unflagged from 22.12). Same bound lifecycle and the same 20-module split as
ruby — read `sdk/ruby`'s map above for what each module MEANS; the notes here
are only where node differs.

- `src/` + `dist/` (built by `tsc`; `files: ["dist"]`, so the tarball carries
  the built output and nothing else). Module names match ruby's file-for-file,
  camelCased: `artifact/client/config/diagnostic/engine/env/errors/failure/
  library/localPem/lockdown/log/outcome/request/result/settings/sources/
  templateRoot/verificationReport/version` + `index.ts`.
- **Async-only, and that is contract rather than idiom.** Every lifecycle call
  returns a Promise (the addon runs the work on the libuv threadpool); there
  are deliberately no `*Sync` twins, because blocking node's single event loop
  for the length of a render is the one thing this ecosystem cannot afford.
  .NET ships both only because a console app is a legitimate blocking caller.
- Spelling deviations, all precedented by the python mirror rather than new:
  predicates follow the adjective/participle-bare + noun-takes-`is` rule
  (`success`/`failed`/`passed`/`valid`/`loaded`/`strict`,
  `isError`/`isWarning`); `unwrap()` replaces `artifact!`/`report!` with
  `artifact`/`report` staying as the non-throwing aliases; a per-call `lang`
  option replaces ruby's `with_lang`; exceptions keep the `Error` suffix.
- `engine.ts` — the thinnest transport module of the five: pointer ownership,
  buffer lengths, freeing the handle and the panic shield all happen in Rust,
  inside the addon.
- `library.ts` — the same three-position discovery and the same REVERSE
  precedence, over `.node` files: `SHOJIKU_LIBRARY` → explicit config → the
  platform package (`@shojiku/<platform>-<arch>`, resolved through
  `createRequire`). `discover`/`packaged`/`requireAbi` are split OUT of the
  constructor so their refusals are testable — an addon linked against this
  engine can only ever report the revision it was built with.
  **The `optionalDependencies` block is NOT in the manifest yet**: the five
  platform packages are release-time artifacts, and depending on five
  unpublished names would make every gate run resolve 404s. The map here is
  the shipped contract and a test pins it.
- `templateRoot.ts` — the same union-of-platforms rules; containment uses
  `fs.realpath` (which DOES reject a missing path) plus a structural
  `path.relative` test, since a prefix compare is beaten by a sibling
  `root-evil`. Hostile control characters are written as ESCAPES in both the
  regex and the fixtures — a raw byte makes the file binary-classified and
  silently absent from every `grep`.
- **The lockfile is COMMITTED here, unlike ruby's** — and that is a
  difference between the package managers, not a change of mind. The
  reason `Gemfile.lock` is gitignored (a library's lockfile pinning its
  consumers' resolution) is true for Bundler and false for npm, which
  ignores a dependency's lockfile entirely. So `pnpm-lock.yaml` is
  committed and reviewed, which is also what turns the SBOM on for this
  package — `scripts/generate-sbom.sh` gates on a LOCKFILE, which is why
  `sdk/php` and `sdk/go` are correctly skipped and this one is not.
- **"Optional" means ABSENT, not unreadable — a recorded deviation from
  the reference.** Ruby probes `is_file?` before reading an optional
  `definitions.yml`, which reports a directory-where-a-file-belongs as
  absent and renders the document as though it declared no schema. Node
  branches on the ERRNO instead: only `ENOENT` is absence. That is both
  the faithful reading of the intent and the only version a gate
  container running as ROOT can actually test, since a `chmod` proves
  nothing there.
- `localPem.ts` — redacts through BOTH `toString()` and
  `util.inspect.custom`: node's console uses the latter and never calls the
  former, so overriding one leaves the key printing where it is most likely to
  be seen.
- `test/` — vitest against the REAL addon, 19 suites / **200 tests**, 100% on
  all four axes (lines/statements/functions/branches). Mirrors ruby's 18 spec
  files. `test/support/fixtures.ts` is the `spec_helper` + `engine_fixtures`
  equivalent; the key generator is memoized so it runs ONCE. Fixture templates
  are copies of ruby's (`receipt` clean / `warns` a box one line-height short
  / `broken` an image with no `src`). `fileParallelism: false` — the
  process-wide `configure` slot is shared state — and `testTimeout: 60_000`,
  because a render plus a signature against the real engine is several seconds.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as the others (sidecar
  REPLACES the root ignore file; the binary COPYed to `/opt/shojiku/lib`,
  outside the `/repo` mount), but the injected binary is the ADDON. Runs on
  the 22 FLOOR. Two mechanics it had to get right: the dependency store is
  linked in as a real `node_modules` at run time (ESM resolution does not
  consult `NODE_PATH`), and `verifyDepsBeforeRun: false` stops pnpm 11 trying
  to PURGE that linked store before every script.
- Gates: `make verify:sdk:js` (biome + tsc + vitest at 100% + pack/install of
  the real tarball into a scratch dir), `test:sdk:js`, `lint:sdk:js`,
  `sdk-js-format`; `sdk-js` and `napi` are both in `make verify`. `make napi`
  builds the host-arch addon into the gitignored `dist/napi/local/`, which is
  the image's source — the addon's `capi-lib` equivalent.

## sdk/php — the first SUBPROCESS mirror

(`sdk/go` is the second; its section is at the end of this file.)

Runs the `shojiku` CLI as a child process rather than loading a library: PECL
is source-first with no good prebuilt channel, so a pure-PHP package with no
build step is the better trade. Floor 8.3, `declare(strict_types=1)`
everywhere, **zero runtime dependencies** — the transport is `proc_open`,
which is the language itself. Same bound lifecycle and the same module split
as ruby; read `sdk/ruby`'s map above for what each module MEANS, and
`docs/agents/sdk.md` § Subprocess transport mechanics for the CLI contract
both subprocess SDKs script.

- `src/` PSR-4 (`Shojiku\`), one class per file. Names match ruby's
  file-for-file, PascalCased: `Client/Settings/Configuration/Outcome/Request/
  Sources/Lockdown/Log/Engine/Binary/TemplateRoot/Env/Result/Failure/
  Diagnostic/DocumentArtifact/VerificationReport/LocalPem/Version`, with
  `Binary` as the `Library` analogue (it finds a BINARY, not a cdylib).
  PSR-4's one-class-per-file rule splits what ruby keeps together:
  `Exception/*` (five exceptions + the marker interface they implement),
  `VerificationCheck`,
  `Origin`/`Step` (enums where ruby uses symbols), `Logger`, `Text` (`Echo`
  is a reserved word), `TemplateRejected`.
- **Two classes with no ruby counterpart, both transport-only**: `Workspace`
  — the per-call 0700 temporary directory, the ONLY place the package writes
  anything, created unguessably and removed on every path including the
  failing ones — and `Report`, which reads the `--report` sidecar. Everything
  the CLI must READ is materialized there 0600 (params always; the
  bytes-first template/definitions; PEM material handed over as bytes; the
  input PDF for sign/verify); a caller-supplied PATH crosses as itself.
- `Engine.php` — the ONE place a call leaves PHP. `proc_open` with an ARRAY
  command (no shell, so no quoting story), stdout and stderr drained TOGETHER
  by polling (select does not work on `proc_open` pipes on Windows), the PDF
  coming back on stdout via `--output -` so a rendered document never touches
  disk, stderr never parsed, and the child's environment composed by `Env` —
  which is how `env: false` reaches a process that would otherwise read
  `SHOJIKU_*` itself. `requireReport()` is the ABI check's counterpart: one
  `capabilities` call per binary, memoized, refusing an engine without
  `cli.report` by name rather than parsing prose. `started()` is public purely
  so the un-producible spawn refusal is testable.
- `Report.php` — bounded and defensive about a file it did not write: an 8 MiB
  read cap (one byte past it, to tell "at the cap" from "over"), a JSON depth
  cap, and type checks on every field. Anything that is not the envelope is an
  `EngineFailureException` — the third failure shape a subprocess has, distinct
  from the contract's two levels because nobody determined anything about the
  document.
- `TemplateRoot.php` — the same union-of-platforms rules, resolving to PATHS
  rather than bytes (the CLI reads files; a copy would only add a rewrite).
  `realpath()` returns FALSE rather than raising for a missing path, and
  containment is a structural parent test.
- `LocalPem.php` — the material lives in a private static `\WeakMap` keyed by
  the provider, not in properties: PHP has four dump functions and
  `__debugInfo()` covers one. Plus `__toString()` and `#[\SensitiveParameter]`
  (which is what keeps a constructor argument out of a stack trace).
- `tests/` — phpunit against the REAL binary, 20 suites / **213 tests**
  mirroring ruby's 19 spec files (`Concurrency` has no meaning for a
  single-threaded subprocess SDK and is replaced by `Workspace`; `Subprocess`
  is added for the transport's own failure modes), 100% line coverage. `EngineFixtures` is the
  `spec_helper` + `engine_fixtures` equivalent; `StubBinary` writes a shell
  script that stands in for the engine, for the "what if the thing on the
  other end is not what we think" cases only. Fixture templates are copies of
  ruby's; hostile control characters are written as PHP ESCAPES.
- `phpunit.xml` / `phpstan.neon` (level 9, nothing ignored under `src/`) /
  `.php-cs-fixer.dist.php` / `tools/coverage-gate.php` — the last because
  PHPUnit has no fail-under flag, so the 100% bar is asserted from the clover
  report by a script that lives outside the measured surface.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as the others, but the
  injected binary is the CLI (`/opt/shojiku/bin/shojiku`, `SHOJIKU_BIN`), and
  the gate toolchain (php-cs-fixer, phpstan, phpunit) is pinned as a global
  composer install rather than as `require-dev` — which is why the package has
  no `composer.lock` for the SBOM script to find.
- Gates: `make verify:sdk:php` (php-cs-fixer, phpstan, phpunit at 100%,
  `composer validate --strict`, and an install of the package from its own
  artifact through a `path` repository with packagist OFF), `test:sdk:php`,
  `lint:sdk:php`; `sdk-php` is in `make verify`. `make cli-bin` builds the
  host-arch binary into the gitignored `dist/cli/local/` — the subprocess
  transport's `capi-lib`.

## sdk/go — the second SUBPROCESS mirror, and the last stage

Runs the `shojiku` CLI as a child process, like php: cgo is avoided
deliberately, so a subprocess SDK needs no build at all and stays a pure-Go
module. Floor `go 1.25` (a MINIMUM, per Go's compatibility promise), **zero
dependencies — stdlib only**, which is also why there is no `go.sum`. Same
bound lifecycle and the same module split as ruby; read `sdk/ruby`'s map
above for what each module MEANS, `sdk/php`'s for the transport, and
`docs/agents/sdk.md` § Subprocess transport mechanics for the CLI contract
both subprocess SDKs script.

- ONE flat package (`package shojiku`) at the module root, so `./...` is that
  package alone and the coverage profile has nothing else in it. File names
  match php's classes: `client / settings / config / options / outcome /
  request / sources / lockdown / log / engine / binary / templateroot / env /
  result / failure / diagnostic / artifact / verification / localpem /
  report / workspace / errors / text / version`, plus `verify_options.go`
  (the anchor forms) and `doc.go` (the package's three-things-to-know
  preamble).
- **The lifecycle returns `(*Result, error)`** — the frozen two-level model
  in Go's vocabulary. `err != nil` is the caller's mistake or a transport
  that got no answer; a document the engine refused is `err == nil` with
  `Success() == false`. `errors.go` holds the five error types, each
  unwrapping to a class sentinel (`ErrUsage`, `ErrUnwrap`,
  `ErrBinaryNotFound`, `ErrIncompatibleEngine`, `ErrEngineFailure`) via the
  `Error` interface's `Class()`.
- `engine.go` — the ONE place a call leaves Go. `exec.CommandContext` with an
  argv SLICE (no shell), stdout and stderr drained concurrently by os/exec
  itself (which is why there is no poll loop here, unlike php), the PDF back
  on stdout via `--output -`, stderr never parsed, nil stdin, and the child's
  environment composed by `env.go`. `requireReport` is the ABI check's
  counterpart — one `capabilities` call per binary, MUTEX-guarded because a
  Go client is documented as safe for concurrent use.
- `workspace.go` — the per-call 0700 directory (`os.MkdirTemp`), files
  created 0600 with `O_EXCL`, removed on every path from a tracked list
  rather than recursively. Its `write` returns only a path and REMEMBERS the
  first failure; `engine.execute` checks `failed()` once, immediately before
  the child runs, which is what keeps a staging failure a host failure and
  what keeps six unreachable branches out of the call sites.
- `binary.go` — the three lookup positions, searching `PATH` by hand (
  `exec.LookPath` cannot be given an injected environment, so it could not
  prove them) and trying both `shojiku` and `shojiku.exe` at every entry.
  `executableOn(mode, windows)` takes the platform as a PARAMETER so the
  Windows half — where os.Stat reports no execute bits at all — is provable
  on Linux.
- `localpem.go` — material in unexported fields (already invisible to
  `encoding/json` and reflecting loggers) plus `String`, `GoString` and
  `MarshalJSON` on the VALUE receiver, because `fmt` prints unexported fields
  for `%v`, `%+v` and `%#v` alike. `Provider` is a closed interface whose
  method IS the lockdown resolution, so the name and value forms carry their
  own rules instead of a type switch.
- Tests are internal (`package shojiku`), one file per suite, run against the
  REAL binary except where the claim is "what if the thing on the other end
  is not what we think" — `fixtures_test.go` holds the shared client, the
  memoized rendered/signed documents, the shell-script stub and the recording
  logger. Fixture templates under `testdata/` are copies of ruby's.
- `Dockerfile` + `Dockerfile.dockerignore` — same shape as php's, same
  injected CLI binary (`/opt/shojiku/bin/shojiku`, `SHOJIKU_BIN`), with
  `golangci-lint` COPYed in from its own pinned image and the Go caches baked
  OUTSIDE `/repo` so the gate's mount cannot hide them. `.golangci.yml` is
  the standard set plus revive and misspell; gosec is deliberately off (G204
  fires on every subprocess with a variable argv, which is the package's
  whole job).
- Gates: `make verify:sdk:go` (gofmt, `go vet`, golangci-lint, `go test -race`
  at 100% STATEMENT coverage asserted by a shell step outside the module, and
  a build of the package from a scratch module through a `replace` directive
  with `GOPROXY=off`), `test:sdk:go`, `lint:sdk:go`; `sdk-go` is in
  `make verify`, over the same `make cli-bin` binary php uses.
