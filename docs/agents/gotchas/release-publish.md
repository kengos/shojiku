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

## `proof-published-*` used to take LATEST by default — a bare run certified the OLD release

`make proof-published[-<lang>]` asks the REGISTRY copy to render
`receipt-ja` in a clean container. They USED to install whatever the
registry called latest when run bare, so during the v0.2.0 run six of
them went green against 0.1.0 — true statements, about the previous
release, in a log that reads as proof of this one.

**Fixed at the source rather than left as a habit.** `common.sh` now
resolves ONE `PROOF_VERSION` for all seven: `SHOJIKU_VERSION` if set,
otherwise the tree's own `[workspace.package]` version. So a bare run
asks about the version you are SHIPPING and fails loudly when it is not
published yet, which is the honest answer. `published-java.sh` had
always behaved this way — via a hardcoded literal that was itself a site
going stale — and that is how the stale literals below were found at
all; the behaviour is now shared and the literal is gone.

What the incident leaves behind, because the shape outlives this fix:

- **An existence check defaults to the answer that already passes.**
  "Latest" during a release is the previous release; "the crate exists"
  during a version bump is the previous version. Whenever a check has a
  default, ask which release that default describes.
- The tell was never in the PASS line. It is in the install step's own
  output naming the version — every proof still prints it.

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
- `examples/deploy/java/pom.xml` and `examples/deploy/dotnet/Renderer.csproj`
  — the deploy RECIPES, proved only by the on-demand `make proof-deploy`,
  so nothing in CI reads them.
- `sdk/js/src/version.ts` — a `VERSION` constant the package re-exports
  from `index.ts`, so a stale one is user-visible: the published 0.2.0
  npm package reported `0.1.0`.

A first sweep that covered the tracked docs and the workflow file still
left the four `scripts/` sites, and only CI's java proof — looking for
`shojiku-0.1.0.jar` — found them, one PR later. **The last two entries
above were still stale a whole release later**, which is the fact that
matters: this section already existed, said the right thing, and did not
close the hole. A list a human has to re-read is not a gate.

**So there is a gate now: `make version-check` (CI job `versions`).**
Every place naming a release coordinate must equal `[workspace.package]`,
checked by structural rules that scan the WHOLE tree per ecosystem rather
than a list of known files — precisely because "the list was incomplete"
is the bug. It found both of the stale sites above on its first run.

Two things to know when it is the gate talking to you:

- **A rule carries a measured MINIMUM hit count**, so `VERSION UNDERCOUNT
  <rule>` means a rule stopped matching, not that a literal is wrong.
  That fires when a site is legitimately deleted (lower the floor) or when
  a file's shape changed under the rule (fix the rule).
- **The gate's own blind spot is a SHAPE no rule names, and neither of its
  self-defences can see one.** The undercount floors notice a rule that
  stops matching; the fixture seeds one case per EXISTING rule. A
  coordinate no rule ever matched is invisible to both by construction.
  This is not hypothetical: a fresh review falsified the "cannot fail
  open" claim in one command by staling
  `scripts/install-proof/js.sh:40` — a `"version"` key in a package
  manifest the proof writes in a heredoc, which the v0.2.0 release
  commit had itself bumped — and the gate printed "every release
  coordinate agrees" over it. Covered now by `json-version`. Read the
  rule list as the set of shapes someone has thought of, never as the
  set of coordinates that exist.
- **A version inside a shell default expansion**
  (`${SHOJIKU_VERSION:-0.2.0}`) is still unseen, because the literal is
  a fallback rather than a coordinate. There are none left in the tree.
- **`gui/*` package manifests and `legacy/` artifacts are skipped by
  PATH, not by the inline token** — JSON cannot carry a comment, so
  `version-check-exempt:` is unusable in a manifest. The `gui/*`
  packages are deliberately `0.0.0` and unpublished.
- **`site/.data/wasm-source.json` IS checked** (decided while building
  the gate). The homepage's pinned engine moves with the workspace
  version on the same release-prep PR — bump and changelog first, then
  step 2b's re-pin — so on `main` they always agree, and the one thing
  nothing else catches is step 2b being SKIPPED, which leaves the site
  serving the previous release while the docs advertise the new one.
  The cost is that a release-prep PR reds here between the bump push and
  the re-pin push. That red is the bump reporting itself unfinished, not
  a broken gate.

**The manual complement, for a shape no rule has yet: grep the PREVIOUS
version across the tree.** After bumping, the old number should survive
only in `CHANGELOG.md`, in prose genuinely about history, and in
lockfile/SBOM records of published artifacts. Note this is noisier than
it sounds — a template's own `version:` document key is unrelated to the
release and 158 tracked files carry the previous number for that reason,
which is exactly why the gate enumerates SHAPES instead of grepping a
number.

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
