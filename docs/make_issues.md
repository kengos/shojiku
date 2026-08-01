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
target dir — goes to
[agents/gotchas/docker-make.md](agents/gotchas/docker-make.md) instead.
This file is only for output that could not answer **which file / which
line / which cause**.

## Open

- [ ] `make_issue_trivy_no_package` — **When**: `make docker-scan` fails
      on a fixable CVE. **Not detected by**: no matcher; Trivy's summary
      line carries only a count and its table is too wide for the tail.
      **Recovered by**: reading the table rows in `.make-logs/docker.log`.
      *(Left open on purpose: the other four in this drain were closed
      against real induced failures, and a fixable CVE cannot be induced
      on demand — a matcher written against an imagined table format
      would be exactly the read-the-regex mistake below. Capture the log
      next time this fires naturally, then close it the same way.)*

## Shipped

- [x] `make_issue_coverage_reports_stale_lines_on_a_build_failure` —
      coverage-why.sh reprinted the PREVIOUS run's uncovered list when a
      test failed to COMPILE (no fresh lcov written). Fixed by `rm -f
      lcov.info` at the top of the `coverage` recipe, so a no-report
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
      line + the over-budget verdict. Two fixes rode along: `wasm`
      moved ahead of `coverage` in `make verify` (a budget crossing no
      longer costs the most expensive step to discover; it stays after
      `rust` because it is a full wasm32 build, not a lint), and the
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
      `make coverage-why`, auto-run when `coverage` fails.
- [x] `make_issue_vitest_prefix_defeats_matcher` — the first culprit
      extractor matched nothing on a real Vitest failure: `pnpm -r`
      prefixes every line with `<package> <script>: ` and wraps it in
      ANSI colour. Fixed by normalising the log before matching — and it
      is why a matcher must be tested against a REAL failing log, never
      by reading the regex.
