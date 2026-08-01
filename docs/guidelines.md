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
