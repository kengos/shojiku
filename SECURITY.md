# Security Policy

Shojiku renders, signs and verifies business documents. A verifier that
accepts a forged signature, or a renderer that can be made to execute
attacker input, defeats the point of the project. Reports are welcome
and taken seriously.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use either channel:

- **GitHub private vulnerability reporting** — the "Report a
  vulnerability" button under this repository's Security tab. Preferred,
  because the discussion and the eventual advisory stay in one place.
- **Email** — `kengo+shojiku@kengos.jp`. Put `shojiku security` in the
  subject.

Useful things to include, in rough order of value: the input that
triggers it (a template, params file, font, image or PDF is worth more
than a description of one), the command or API call, the version or
commit, and what you expected to happen instead. A proof-of-concept
file is the fastest path to a fix.

You will get an acknowledgement within **7 days**. If a report is
confirmed, you will get an assessment of severity and a rough timeline
within **14 days**. Shojiku is maintained by one person, so these are
honest targets rather than a commercial SLA — if a deadline slips you
will hear why rather than nothing.

## Supported versions

The most recent minor release is supported, and fixes land on `main`
first. Older minors get fixes only for vulnerabilities rated high or
critical.

## Scope

**In scope** — anything reachable from input a user does not fully
control:

- The engine's parsing of templates, definitions and params
  (`engine/core`), fonts and images (`engine/formatter`,
  `engine/image`), including resource exhaustion from a hostile
  template.
- PDF reading in `engine/signing` and `engine/verify`. This code reads
  attacker-supplied PDFs by design.
- **Signature verification correctness.** A verification result that
  reports a document as intact when it is not is the highest-severity
  class of bug in this project. The byte-range coverage rule exists
  because a cryptographically valid signature over an incomplete range
  is a forgery.
- The host surfaces: the CLI, the stdio MCP server (`engine/mcp`), the
  browser WASM bindings (`engine/wasm`), the C ABI (`engine/capi`), the
  N-API addon (`engine/napi`), and the seven SDKs under `sdk/`.
- The Designer's handling of imported, pasted or uploaded assets, and
  its font-fetch path (origin allowlist, sha256 pinning, refused
  redirects).
- Any way to make rendering, signing or verification reach the network.
  These three are network-free by design; a path that escapes that is a
  vulnerability, not a feature request.

**Out of scope**:

- Vulnerabilities in upstream fonts or locale data as shipped by their
  authors. Report those upstream — but tell us too, so the pack can be
  pinned or replaced.
- Attacks that require an already-compromised local machine or a
  malicious operator running the CLI against their own files.
- Denial of service from inputs an operator fully controls in a
  trusted-input deployment. Resource exhaustion from an *untrusted*
  template stays in scope.
- The static homepage's content.

## What the project already does

Context for anyone auditing, and the baseline a report is measured
against:

- **Rendering, signing and verification make no network calls.** Fetch
  exists only at authoring and bundle time, in a host-only crate.
- **`engine/deny.toml` carries zero advisory ignores**, with `yanked =
  "deny"`. Adding an ignore requires written justification, and the
  krilla/fontations migration removed the last two exceptions by
  dropping those dependencies entirely.
- **Five fuzz targets** run against the hostile-input surface:
  `pdf_document`, `contents_window`, `cms_container`, `trust_anchors`
  and `verify_document`.
- **The verification report states what it did not check**, rather than
  reducing to a boolean.
- **Errors are bounded** on the PDF-reading paths, so malformed input
  produces a refusal rather than unbounded work or a panic.
- The merge gate requires **100% line coverage** of the engine
  workspace, which means malformed-input and refusal paths are tested
  rather than assumed.

## Disclosure

Coordinated disclosure. We will agree on a date, publish a GitHub
Security Advisory, and credit you by whatever name or handle you prefer
— or leave you out of it if you would rather not be named. If a report
turns out to affect a dependency rather than Shojiku, we will help route
it upstream.

There is no bug bounty.
