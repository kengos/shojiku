# Rust engine traps (`engine/`)

> AI-only. Standards live in `shojiku-rust-professional`; Docker/make
> execution traps in [docker-make.md](docker-make.md); coverage-gate
> diagnosis in the `shojiku-coverage` skill.

## Parsing / diagnostics

- **`serde_path_to_error` truncates at internally-tagged enum
  boundaries**: it gives a structural parse error the field PATH + (via
  serde_yaml) the line/column — but only for plain structs. serde
  buffers a `#[serde(tag = "type")]` enum's content (the template's
  `Body`/`Item`) into an intermediate value and re-deserializes it, so
  an error INSIDE a body item truncates the path to the enum boundary
  (`sections.body`) and the reported line points at the buffered
  container's start, NOT the offending key. The serde message still
  names the bad key + expected fields. Don't design a diagnostic that
  promises an exact line for item-internal errors; verify the actual
  path/line with a probe (a throwaway `examples/*.rs` that prints the
  error) before writing assertions.
- **A hostile-input test needs a POSITIVE CONTROL proving the payload
  reaches the surface under test.** An echo-bounding suite planted a
  unique marker in hostile templates/params and asserted the stderr came
  back short and control-free — both assertions passed while the marker
  never appeared at all, because three separate facts made the fixtures
  unreachable, and each had to be measured rather than assumed:
  **(a)** `serde_yaml`/`serde_json` *syntax* errors report POSITIONS
  ("could not find expected ':' at line 2 column 5043") and never quote
  the offending text, so a malformed document proves nothing about
  echoing — what gets quoted is an unknown/mistyped KEY, i.e. the
  located path; **(b)** YAML refuses a simple key past 1024 characters,
  so an over-long key is a syntax error, not an unknown-field error
  (300 is a usable hostile length); **(c)** both parsers reject a RAW
  control byte in source text ("control characters are not allowed"), so
  the reachable injection is a well-formed document whose *decoded*
  scalar carries the escape (`"\e[2J…"` in YAML, `` in JSON) — a
  raw byte tests the parser, not the echo. The suite only became real
  once a third test asserted the marker DOES come back (bounded and
  sanitized, but present); without it, a change that stopped echoing
  entirely would look identical to a change that fixed the bound.
- **`thiserror` treats a field literally named `source` as the error
  source**, so retyping it to something that is not an `Error` fails
  with `the method as_dyn_error exists ... but its trait bounds were not
  satisfied` — which reads as a trait-import problem, not a naming one.
  Rename the field (`detail` when it now holds a rendered message, which
  is usually more honest anyway) rather than hunting the bound.

## Scripted edits over source

- **In a file SPLIT, do the destructive write LAST.** The natural order —
  rewrite the parent to drop the moved block and add `mod <child>;`, then
  write the child — loses the block outright if the child's directory does
  not exist yet, because the parent has already been truncated and the
  moved text lives only in the dead script variable. It cost two
  reconstructions in one cycle (the second recoverable only because the
  generating script was still on disk). `mkdir -p` the child directory and
  write the child FIRST, then edit the parent; or hold the split in one
  script that writes both before touching either.
- **A split that moves an `use` out of the parent breaks the parent's
  TEST module, and only `--all-targets` says so.** A `#[cfg(test)] mod
  tests;` sibling reaches its fixtures' types through `use super::*`, so
  it silently depends on whatever the parent imported — move
  `std::path::Path` into the new child alongside the function that
  wanted it and the library still compiles clean while
  `cargo clippy --all-targets` dies in the test file with
  `cannot find type Path in this scope`, pointing at a line the split
  never touched. After any split, re-run `make lint:<scope>` (which is
  `--all-targets`) rather than trusting a build, and check the parent's
  test module for names it was borrowing.
