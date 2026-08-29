# make_issues — gate detection gaps

> AI-and-human. This file is its own list because its entries come from
> a different place than planned work: not from planning at all, but
> from a gate that went red without saying why.

Anyone who hits one fills it in; whoever next works on the gate surface
drains it.

## How an entry gets here

A professional running a gate during a change is the only one who sees
these: the gate fails, its output does **not** identify the file, line
or cause, and you recover the answer some other way. **File it right
then** — this class is pre-authorised (no Pain/Cost/Value proposal
first), because the evidence is perishable: the log is overwritten on
the next run, and the cost of a wrong entry is one line.

Every ID is prefixed **`make_issue_`**, so the whole set is one grep
away — `grep -rn make_issue_ docs/` — including any that leak into
commit messages or PR bodies.

```
- [ ] `make_issue_<slug>` — **When**: <the gate, and what was broken>.
      **Not detected by**: <what you ran, and what it showed instead>.
      **Recovered by**: <what actually answered it>.
```

Not for this file: "the gate was slow", or a misread on your part. An
*environmental* trap — a flake, a stale Docker volume, a corrupted
target dir — is not a gate-output gap at all: `scripts/gate-diagnose.sh`
already names the common ones in the FAIL block, and
`make investigate:docker` / `investigate:gates` answer the rest. This
file is only for output that could not answer **which file / which line
/ which cause**.

## Open

- [ ] `make_issue_quiet_last_step_lags_the_failure` — **When**: `make
      quiet T=gui:test` (also `gui:test`) fails on the vitest COVERAGE
      thresholds. **Not detected by**: the wrapper's own summary, which
      reported `last step : == wasm build (size-budgeted) ==` and then
      printed a "where it broke" excerpt showing `raw=5197977 bytes
      gzip=2015702 bytes (budget raw<=8388608 gzip<=3145728)` — two
      numbers COMFORTABLY INSIDE their budget, presented as the failure.
      The wasm step had succeeded; the real failure was four ERROR lines
      about branch/line coverage much further down. A reader who trusts
      the excerpt starts debugging a wasm size budget that is fine.
      **Recovered by**: `grep "designer test:" .make-logs/last-error.log`
      and reading the `% Branch` column for the file under 100. The
      `last step` marker seems to record the last `== step ==` HEADING
      emitted rather than the step that actually exited non-zero, so any
      gate whose failure comes from a sub-command after the final heading
      is mis-attributed the same way.
      **Half fixed; the entry stays open.** The misleading wasm excerpt is
      gone — `gate-culprits.sh` emits its wasm section only when the log
      actually carries an `over budget` line, so a PASSING wasm step
      inside a compound gate no longer presents two in-budget numbers as
      the failure (reproduced against a committed real `wasm.log`, and
      re-checked both ways against it). What remains is the `last step`
      marker itself and the missing vitest COVERAGE matcher; neither can
      be closed without inducing the real gui coverage failure.

- [ ] `make_issue_biome_info_outranks_the_error` — **When**: `make
      gui:lint` fails on a real Biome FORMAT error while `gui/biome.json`
      also emits an informational diagnostic (today: its `$schema` pins
      2.5.5 while `package.json` floats `^2.5.6`, so every run carries a
      "configuration schema version does not match" info). **Not detected
      by**: the culprit extractor takes Biome's FIRST diagnostic block,
      and Biome prints the `i` info before the `×` error — so "where it
      broke" named `biome.json:2:14`, a file the change never touched,
      and said nothing about the file that actually failed.
      **Recovered by**: `grep -n "×" .make-logs/gui_lint.log`, which
      finds the real diagnostic ~20 lines further down. The fix is
      probably to rank `×` blocks above `i` blocks in the matcher rather
      than taking the first; note that a green run also prints "Found 1
      info", so the info cannot simply be treated as failure evidence.
      **A worse variant of the same defect, seen since**: the extractor
      does not check whether Biome FAILED AT ALL. A `gui:verify` run whose
      only failure was one vitest case still printed
      `REMEDY — biome findings … make gui:format` and named a
      `lint/style/useTemplate` info in a file the change never touched —
      while Biome's own footer said `Found 1 info.` and it had exited 0.
      A reader following that REMEDY runs a formatter over a red test. So
      the ranking fix is not enough on its own: the matcher has to
      establish that a tool actually failed before offering its remedy,
      and Biome's footer (`Found N error` present vs absent) is the
      available signal. Both halves were caught the same way —
      `grep "Found .* error"` on the full log.
      *(Separately worth someone's deliberate one-liner: bump that
      `$schema` to match the declared dependency and the info disappears.
      Left out of the cycle that found it — an unrelated file.)*
- [ ] `make_issue_trivy_no_package` — **When**: `make docker:scan` fails
      on a fixable CVE. **Not detected by**: no matcher; Trivy's summary
      line carries only a count and its table is too wide for the tail.
      **Recovered by**: reading the table rows in `.make-logs/docker_scan.log`.
      *(Left open on purpose: the other four in this drain were closed
      against real induced failures, and a fixable CVE cannot be induced
      on demand — a matcher written against an imagined table format
      would be exactly the read-the-regex mistake below. Capture the log
      next time this fires naturally, then close it the same way.)*

## Shipped

- [x] `make_issue_coverage_reports_stale_lines_on_a_build_failure` —
      coverage-why.sh reprinted the PREVIOUS run's uncovered list when a
      test failed to COMPILE (no fresh lcov written). Fixed by `rm -f
      lcov.info` at the top of the `engine:coverage` recipe, so a no-report
      failure is distinguishable from a stale report, plus a
      coverage-why.sh message for the missing-file case that points at
      the rustc error in the gate log. Validated by planting a
      fake stale lcov, inducing a real type error, and confirming the
      ghost lines never appeared.
- [x] `make_issue_examples_check_no_diff` — matcher added: the
      `MISMATCH examples/...` lines render-examples.sh already prints
      now reach `last-error.log`. Validated by corrupting a committed
      preview PNG and running the gate.
- [x] `make_issue_wasm_budget_no_delta` — matcher added for the size
      line + the over-budget verdict. Two fixes rode along: `engine:wasm`
      moved ahead of `engine:coverage` in `make verify` (a budget crossing no
      longer costs the most expensive step to discover; it stays after
      `engine:lint` because it is a full wasm32 build, not a lint), and the
      matcher matches the size line WITHOUT its `wasm size: ` prefix —
      the pnpm-prefix normaliser eats it, found only because the
      matcher was validated against the real log.
- [x] `make_issue_deny_no_crate` — matcher added, as an awk block
      extractor rather than a line grep: warning blocks
      (multiple-versions duplicates) carry the same `┌─`/`├ crate` line
      shapes as error blocks and would flood any line pattern. Takes
      every line from an `error[` header to the next block header.
      Validated by temporarily banning `serde`.
- [x] `make_issue_coverage_names_nothing` — `cargo llvm-cov` prints
      NOTHING when it trips `--fail-under-lines`, so a coverage failure
      named no file at all. Fixed by `scripts/coverage-why.sh` +
      `make engine:coverage-why`, auto-run when `engine:coverage` fails.
- [x] `make_issue_vitest_prefix_defeats_matcher` — the first culprit
      extractor matched nothing on a real Vitest failure: `pnpm -r`
      prefixes every line with `<package> <script>: ` and wraps it in
      ANSI colour. Fixed by normalising the log before matching — and it
      is why a matcher must be tested against a REAL failing log, never
      by reading the regex.
