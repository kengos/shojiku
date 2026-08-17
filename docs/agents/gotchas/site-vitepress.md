# Gotchas — the site (VitePress, and projecting `docs/` into it)

Traps met while building `site/`, especially the reference projection
(`docs/engine/*.md` → `/reference/**`). Everything here cost a debug loop;
none of it is inferable from the VitePress docs at the moment you need it.

Read this before touching `site/scripts/assemble-data.ts`,
`site/src/lib/reference*.ts`, `.vitepress/config.mts`, or any markdown that
the projection carries onto the site.

## Markdown that reaches Vue is a TEMPLATE, not just prose

VitePress renders markdown to HTML and then compiles the result as a Vue
template. Two classes of perfectly ordinary markdown therefore fail the
BUILD, and neither fails any test that only parses the markdown.

### `{{` is an interpolation, and the wire spells a literal brace `{{`

`docs/engine/data-binding.md` and `text.md` document `` `{{` `` as the escape
for a literal `{`. Vue reads it as the opening of a mustache and dies with

```
Error parsing JavaScript expression: Unexpected token (1:2)
```

pointing at the prose. Inline code does NOT protect it — markdown-it emits
`<code>{{</code>` and Vue still sees the braces.

The fix belongs to the PROJECTION, not to the repo file: `docs/` is also read
on GitHub and in the docs-only distribution, so a `<span v-pre>` written into
the source would be site-specific markup in a file the site does not own.
`site/src/lib/reference.ts` wraps the inline-code spans that contain `{{`,
and `projectedBody()` unwraps them so the drift gate still compares against
the source byte for byte.

### An unclosed-looking tag fails with coordinates that are NOT the source's

Vue's `Element is missing end tag` reports a position in the RENDERED HTML,
which for a long page is nowhere near the markdown line. One such error
pointed at `features.md (2100:80)` — a line of ordinary prose about border
radii, ~80 lines from the cause, and the position did not move when the file
was truncated to 2050 lines, which is the tell that the number is not a
source coordinate.

The cause was a code span split across a line break **mid-identifier**:

```markdown
- **Cell assets are per-element ids, not per-key**: `dyn:<array>[<i>].
  <key>` lets layout and prepare agree without a registry
```

Every scan for "a raw `<tag>` outside code" comes back empty here, because a
CommonMark-correct scan sees one code span covering both lines. It also
rendered a stray space inside the identifier on GitHub, so reflowing the
source to keep the span on one line is the right fix rather than a workaround.

**How it was actually found: bisect against `make site-build`.** The Vue
transform fails in under a second, so truncating the file (`head -N`) and
rebuilding is cheap — 1200 clean, 2050 red, 1900 clean, 2024 red — and lands
on the paragraph in five runs. Do that instead of re-reading the file; the
reported coordinate will keep sending you to the wrong place.

## VitePress ROUTES `public/**/*.md`

Anything staged under `site/public/` with a `.md` extension is picked up as a
page and compiled as Vue, so staging raw markdown there (for a same-origin
"copy the source" affordance, say) fails the build on the first file that
contains something Vue dislikes. `srcExclude: ["src/**", "public/**"]` is the
fix: `public/` is static assets and never routes.

## The site CSP is `connect-src 'self'` — an in-page fetch to GitHub cannot work