- **Scripted source edits must assert their anchor matched AND is
  unique**: a python `str.replace` whose anchor drifts silently no-ops
  (a test that was never written cost a full coverage round), and an
  anchor that matches TWICE rewrites the FIRST hit (an edit meant for a
  new test flipped an older test's expectations). `assert old in s` AND
  `assert s.count(old) == 1` before replacing. A REGEX edit needs the
  same care about SPAN: appending an argument via
  `assign_cells\(([^;]*?)\)` stops at the FIRST `)` — an inner helper
  call's — and inserts inside it; anchor call-argument edits to the
  statement terminator (`);`), or edit line-wise.
- **Rust that did not come out of a formatting editor fails fmt almost
  every time**, and the trigger is not "script-generated" — a two-test
  `cat >>` append is enough, because rustfmt wraps a long string literal
  in a struct field differently than a human would. Run `make fmt-fix`
  immediately after ANY heredoc/append/string-edit that produces Rust,
  BEFORE `make verify` — otherwise the verify run burns ~10 minutes to
  die at its first gate. **A batch of NEW test files earns one
  `make clippy` before the first verify**: fmt/budget don't catch test
  lints (`useless_format`, `assert_eq!(x, true)`), and verify dies at
  its clippy gate two jobs in.

## Assertions on types that deliberately lack `Debug`

- **`expect_err` needs the OK type to be `Debug`; a type kept
  un-`Debug` on purpose cannot use it.** Key material, prepared
  documents and anything else deliberately non-printable fails to
  compile with `expect_err`, and the fix is `.err().expect(…)`.
  Clippy's `err_expect` will NOT fight you there — it only fires when
  `expect_err` is actually available — so the two forms coexist in one
  crate for a real reason, and "some tests use the other one" is not
  an inconsistency to clean up.

## Panic payloads (recovering what a panic said)

- **`&Box<dyn Any>` UNSIZES before it derefs, so the downcast sees the
  Box.** Handing a `catch_unwind` payload to a
  `fn(&(dyn Any + Send))` as `&payload` compiles, runs, and silently
  fails every `downcast_ref::<&str>()` / `::<String>()` — the unsizing
  coercion wins over the deref coercion, so the concrete type is
  `Box<dyn Any + Send>` and the message is lost. Write `&*payload`.
  A shield that only asserts the STATUS passes either way; the test has
  to assert the recovered message.
- **`panic!("a {} payload", "literal")` produces a `&str`, not a
  `String`.** With no runtime argument the format folds to one literal
  piece, `Arguments::as_str()` answers `Some`, and the panic runtime
  takes the `&str` path — so a test written that way exercises the
  `&str` branch twice and leaves the `String` branch unproven while
  reading as if it covered both. Compute the argument at runtime
  (`let word = String::from("x"); panic!("a {word} payload")`).

## Tests over real documents

- **A locator that greps PDF bytes for a key must anchor on something
  only the structure it means carries.** A signing helper searched for
  `/Contents ` to find the signature window; in every real rendered
  document that hits a PAGE's content stream first, and the synthetic
  fixtures had no content streams, so the unit tests passed and the
  first e2e over a committed `examples/*/output.pdf` failed with a
  byte-comparison mismatch. Anchor on a key unique to the target
  (`/ByteRange` for a signature dictionary) and search forward from
  there — and expect a synthetic fixture to hide exactly this class,
  which is what the near-e2e suites over real output exist to catch.

## Designing against externals

- Verify a third-party API — or an external *asset capability* — exists
  BEFORE designing around it. For a crate API, grep the vendored source
  in the cargo cache volume (no network): `docker run --rm -v
  shojiku-cargo:/usr/local/cargo rust:… sh -c 'grep -rn "pub fn <name>"
  /usr/local/cargo/registry/src/*/<crate>-*/src/'`. The same rule covers
  data the design rides on: the half-width-punctuation plan assumed the fonts' OpenType
  `chws`/`halt` features were present; a 60-second probe showed no
  bundled face has `chws`, forcing a mid-implementation pivot to
  engine-synthesized trimming. Probe the actual asset in Phase A.
- **The ISO 32000 (PDF) primary spec exceeds the fetch tool's size
  limit and mirrors 403/timeout** — for signing/verify work, probe spec
  points via the vendored `pdf-writer`/`krilla` sources in the cargo
  cache volume (they encode the xref/trailer byte formats exactly) plus
  a reference implementation for semantics (pyHanko's
  `pdf_byterange.py` settled the ByteRange-includes-the-delimiters
  question), and cross-check against targeted searches quoting the
  spec's own sentences. Worked first try where three direct fetches of
  the spec failed.
- **Implementing to an external spec table (CSS, Unicode, CLDR): fetch
  the primary source; never transcribe from memory or the plan's
  sketch.** A kinsoku-class implementation shipped from the plan's
  from-memory sketch: two CSS `line-break` classes came out wrong and a
  third was missing, surviving every gate (the tests pinned the same
  wrong sets); a border-radius clamp repeated it (the plan sketched
  "cap per axis" where CSS §5.5 scales BOTH radii by ONE factor). The
  same holds for a doc comment claiming parity with another IN-REPO path
  ("mirrors the filesystem resolver"): pin the claim with the same edge
  inputs on BOTH paths — duplicate list entries especially, since a
  mirror that CONSUMES its input (`map.remove` per entry) diverges from
  a re-read-based original exactly there.

## Native addons (napi-rs)

- **`default-features = false` on `napi` produces an addon that LINKS, that
  `dlopen`s, and that then fails at `require()` with `Error: Module did not
  self-register`.** The defaults are `napi4` + `dyn-symbols`, and the module
  registration goes with them — so the failure appears at the very last step,
  in node, with nothing in the Rust build to suggest a cause. Keep the
  defaults. (Isolated against the other suspect: a PRIVATE `mod shim` holding
  the `#[napi]` items registers fine.)
- The `#[napi]` items are dead code to a `--all-targets` build unless the
  module holding them is `pub` — `clippy -D warnings` fails on the lib-test
  target while the cdylib builds clean, because the ctor registration that
  references them is not a Rust-visible use.

## Fan-out traps

- **Adding a field to a struct breaks every LITERAL constructor of it,
  including test fixtures in OTHER crates** — and those don't compile
  until the test build, so a targeted `cargo test -p <crate>` stays
  green while `make verify` reds on a downstream fixture. In Phase A,
  `grep -rn '<StructName> {' engine/` (spread `..` forms survive; bare
  literals don't) and add the field to every hit.
- **A new wire type needs the full re-export chain**: core's top-level
  modules are crate-private — a `pub use` inside `template.rs` alone
  leaves the type unreachable from dependent crates AND fires
  `unused_import` on that very `pub use`. Add it to
  `core/src/lib.rs`'s `pub use template::{...}` in the same edit; same
  pattern for `shojiku-layout` tree types (`layout/src/lib.rs`).
- Growing a wire struct can trip workspace clippy lints at a distance: a
  fatter item struct fires `large_enum_variant` on `Item` (box the
  variant — `Item::Table(Box<TableItem>)` is precedent), and threading
  its new knobs through a walk fires `too_many_arguments` (threshold 7)
  — bundle per-walk invariants into a context struct (`TableFrame`,
  `Ctx` are the idiom).
- **A leaf item's atom may be constructed in SEVERAL placement walks,
  not one.** Before extending how an item renders, grep `Item::<Kind>`
  across `engine/` — `line` was built inline in the absolute-body, band,
  and container walks besides its `line_atom`, so a stroke-pattern
  change compiled green while three of four placements silently ignored
  it. Consolidate the construction through the one atom fn first.
- **Text-path changes fan out across a dual path + both renderers**:
  plain (`engine/text/block.rs`) and rich (`engine/text/rich*`)
  duplicate measurement/overflow/height logic, and each renderer
  independently rebuilds shaping `RunOptions` (`render-pdf/src/text.rs`,
  `render-png/src/paint/text.rs`; `line_start` = first run of a line).
  A spacing/trim/wrap change that compiles after touching one site is
  NOT done — grep `RunOptions` and check both text paths and both
  renderers.
- **Refactoring a pipeline: gate/stage ORDER is observable behavior.**
  Which error wins when two inputs are broken at once is part of the
  surface — moving resource acquisition (fonts, packs, files) ahead of a
  validation gate makes an environment error mask the user's own input
  errors. Walk each adjacent (gate, acquisition) pair and keep the
  original precedence — or state the deviation in the PR. Happy-path
  proofs (examples byte-compare, existing tests) do NOT pin this.

## Measurement / layout

- **A measure pass that sizes a definite box for a later render must use
  the WRAP-ESTIMATE basis, not the drawn extent**: the wrapper breaks on
  per-char estimates; any effect that makes the shaped/drawn extent
  SMALLER than that estimate sum (half-width punctuation trimming) makes a drawn-extent
  measure under-size the box and the render pass re-wraps what "was
  measured to fit" (a trimmed vertical table cell split its column).
  Measure with the untrimmed estimate-consistent options (the safe upper
  bound — the rule `engine/text/overflow.rs`'s header states) and pin it
  with a measured-row-never-re-wraps test.

## Fixtures

- YAML test fixtures with color literals: `"#rrggbb"` inside an
  `r#"…"#` raw string terminates the string at `"#` — use `r##"…"##`
  for any fixture containing colors (the repo already does).
- Tests locate repo fixtures via
  `PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packs")` (or
  `../../examples`); keep that pattern.
