# Gotchas — GitHub automation (dependabot PRs, workflows that write)

> AI-only. The standards — how CI is wired, which job gates what, the
> ship mechanics — live in the `shojiku-release-engineer` skill. This
> file is the failure catalog for the part of GitHub that is not a
> `make` target: dependabot's PRs, and workflows that write back to the
> branch that triggered them.
>
> The through-line: **an automation that acts on its own output is
> reasoning about a fixed point, and that reasoning is not checkable by
> any gate in this repository.** Every entry below is something that
> reported success, or reported nothing at all, while being wrong.

## A dependabot PR cannot fix itself, and the reason is two hard rules

Both are permanent GitHub behaviour, both are documented, and between
them they rule out a whole class of design. Establish them before
planning anything that wants a dependabot PR to repair itself:

1. **A workflow triggered by Dependabot's `pull_request` event cannot
   read repository secrets.** `secrets` resolves to the separate
   *Dependabot* secrets store, and the `GITHUB_TOKEN` is read-only.
2. **A push authenticated with `GITHUB_TOKEN` starts no new workflow
   run**, by design. The only documented workarounds are a PAT or a
   GitHub App installation token.

Together: **there is no `GITHUB_TOKEN`-only design that ends with a
green, CHECKED pull-request head.** Something has to supply a credential
that is not `GITHUB_TOKEN`, and `pull_request_target` or `workflow_run`
has to supply the context that can read it.

A third rule joins them whenever `main` requires signed commits: a
runner's `git push` produces an UNSIGNED commit, and that fails late and
misleadingly — at merge, with a message naming no cause. The GraphQL
`createCommitOnBranch` mutation produces a commit GitHub signs. (An App
installation token drives it fine: commits land authored by
`<app>[bot]` and the API reports `verified=true reason=valid`.)

## Committing to a dependabot branch makes dependabot disown it

Push anything to a dependabot branch — by hand or from a bot — and
`@dependabot rebase` answers:

> Looks like this PR has been edited by someone other than Dependabot.
> That means Dependabot can't rebase it - sorry!

The only way out is `@dependabot recreate`, which rebuilds the branch
and **overwrites the edits**. That is usually fine (the edit is
regenerable), but note what it means for an automation: a workflow that
commits to dependabot PRs takes over their maintenance permanently.
Every later conflict on such a PR needs a recreate, and the recreate
throws away the automation's own commit, which the automation then has
to redo.

Plan for it rather than meeting it at the first conflict.

## Dependabot PR numbers are not stable

When `main` moves, dependabot may SUPERSEDE a PR rather than rebase it:
the old number closes and a new one opens with a new branch hash
(observed: #135 became #139 mid-session). Two consequences:

- A queue, checklist or cycle record that stores PR numbers goes stale
  on every merge. Store the branch or the dependency, and re-resolve.
- Merging one PR that touches a shared lockfile invalidates the others
  that touch it. Those serialize: fix and merge one, let dependabot
  regenerate the rest, then fix those.

## A workflow that writes to its own trigger needs a stated fixed point

`pull_request_target` + "commit the result" is a loop unless the job
compares against something that already includes its own previous
writes. Name that fixed point explicitly before shipping, because the
default is wrong: **the checkout is of BASE, so anything the job reads
from the working tree is `main`'s copy, not the pull request's.**

The incident: a workflow regenerated the committed SBOMs on dependabot
PRs and committed them. It checked out base, so `sbom/` on disk was
main's inventory; regenerating from the head's lockfile always differed
from it — that difference is the entire reason the PR needs syncing — so
it committed, the commit fired `synchronize`, and the next run read
main's inventory again. **It never once looked at what it had already
written. 19 commits on one pull request**, stopped only by
`gh workflow disable` typed by a human.

Its header comment asserted, in the confident register, that
"termination is structural rather than a guard". Two attempted fixes
later the loop still reproduced. Which brings the actual rule:

- **Give it a circuit breaker regardless of how sound the convergence
  argument looks.** Count the automation's own commits already on the
  branch and refuse above a small number. A correct run leaves one; the
  breaker cost nothing and turned the second occurrence from 19 commits
  into 3. **The convergence argument was wrong twice and the breaker was
  right both times** — that ratio is the reason this is a rule and not a
  suggestion.
- **`git diff` is the wrong instrument for "did I change anything".** It
  measures from base, so any file the job deliberately pulled from the
  head reads as modified whatever the job decided. Snapshot before,
  compare bytes after.
- Nothing else notices. No gate in this repository reads a PR's commit
  count, so an unbounded commit stream is invisible until someone looks
  at the PR.

## The same blind spot appears more than once — sweep for siblings

The loop above was the SECOND defect of the form *this job cannot see
its own output*. The first was its changed-file allowlist, which listed
manifests and lockfiles but not the files the job itself commits — so
the first sync put a path on the branch that every later run refused.
A third symptom in the same family is still unexplained.

Each was found by production, hours apart, and finding the first did not
prompt a search for the rest. **When a defect of this shape turns up,
stop and enumerate every place the automation makes an assumption about
its own writes** — what it admits, what it compares, what it counts —
before shipping the fix for the one you found.

## A workflow is unverified until it has run, and that outranks the gates

`pull_request_target` runs the workflow file from the BASE branch, so
**the workflow does not execute on the pull request that introduces
it.** A full green matrix on that PR says nothing at all about it. The
same is true of any `workflow_run`, `schedule` or `workflow_dispatch`
workflow.

This is the same posture the release-engineer skill takes toward a new
registry-facing install proof, and it deserves the same weight: if a
plan says an artifact cannot be verified by any gate, that sentence
belongs in the MERGE decision, not just in the cycle record. Here it was
written into the plan, and treated as a formality at merge time.

Two cheap habits for the first live run:

- Instrument before reasoning. On a throwaway PR, print the inputs
  (`shasum` of the file you replaced) immediately before the step that
  consumes them, and the output's own claim about its input immediately
  after. A CycloneDX inventory stamps the source file's sha256 into
  `metadata.component.version`, which is what identified the wrong
  lockfile here in one command — after a long stretch of arguing from
  the logs.
- Read the guard's decisions on a PR you expect it to DECLINE, not only
  on one you expect it to act on. Both refusal paths were confirmed
  correct that way (`inventoried lockfiles touched: 0` on a site-only
  bump) while the acting path was silently looping.
