# Why Shojiku exists

Shojiku was built by someone who maintained business-document templates
in [Thinreports](https://github.com/thinreports) for years. Three
things went wrong in that system, over and over, and none of them were
bugs. They were consequences of how the format was shaped. Shojiku is
an attempt to make all three structurally impossible.

If you have never maintained a form-layout system, this page will read
as unusually specific. That is the point.

## Failure 1: the binding key nobody could find

In the old system, a field on the canvas carried an ID, and the code
that filled it referenced that ID as a string. Nothing connected the
two except convention. Rename the field in the designer and the report
still rendered — with a blank where the customer's address used to be.
No error. No warning. The QA path was "somebody looks at the PDF."

The failure mode that hurt most was the quiet one. A field that was
never populated looked exactly like a field whose data happened to be
empty this time.

**In Shojiku, the field catalog is a file.** `definitions.yml` declares
every data item the template may reference, and the template refers to
those declarations. A reference to something undeclared is a
diagnostic with a code, raised before anything renders. You get the
error at author time, in CI, from the CLI, from the MCP server, and in
the Designer — the same check in all four, because there is one engine
underneath.

The rename problem stops being a class of bug and becomes a diff.

## Failure 2: one format key per format

The second pain compounded quietly. A price needed a thousands
separator, so a format was attached to the field. Then a different
report needed the same price without the currency symbol. Then one
needed it rounded. Then one needed it in a different locale.

Each variation became its own key, because the format lived on the
field rather than on the value. After a few years the catalog held
dozens of near-identical keys whose differences nobody could remember,
and picking the wrong one produced output that looked plausible.

**Shojiku formats at the point of display and inherits like CSS.**
Set a currency style on a container and every amount under it follows,
until one of them overrides it. The value stays a number. Locale data
lives in `packs/locale/` as data, not as branching logic inside the
engine. That is why the same receipt template renders in Japanese,
Traditional Chinese, Simplified Chinese and US English with the
currency, dates, tax wording and font fallback swapped by the pack, and
the geometry untouched. You can see the four of them side by side in
[the gallery](/gallery).

## Failure 3: a layout format no human could edit

The old format was XML, machine-authored, and effectively read-only to
humans. You could not review a layout change in a pull request. You
could not resolve a merge conflict in one. You could not ask a
colleague what changed between two versions and get a useful answer.
The file was an artifact of a GUI, and the GUI was the only way in.

That was survivable when a designer sat next to you. It became the
central problem the moment we wanted AI agents to author templates. An
agent works by reading and editing text, and that file gave it nothing
to work with.

**A Shojiku document is two YAML files you would not mind reviewing.**
A template and a field catalog, plus a JSON file of data. They diff
cleanly. They merge. An agent can read one, change six lines, render a
preview, read the layout tree back, and iterate against diagnostics
until the output is right. That loop is what the MCP server exists for.
The Designer round-trips the same files rather than owning them, so the
GUI is one way in, not the only one.

## What this buys you

**The same bytes everywhere.** The renderer draws from a layout tree
and never re-measures or re-formats; layout never draws. That split is
enforced at the crate boundary, and it is why the PDF from the CLI, the
Docker image, an SDK and the browser WASM build are byte-identical for
the same inputs. Regression testing a document engine is only tractable
if this holds.

**Nothing leaves the machine.** Rendering, signing and verifying are
network-free by design, not by configuration. A product manager
producing a customer estimate and a teacher printing worksheets both
render locally. When this site renders a PDF in your browser, the
engine is running in your tab — the same wasm module the Designer uses.

**Signing that says what it did not check.** Verification reports the
byte range a signature actually covers, because a valid signature over
an incomplete range is a forgery, and a verifier that stays quiet about
what it skipped is worse than no verifier. For anyone dealing with
電子帳簿保存法, this is the part that matters.

**One template, many data files.** The application-form example ships a
filled version and a blank version from a single template, and not a
single point shifts between them. The invoice example paginates 22 line
items with a repeating table header, and renders a three-item single
page from the same file with different data.

## What Shojiku is not

There is no `.tlf` importer and there will not be one. Migration from
Thinreports works by rendering the old report, handing the image to an
AI agent, and having it re-author the template from the definitions —
a process worked end to end in
[the migration walkthrough](https://github.com/kengos/shojiku/blob/main/docs/migration-thinreports.md).
Claiming compatibility with a format whose design caused these problems
would have meant importing the problems.

It is also not a service. There is no account, no upload, and no
hosted rendering to depend on.

---

*Author's note for the draft: this page is strongest with one real
anecdote at the top — the specific field that broke, or the specific
format key that was added one time too many. I have kept the three
failures factual and left the personal detail out rather than invent
it. Drop in the real story and cut this note.*
