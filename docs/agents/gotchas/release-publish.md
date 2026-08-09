# Gotchas — releasing and publishing (registries, version literals, proofs)

> AI-only. The standards — which registry uses which credential, the
> ordered release procedure, the checklist — live in the
> `shojiku-release-engineer` skill. This file is the failure catalog:
> the ways a release run reports success while the version you are
> shipping is not the version anything measured.
>
> The through-line: **during a version bump, every check is about a
> VERSION, and every check that forgets to say which version passes on
> the strength of the PREVIOUS release.**

## An existence probe must carry the discriminator the change is about

The crates job asked `crates.io/api/v1/crates/<name>` — a crate-LEVEL
URL that answers 200 for anything that has ever published. On a version
bump every one of the 16 members therefore looked "already up", so the
job skipped all of them, its final arbiter agreed, and **the run
reported success having published nothing**. Fixed by probing
`crates/<name>/<version>`, with the version read from `cargo metadata`
rather than retyped.

The v0.1.0 lesson was already written down — *ask the registry, not
cargo* — and it was followed. The bug was asking the registry the WRONG
QUESTION, which no amount of "use the registry as arbiter" prevents.

- Generalize it: **an existence check is only evidence about the
  dimension it names.** A release changes a version, so every probe in
  the path — skip probe, retry guard, final arbiter — must be keyed on
  the version. The same shape waits in anything asking "is the image
  there?" (tag, not repository), "is the tag pushed?" (this tag, not
  any), "did the docs update?" (this sentence, not the page).
- **Take the discriminator from the source of truth, never retype it.**
  A hand-written `0.2.0` in a probe is a fourth place the version lives
  (see below) and it fails OPEN: a stale literal makes the probe ask
  about the last release, which is exactly the state that already
  passes.
- **A skip path needs the same scrutiny as a failure path.** "Already
  published — skipping" reads like good news in a log and is the one
  branch that produces a green run with no work done. When reviewing a
  publish log, count the skips against expectation before reading the
  final line.

## `proof-published-*` take LATEST by default — a bare run certifies the OLD release

`make proof-published[-<lang>]` asks the REGISTRY copy to render
`receipt-ja` in a clean container. Run bare, the scripts install
whatever the registry calls latest; `SHOJIKU_VERSION=x.y.z` is what pins
one. So during the v0.2.0 run six of them went green against 0.1.0 —
true statements, about the previous release, in a log that reads as
proof of this one.

- **Always run them pinned**: `SHOJIKU_VERSION=<the version you are
  shipping> gmake -C <tree> proof-published`. An unpinned green during a
  release is not a weaker claim, it is a claim about a different subject.
- The tell is not in the PASS line. It is in the install step's own
  output naming the version — read that, or pin and stop reading.
- `published-java.sh` is the exception that proves the rule: it
  hardcodes a default (`${SHOJIKU_VERSION:-<version>}`), so it fails
  loudly on a bump instead of quietly certifying the old release — and
  that is how the stale literals below were found at all.

## Version literals live in more places than the Versioning list

The skill's Versioning section names `[workspace.package]` plus the
seven SDK version files. That list is not the whole set, and the extras
are exactly the ones nothing derives:

- `engine/wasm/Cargo.toml`'s path-dep pin (`shojiku-authoring = { path
  = "…", version = "x.y.z" }`) — it resolves outside the workspace
  default, and `make lock` is what catches it.
- `.github/workflows/publish-packages.yml` — four literals in the
  gem/npm/maven push steps. Stale, they push files that do not exist.
- `scripts/release/assemble.sh` — the assembly `publish-packages`
  actually consumes.
- `scripts/install-proof/java.sh`, `js.sh`, `published-java.sh`.
- `sdk/java/README.md`'s install snippets (six of them) and the other
  install commands in the READMEs and tutorials, en and ja.

A first sweep that covered the tracked docs and the workflow file still
left the four `scripts/` sites, and only CI's java proof — looking for
`shojiku-0.1.0.jar` — found them, one PR later.

**Recovery, and the check worth running before calling a bump done:
grep the PREVIOUS version across the tree.** After bumping, the old
number should survive only in `CHANGELOG.md`, in prose that is genuinely
about history, and in lockfile/SBOM records of published artifacts. Any
other hit is a bug. That single grep finds every site above at once, and
it does not care whether the Versioning list is complete.

## Maven Central: two steps the procedure does not run for you

The Portal validates ASYNCHRONOUSLY and publishes nothing on its own.

- **A human clicks Publish in the Portal.** The workflow's green means
  the deployment was accepted for validation, not that anything is
  public. Until the click, `jp.kengos:shojiku` does not exist for any
  consumer.
- **Then repo1 lags the Portal by hours.** `proof-published-java`
  resolves through `repo1.maven.org`, so it keeps failing after the
  release is genuinely published — a failure that looks like a broken
  proof and is a mirror that has not caught up. The one-line question is
  the pom itself:
  `curl -o /dev/null -w '%{http_code}' https://repo1.maven.org/maven2/jp/kengos/shojiku/<version>/shojiku-<version>.pom`
  — 404 until the sync lands, 200 after.
- **Do not background a poll for it and consider the matter handled** —
  see *A background watcher's silence is not a result* in
  [verification-claims.md](verification-claims.md). Re-ask the URL when
  you next need the answer; that costs one call and cannot go missing.
- Re-uploading an already-published version leaves a FAILED Portal
  deployment, so on a re-dispatch drop maven from the registry selection
  once it has shipped.

## The homepage re-pin makes a site suite red on purpose

Release step 2b re-pins `site/.data/wasm`, and the reference-demo suite
then fails by design, naming the `expect.json` declarations to delete.
It is not a break: see *The reference-demo suite goes red BY DESIGN when
a release re-pins the engine* in
[site-vitepress.md](site-vitepress.md).
