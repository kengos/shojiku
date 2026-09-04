# Engineering Guidelines

> **Audience: contributors** (human or AI) working on the codebase.
> Template authors and integrators don't need this page.

These rules apply across every component in the repo. They exist so that
"lint" and "test coverage" mean the same thing everywhere, regardless of
which language a given piece is written in. Component-specific
`agents/*.md` docs reference this file instead of restating it.

## Formatting and style: owned by the linter, not by docs or review

- Do not hand-enforce formatting or style in code review beyond what the
  language's standard formatter/linter already checks automatically. If a
  tool's default output looks wrong, fix the tool's config file — don't
  patch around it in review comments, and don't add a parallel style rule
  in a doc.
- Use each language's community-standard toolchain, at or near its default
  rule set:

  | Language | Formatting / lint |
  | --- | --- |
  | Rust | `rustfmt` (format) + `clippy` (lint) |
  | TypeScript / JavaScript | `eslint` + `prettier` (or Biome as a single replacement for both — never run both stacks in the same package) |
  | Ruby | `rubocop` (covers both style and lint) |
  | Python | `ruff format` + `ruff check` (replaces black/isort/flake8) |
  | Go | `gofmt` / `goimports` + `golangci-lint` |
  | PHP | `php-cs-fixer` (or PSR-12 via `phpcs`) + `phpstan` |

- Any deviation from a linter's default rule set must be justified with a
  comment inside that linter's own config file (`.rubocop.yml`,
  `clippy.toml`, `.eslintrc`, etc.), not documented elsewhere.

## File length: a signal about the design, not a filing quota

Every component caps how long a source file may be, and the cap is there for
two reasons rather than one.

The first is that an over-long file gets read wrong — by a person skimming it,
and more sharply by an AI, which reads an excerpt and generalises from it. A
file whose behaviour is decided near its end is summarised from its beginning.
Splitting is what makes the excerpt representative of the whole.

The second is the reason `rubocop` ships `Metrics/ClassLength` and Biome ships
`noExcessiveLinesPerFunction`: length is a smell. A file that keeps growing is
usually one that has quietly taken on a second job.

Both reasons are about the design rather than the arithmetic, so:

- **Seams are chosen for cohesion, and the cap always wins over both.** When a
  genuinely cohesive unit will not fit, the implementation is threading too
  much through one place. The fix is that design — never a waiver, and never a
  raised cap.
- **Never shave comments, blank lines or neighbouring tests to squeeze
  under.** That satisfies the number and defeats both reasons for it. Split
  first, then measure.
- **Mirror the shape the surrounding code already uses** instead of inventing a
  decomposition per file. In `engine/`, that is a directory module — a `foo.rs`
  root keeping the shared state and types, plus `foo/<concern>.rs`, no
  `mod.rs` (precedent: `geometry.rs` to `geometry/box_model.rs`). In `gui/`, it
  is the package's own composer + render tree + `props.ts`, and the nesting
  context object that keeps a cohesive unit from having to thread its
  arguments.

| Scope | Per file | Per function | Gate |
| --- | --- | --- | --- |
| `engine/**` `.rs` | ≤300 lines; ≤160 is the design target for a NEW file, and is not gated | `clippy::too_many_lines`, 150 | `make engine:budget` |
| `gui/**` `.ts` `.tsx` | ≤150 executable lines (blank lines and comments excluded, so documenting a file costs no budget) | Biome `noExcessiveLinesPerFunction`, 150 | `make gui:budget` |

Exceeding a per-file cap needs an in-file `line-budget-exempt: <reason>` with a
real reason; the standing ones are data tables, not logic.

**Test files are out of scope on both sides.** A test file is a list of
independent cases rather than a unit of design: neither reason above reaches
it, and splitting a suite to fit a number moves cases across a seam chosen by
arithmetic. What keeps a suite navigable is the next rule, and it is not a
length.

## Where tests live, and what says which code they cover

A suite that has been split has to say what it covers, because nothing else
will: a reader arriving at one test file cannot see the module it was carved
out of. Three rules do that, and the third carries the weight.

- **Unit tests live in a sibling file, not inline.** In Rust that is
  `#[cfg(test)] mod tests;` beside the module (`foo/tests.rs`), not the Book's
  inline `mod tests { … }`; in TypeScript it is the `.test.ts` beside the
  source. A sibling keeps the tests out of the file's length budget and gives
  the suite a path of its own to be found by.