`site/public/_headers` sets `connect-src 'self' https://cloudflareinsights.com`,
and `headers.test.ts` explicitly refuses the github-raw hole the Designer
scope has. So a feature that fetches a repository file from the page (a
"Copy for AI" button reading the page's own markdown) is broken in
production while working in any local preview that serves no CSP header.

A **link** is fine — a navigation is not governed by these directives. Only
`fetch`/XHR is. If a page needs repo bytes, stage them into `public/` at
build time and read them same-origin.

This class ships green: no gate reads the CSP against the components, so the
check is to grep the new component's `fetch(` calls and confirm every one of
them is same-origin.

## A sweep test that walks `public/` answers differently after a build

`headers.test.ts`'s "no CDN origin anywhere in the site source" walked
`public/`, which holds build OUTPUT that only exists once `assemble-data.ts`
has run. In CI (fresh checkout, no prior build) it saw three files; locally
after a build it saw the whole generated tree — including `llms-full.txt`,
which inlines `fonts.md` and therefore quotes `fonts.gstatic.com` as
documentation of the font-fetch allowlist.

A sweep over a directory that mixes source and generated output is not a
sweep over source. Scope it, and say in the test WHY the generated paths are
excluded — otherwise the next reader restores them.

## `\Z` is not a JavaScript regex escape

`/^## Limitations$([\s\S]*?)(?=^## |\Z)/m` looks like "up to the next h2 or
end of input". JavaScript has no `\Z`; the escape degrades to a literal `Z`,
so the pattern silently fails to match any section that runs to the end of
the file — one page out of 31, which reads as a missing section rather than
a broken regex. Use `$(?![\s\S])` for end-of-input under the `m` flag.

## The reference projection's own invariants

- `docs/engine/` carries **no absolute links** today, which is what makes the
  outlink rewrite invertible and the drift gate exact. Adding one to a source
  page breaks the round trip; the gate will say so.
- The projection is allowed exactly the edits listed at the top of
  `site/src/lib/reference.ts`, and `projectedBody()` must undo every one of
  them. Adding a transform without its inverse reds `src/reference.test.ts`,
  which is the intended behaviour — the point of the gate is that the site
  restates nothing.
- **THREE places enumerate `docs/engine/`, and the test suite can only see
  two of them.** `scripts/assemble-data.ts` and the gates both import from
  `src/lib/reference.ts`; `.vitepress/config.mts` builds its OWN listing for
  the sidebar. A change to which files are reference pages that updates the
  first two leaves `config.mts` reading the directory raw — and because the
  suite goes through the shared helper, **every test stays green and only
  `make site-build` fails**, on a config-load error (`no reference:
  front-matter`) that names the file rather than the reader. Route any such
  change through one exported filter (`referenceStems()`) and grep
  `SOURCE_DIR` for the readers before believing a green `make site`. The
  general form: a VitePress config is a build-time reader that no vitest run
  imports, so "the tests pass" is not evidence about it.

## The reference-demo suite goes red BY DESIGN when a release re-pins the engine

`site/src/integration/referenceDemos.test.ts` renders every reference
demo on TWO engines — the RELEASED build the site serves
(`site/.data/wasm`) and HEAD (`engine/wasm/pkg`) — and a demo declares
in its `expect.json` the capability `requires` its wire needs, so a page
documenting syntax newer than the pinned engine degrades to a static
listing instead of showing a parse error.

Release step 2b re-pins `site/.data/wasm` to the new build. At that
moment every `requires` the release satisfies becomes a leftover: the
page would keep showing its static fallback under a notice saying the
syntax is newer than this engine, which is now a lie. The suite asserts
exactly that and fails with

```
these demos declare `requires` the served engine satisfies — a re-pin landed; drop them
```

**This is the tripwire working, not a broken suite.** Recovery is to
delete the named declarations from those `expect.json` files, on the
re-pin PR itself. Do not re-pin and defer this; the failure is the only
thing that finds the stale declarations.

Two neighbouring assertions are worth knowing before you read a red run
here as something else:

- **An all-gated set still fails** (`names.length - gated.length > 0`) —
  if nothing runs on the served engine, the pin is stale or broken. New
  syntax can never produce that state.
- **There is no lower bound on the declared keys.** Right after a re-pin
  the healthy state is that no demo declares anything, and it stays
  healthy until a page documents syntax newer than the pinned engine
  again.
- A red run whose message is instead `engine/wasm/pkg does not publish
  these keys` is a stale HEAD build, not a typo: `make site-build`
  stages the RELEASED engine into `engine/wasm/pkg`, so re-run
  `make wasm`.

## A green Pages check on the merge commit is not "production serves it"

The site rule already says the deploy is asynchronous, so a check read
immediately after merging measures the PREVIOUS build, and to poll the merge
commit's own check-runs instead. That is necessary and not sufficient: after
that check reports `success`, production can still serve the old bytes for
tens of seconds. Measured once at roughly 20 seconds, on a change whose whole
diff was markdown.

It is a nasty gap to sit in, because everything says done — the merge
returned, the check is green, and the URL is up — and only the CONTENT
disagrees. Two things separate it from the failure it resembles:

- **It is not a CDN cache.** The response carries
  `cache-control: public, max-age=0, must-revalidate`, and a cache-busting
  query string returns the old body just the same. Reaching for `?cb=` and
  finding no change is evidence about the deploy, not about the edge.
- **Poll the CLAIM, not the check.** Fetch the page and grep for the sentence
  the change introduced AND for the one it removed — a bounded loop of ~20s
  ticks. Both directions matter: a page that has not rebuilt yet still
  contains the old wording, so `new=0 old=1` names the state exactly, while
  `new=0` alone cannot tell "not deployed" from "I grepped the wrong string".

## `_redirects` matches PATHS only — a host rule redirects the site to itself

Moving the site to a new host wants a 301 from the old one, and
`site/public/_redirects` looks like exactly where that belongs: the file
deploys with the site, so the redirect would be version-controlled and
reviewable instead of living in a dashboard. Cloudflare Pages does not
support it — its documentation lists domain-level redirects as unsupported,
and the source column is a PATH, never a full URL.

The trap is that the rule does not merely fail to work. Written the obvious
way:

```
/*  https://<new-host>/:splat  301
```

the pattern matches on path, so it also matches every request to the NEW
host and redirects it to itself. A rule meant to forward the old host takes
the live site down with an infinite redirect, and nothing in the repo's
gates can see it: `_redirects` has no schema, no test, and the file is inert
until it is deployed.

The redirect is account-level Cloudflare work (Bulk Redirects, or a Worker
route bound to the old hostname), not repo content. It is also seldom
urgent: once the canonical points at the new host, search engines
consolidate there without it, so its real job is preserving links that
already exist — a published package's homepage field naming the old host,
which cannot be rewritten after the fact.

### Bringing the new host up: `dig` resolves it, `curl` does not

Not a site fault and not a propagation delay — it is the local stub
resolver holding a NEGATIVE cache entry from before the record existed.
`dig` queries a nameserver directly and never sees that cache, which is why
the two disagree. Verify through it with

```sh
curl -sI --resolve <host>:443:<edge-ip> https://<host>/
```

taking the IP from `dig +short @1.1.1.1 <cname-target> A`. Note that a
`dig +short … A` on a CNAME'd name prints the CNAME on the first line and
the addresses after it, so a `head -1` picks up a hostname where the next
command wants an address.

A TLS handshake failure (`alert 40`) against a brand-new custom domain is
the certificate not yet issued, not a misconfiguration — Cloudflare serves
the name before the dashboard flips it to Active, so the dashboard is the
last thing to believe, and a 200 carrying the site's own `<title>` is the
first.