- **When a suite grows, the DIRECTORY names the target and the FILE names the
  aspect.** `authoring/src/formats/tests/goldens.rs` is the golden-output tests
  for the `formats` module; `render-png/src/tests/gradients.rs` is what the PNG
  backend does with gradients. A file may take a source file's own name when it
  covers exactly that file and nothing else — but that is a coincidence worth
  having, not a requirement. Most modules are tested from more angles than they
  have source files, so forcing a one-to-one name either collides (three suites
  covering one module cannot share its name) or invents one (`render-png`'s six
  source files do not become the thirteen its suites need), and in both cases it
  throws away what the name was telling you.
- **A module with a second test module but no `tests/` directory writes it as
  `<mod>/<aspect>_tests.rs`**, beside `<mod>/tests.rs` — the same idea without
  the directory. Fourteen engine files use it, and both length gates exempt the
  name.
- **Every split suite's `//!` header says what it covers, in the terms the
  suite is actually written in.** This is the rule that does the work, and the
  terms matter. Most suites here drive a module's public entry point, so what
  they cover is a BEHAVIOUR — "form-mark validation: the checked-times-data
  conflict, key existence" — and the module's internal file split has no
  counterpart at all in them. Naming a source file in such a header would be
  inventing a correspondence rather than recording one. Name a source module
  only when the suite really is scoped to one, and otherwise say the behaviour;
  the first line of the file is what a reader arriving cold actually has.

Do not chase a one-to-one file mapping between a module's sources and its
suites. It is unavailable where the tests are behavioural, it collides where
one module is tested from more angles than it has files, and buying it costs
the thing the names are carrying now.

Near-e2e suites (public API only) are a different thing and live where the
language puts them — in Rust, the crate's own `tests/` directory as a single
binary.

## Test coverage: 100% in CI wherever a coverage tool exists

Every component wires automated coverage measurement into CI, and CI fails
the build if coverage drops below 100%. This is the default target, not an
aspiration — don't lower the threshold to make CI green.

| Language / area | Tool | CI gate |
| --- | --- | --- |
| Rust (`engine/`, Rust plugins) | `cargo-llvm-cov` | `cargo llvm-cov --workspace --fail-under-lines 100` |
| TypeScript/JS (`gui/`, `sdk/js`) | Vitest built-in coverage (v8) | `vitest run --coverage` with `thresholds` set to `100` in `vitest.config.ts` |
| Python (`sdk/python`) | pytest-cov | `pytest --cov --cov-fail-under=100` |
| Ruby (`sdk/ruby`) | SimpleCov | `minimum_coverage 100` in `.simplecov`; build fails if unmet |
| C# (`sdk/dotnet`) | Coverlet | `dotnet test /p:CollectCoverage=true /p:Threshold=100 /p:ThresholdType=line`; fails the build natively |
| PHP (`sdk/php`) | PHPUnit + Xdebug/PCOV | `phpunit --coverage-clover=coverage.xml`, then a CI step asserting the clover report shows 100% line coverage (PHPUnit itself has no native fail-under flag) |
| Java (`sdk/java`) | JaCoCo | a `jacoco:check` rule with `LINE` / `COVEREDRATIO` at 1.0; fails the build natively |
| Go (`sdk/go`) | `go test -cover` + a threshold-checking step | `go test ./... -race -coverprofile=cover.out`, then `go tool cover -func` piped through awk asserting the total is 100% (Go has no native fail-under flag; a shell step also keeps the asserting code out of the surface it measures) |

### Exclusions

- Truly unreachable code (a compiler-mandated `match` arm that can't
  occur, an `unreachable!()`) may be excluded using the tool's official
  exclusion marker (a `// LCOV_EXCL_LINE` equivalent for the language in
  use). Every exclusion must carry an inline comment explaining *why*
  it's unreachable. **Rust note**: `#[coverage(off)]` is still unstable
  on our pinned toolchain, so in `engine/` the working playbook is to
  delete provably dead branches or restructure the code instead (see the
  shojiku-test-professional skill).
- Never exclude a whole file or module just to make the number work.
- 100% line coverage is necessary, not sufficient — it proves a line ran,
  not that the test asserts the right thing. Reviewers still check that
  new tests actually verify behavior, not just execute code paths.

## Where this applies

Every `agents/*.md` policy's "Mandatory lint/test gates" section defers to
this document for the general formatting and coverage rules, and adds only
what's specific to that component (which snapshot/golden tests are
required, which contract tests apply, etc.).
