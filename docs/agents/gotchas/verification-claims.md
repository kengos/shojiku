# Proving sweeps, counts, and claims

> AI-only. The one-line rule (cycle skill): **a bulk operation must
> prove HOW MANY things it matched — "ok" is not evidence — and every
> falsifiable claim in prose is grepped before it ships.** This file is
> the failure catalog behind that rule.

## "That is not possible" is a CLAIM, and the cheapest one to check

Declaring a requirement unsatisfiable retires it with no test and no
record — which is the same outcome as forgetting it, except it looks
deliberate. One cycle recorded "the path grammar is canonical, there IS
only one spelling" and dropped a requirement asking for two spellings of
one path; the parser is twelve lines, matches `\[\d+\]` and converts
with `Number`, so `items[01]` and `items[1]` really are two spellings —
exactly the case the code's identity check existed for. A fresh reviewer
found it by reading the file.

Before writing "not applicable" or "not possible" about the system's own
behaviour, open the code that would have to be true. The belief is
always about something small enough to read.

## A scripted edit's anchor text MOVES when a formatter runs

`str.replace` returns the string unchanged when the pattern is absent —
so an edit scripted against text a formatter has since reflowed lands
nowhere and reports nothing. It surfaces far away: an import rewrite that
silently no-opped produced `X is not defined` in a TEST run, not an error
at the edit. Two habits:

- **assert every scripted replacement landed** (`assert old in s`) —
  including the ones you are confident about, since the confident ones
  are written from memory of the file rather than from the file;
- **re-read the target after any formatter pass** before scripting
  against it (`{ A, b }` becomes `{ type A, b }`, arguments re-wrap at
  the line limit).

And remember `str.replace` in Python replaces EVERY occurrence: one test
helper's closing block matched a sibling helper too, adding a prop to
both and type-erroring in the one that did not take it. Count first
(`s.count(old) == 1`) when the pattern is generic.

## A broken MEASUREMENT looks exactly like a broken SYSTEM

When a probe you just wrote reports that the system is broken, the first
suspect is the probe. Nothing distinguishes the two readings except a control
you decided to put in.

A probe rendered a PDF twice — text at opacity 0 and the same text opaque —
to establish whether a fully transparent fill still emits extractable glyphs.
It reported **zero** text-showing operators for the transparent render, which
reads as a decisive engine finding: the feature standing on that mechanism is
impossible. It was wrong. Its stream scanner searched for `stream` and matched
inside `end`**`stream`**, desynchronising after the first hit — so it found
nothing in *any* PDF. The line that caught it was the control:

```rust
let opaque = count(&render_at("1"));
assert!(opaque > 0, "the opaque control drew no text");
```

The opaque render obviously draws text. When THAT assertion failed, the
conclusion flipped from "the engine drops the glyphs" to "my scanner is
broken", and the fix was one line. Without it the cycle would have recorded a
false blocking finding against the engine — and a plausible one, since the
whole point of the probe was that the answer was unknown.

Two habits:

- **Every probe of an unknown gets a companion measurement of a KNOWN.** Not a
  second assertion about the unknown — a case whose answer you would bet on.
  Cheap: usually the same call with one argument changed.
- **A zero from a scanner you wrote this hour is a claim about the SCANNER
  until a control says otherwise.** This is the sweep rules below, one level
  out: they cover a grep over files, this covers a parser over bytes, and the
  failure mode is identical — the tool silently saw nothing and the result
  reads as evidence about the subject.

Related, from the same probe: **searching for a delimiter that is a SUBSTRING
of its own terminator desynchronises the scan** (`stream` inside `endstream`,
`if` inside `endif`, `<b>` inside `</b>`). Advance the cursor past the whole
terminator, and prefer a real anchored match over a bare substring search.

### The control must be able to FAIL — "non-empty" usually cannot

That fix left the probe green and still measuring nothing, because the
controls it added were satisfiable by the wrong data. The scanner returned
every Flate stream that inflated, on the stated grounds that binary payloads
fail to inflate. They do not: the PDF writer compresses the embedded FONT
programs too, and writes them under a dictionary byte-identical to a content
stream's — `<</Length N/Filter/FlateDecode>>`, no `/Length1`, no `/Subtype` —
so no dictionary rule can separate them. An sfnt subset happens to contain the
literal bytes `BT`, `Tf` and `TJ`: measured over the repo's 43 committed
example PDFs, **two font programs each satisfy the "text was drawn" predicate
by themselves**. So both controls — `assert!(!streams.is_empty())` and
`assert!(opaque > 0)` — could pass on font bytes while the feature under test
was entirely broken.

The rule the first incident produced ("every probe of an unknown carries a
companion measurement of a known") is necessary and not sufficient. Add:

- **State what the control would have to see to FAIL, and check that thing is
  reachable.** "At least one stream inflated" is true of any PDF ever written,
  so it discriminates nothing. A control that cannot distinguish the subject
  from its neighbours is decoration.
- **Select by a property that actually separates the classes, and verify the
  separation over a corpus you already have.** Here the discriminator was the
  inflated CONTENT, not the dictionary: content streams are PDF operators
  (printable ASCII), font programs are binary, CMaps are PostScript. Validated
  over the same 43 PDFs it admits 80 of 288 streams, zero fonts, zero CMaps,
  and never leaves a PDF with none — three numbers that make the claim
  checkable instead of plausible.
- **A reviewer's proposed fix is a hypothesis.** This one was found by a fresh
  review that also proposed the dictionary rule; adopting it verbatim would
  have shipped a filter that filtered nothing. One measurement against a real
  render refuted it. Re-measure the fix, not just the finding.

### An assertion on an error message you have not read is not a test

A new wire test pinned that a non-boolean is REJECTED and asserted the error
names the key:

```rust
assert!(err.to_string().contains("visuallyHidden"), "got: {err}");
```

serde names the TYPE, not the key: *invalid type: string "true", expected a
boolean*. The test failed on its first real run — cheap here, because a gate
ran it. The habit that avoids it: when asserting on a message, read the
message first (run the case, print it), then pin the phrase that carries the
CLAIM (`expected a boolean` — a truthy string must not resolve to `true`)
rather than the phrase you assume is in it. A substring assertion on unread
output is the same class as a grep whose pattern was never validated against
the actual bytes.

## Bulk edits and sweeps

Every shape of a silent sweep fails green: matching nothing (a
`str.replace` no-oped on post-Biome formatting drift; a discovery glob
still said `*/templates.yml` after files moved one level deeper, and a
glob that finds zero files runs zero assertions), matching too much (a
regex renumbering the TODO queue also renumbered an unrelated list
further down), and skipping (an `if yaml:` import guard skipped a whole
check whose empty output read as "all covered").

- **A zero can also come from the SHELL, before grep ever sees your
  pattern.** `grep -c 'verdict=$(sbom_place'` returned 0 against a file
  containing three of them, because the pattern passed through an outer
  shell that ate the `$(`. Nothing errored; the count was simply a lie
  about a file open in the next pane. When a zero contradicts something you
  believe, re-ask it a DIFFERENT way before believing it — `grep -F` for a
  literal, and print the matching lines rather than counting them, so the
  answer carries its own evidence. (Both re-asks agreed on 3.)
- **The proving count must be of the INPUTS, not of the matches** — a
  match count of 0 is ambiguous between "clean" and "the sweep saw
  nothing". A security sweep over a shell variable of space-separated
  paths reported `0` for every hostile pattern because grep took the
  whole list as ONE filename. Print the file/line count the sweep is
  reading FIRST, check it against expectation, then trust a zero.
  **And reconcile the count the sweep REPORTS, the moment it prints** —
  printing it is not checking it. A queue-renumbering script announced
  "renumbered 15 items" over a 12-item queue and the three extra were an
  unrelated numbered list further down the same file, silently rewritten
  (the same over-matching incident as the one above, one cycle later).
  A section-scoped sweep is bounded by the SECTION — stop at the next
  heading rather than at the end of the file.
- **Once the sweep has an intermediate MATCHING stage, it needs its own
  POSITIVE CONTROL — a number you know must be non-zero.** A rename
  sweep honestly reported "550 source files read" and still passed
  vacuously: its module-key derivation never matched anything, so both
  the match count and the stale count were 0. Printing the per-module
  count of imports that legitimately REMAIN is what proved the sweep
  reached the modules at all.
- **A pattern anchored to the CONTEXT rather than the TOKEN is a lower
  bound, and it reports the biggest offender as clean.** A sweep for
  work-item codes written as `// [A-Z]{1,3}[0-9]+` requires the code
  immediately after the comment marker. It found and cleaned that shape,
  and returned nothing over 123 further sites in the same files — every
  one of them a code sitting MID-SENTENCE in a `///` or `//!` doc comment,
  which the anchor cannot reach. The follow-up sweep then "confirmed
  clean" for a whole cycle. Anchor on the token you are hunting, sweep the
  whole line, and pay for it by EXCLUDING the false positives by name
  (paper sizes, codepoints, OIDs) — an exclusion list you can read is
  evidence; an anchor that quietly narrows the search is not. The same
  applies to `--include` lists: the gui half of that sweep missed codes in
  `.css` and in an e2e `.js` because the list said `*.ts,*.tsx`, and it
  missed test names because they are not comments at all.
- **Extracting the comment BODY with a negated-quote class truncates it.**
  `grep -oE "(//|///|//!)[^\"]*"` stops at the first `"` on the line, so a
  doc comment like ``/// `"2.0"` — … (AA1: the bare number)`` yields only
  the fragment before the quote and the code after it counts as ZERO
  occurrences. Match whole comment LINES
  (`^[[:space:]]*(///|//!|//)`, plus a trailing ` // `) and search the
  full line; a comment line has no non-comment content to protect against.
- **The CONFIRMING command is the one nobody audits, and its defaults are
  where a rename survives.** Two in one cycle, both used as proof that a
  cleanup was complete, both silent for a reason that has nothing to do
  with the tree. `grep -rn "edge"` came back empty over files that still
  said `dependency-EDGE` — a case-sensitive default answering a
  case-insensitive question, so add `-i` whenever the token could be
  shouted in a comment or a constant. And `ls sbom/` showed three clean
  files while a leaked `.engine.cdx.json.tmp` sat beside them, because
  `ls` hides dotfiles: use `ls -A`, or better, ask git
  (`git status --porcelain <dir>`), which is the question you actually
  meant — "would this get committed?". A confirming command that returns
  nothing has two readings, and the boring one is that you asked it
  wrong.
- **zsh also refuses an unquoted GLOB it cannot match, so the command
  never runs.** `grep -rn 'Foo {' engine --include=*.rs` dies with
  `(eval):1: no matches found: --include=*.rs` — zsh expands the
  argument against the CWD first (bash passes it through), and with the
  whole pipeline dead the `| wc -l` at the end still prints a
  reassuring `0`. A census that comes back zero next to a shell error
  line is not a census. Quote every glob that is meant for the tool
  rather than the shell (`--include='*.rs'`, `-name '*.md'`).
- **An APOSTROPHE inside a single-quoted program string ends the
  string, and any backtick after it becomes live command
  substitution.** Embedding an awk/sed/python program as `PROG='…'` is
  the normal way to share one detector between a self-test and a real
  run — but a prose COMMENT inside that program is where the quote
  sneaks in, because prose is where apostrophes live. A gate script grew
  the comment "folds a tab into the same space run as ' '", which closed
  the string; the backticks a few words later then ran as commands, and
  the script died with `File name too long` — an error naming neither
  the quote nor the line that carried it. Two habits close it: keep
  every embedded program free of apostrophes and backticks (say "a plain
  space", not `' '`), and run `bash -n` on the script after editing a
  comment, not only after editing code. The same trap in reverse is a
  heredoc: `<<'PY'` is inert, `<<PY` is not.
- **This repo's shell is zsh, which does NOT word-split an unquoted
  `$var`** — in EVERY shape it appears: `set -- $r` inside a loop over
  rows, and `for s in $syms` over a captured multi-line list (which
  runs ONCE with the whole list as `$s`, so a per-symbol census silently
  becomes one bogus measurement of the last symbol). Knowing the
  `set --` form did not prevent the `for … in` form; pipe the list into
  `while IFS= read -r`, or write the verifier to a file and run it under
  explicit `bash` with a real array (an inline link checker reported
  "checked 0 links → PASS" this way; its per-file counts sitting at zero
  was the tell). A row loop that mis-splits silently reports the
  WHOLE-file value for every range. Identical numbers down a results column are one tell; the other
  is a CLEAN RESULT — the same loop driving a per-field sweep passed the
  whole row as the field name, matched nothing, and reported "no unused
  members found" over interfaces it never opened. Print what each
  iteration RESOLVED (the field list it extracted), so an empty extraction
  is visible instead of reading as a pass.
- Assert `old in s` per replacement (or use an editor tool that errors
  on a failed match); anchor a bulk pattern to its section (slice
  between headings), never the whole file.
- **Write the sweep so re-running it is a no-op on what it already
  did** — a sweep that writes as it goes WILL abort partway on the one
  input you did not think of, and then the choice is between
  reconstructing which files it reached and reverting work you want to
  keep. Key each file's edit off a condition the edit itself destroys
  (here: "this file still imports X from the old home"), so the second
  run skips the finished ones and you only fix the edge case. A
  directory of same-shaped files usually contains a STRUCTURAL sibling
  the glob also matches (`catalog/*.ts` is six catalogs plus
  `types.ts`) — that sibling is the input you did not think of, and
  idempotency is what let the run resume past it instead of forcing a
  revert. The edge
  case that aborted this one is worth knowing on its own: a file whose
  ONLY import statement is the one being removed leaves the "insert the
  replacement before the first import" step with no anchor.
- **`HEAD` is a MOVING base: the moment you commit, every
  `git show HEAD:<path>` check compares the tree with ITSELF.** A
  containment/census re-run after the commit reported the post-change
  files as the "originals" and every count came back 0 or absurd. Name
  the base the claim is about (`main`, the merge-base, an explicit sha)
  in the command AND in the record — a proof that read `HEAD:` while
  uncommitted is still true, but its wording stops being true later.
  The tell is the INPUT sanity line: print the byte/line size of each
  "original" blob first, and a 263-line file arriving as 62 lines stops
  the run before its numbers reach a doc.
  **The same error with the opposite sign: the tree you are STANDING in
  is not the tree you just shipped.** Cycle work happens in a worktree,
  and removing it drops you back into the primary checkout — which is
  still at whatever commit it held when the session began, several
  merges ago. A repo-wide sweep run there greps the OLD content and
  returns a confident ZERO for text that is live on `main`. It is worse
  than the case above because nothing looks wrong: the command is
  correct, the file list is complete, and the answer is simply about
  another commit. One such sweep "confirmed" a defect absent minutes
  after a diff had shown it present. The tell is exactly that
  contradiction — a sweep disagreeing with a diff you just read is a
  measurement bug until proven otherwise. Two habits close it: after
  removing a worktree, `git pull --ff-only` the primary checkout before
  measuring anything; and for a claim about what SHIPPED, read the ref
  rather than the filesystem (`git show origin/main:<path>`,
  `git grep <pat> origin/main`), which is immune to where you are
  standing.
- **`git diff A..B` compares two TREES, not a commit range — so once a
  parallel branch merges, `git diff origin/main..HEAD` starts reporting
  THEIR files as yours.** The two-dot spelling is a range for `git log`
  and merely a separator for `git diff`, which is why the habit
  transfers wrongly. A pre-merge gate asking "does this PR touch
  anything outside `docs/agents/gotchas/`?" answered **2** — `Makefile`
  and `engine/wasm/.gitignore`, both belonging to a neighbouring PR that
  had merged minutes earlier, moving the local `origin/main` past this
  branch's base. The PR really did contain two files, both under
  `gotchas/`. Use `origin/main...HEAD` (three dots) or an explicit
  `$(git merge-base origin/main HEAD)..HEAD`.
  Two things make this worse than an ordinary miscount. The number is
  **not noise — it is a correct answer to a different question**, so it
  reads as a genuine finding about your own change rather than as a
  broken command. And a count computed inside a command substitution
  (`echo "… $(… | grep -c …)" && <the irreversible thing>`) cannot gate
  anything: `echo` succeeds whatever the number is, so the `&&` proceeds.
  This one was merged past — correctly, as it turned out, which is the
  only reason it cost nothing. Put a check that guards an irreversible
  step in its OWN command, and compare its value explicitly.
- **Never reuse an OFFSET across a mutation** — a script that computes
  `start`/`end` with `.index(…)`, then does an unrelated `.replace()`,
  then splices at the saved offsets writes into the wrong place (it ate
  a whole TODO detail block, leaving two stray characters as the only
  tell). Re-find every offset after any edit, or splice first. **Verify
  the REPAIR of such an accident with a whole-file duplicate-line sweep,
  not a range-diff anchored at the restored heading** — a truncated
  duplicate ABOVE the anchor passes the range check (it shipped).
- **A two-marker slice assumes the markers' ORDER, and a wrong guess
  DUPLICATES instead of deleting.** `s[:s.index(a)] + s[s.index(b):]`
  silently produces a file with everything between `b` and `a` written
  twice when `b` precedes `a` — which reads as a fatal "cannot redeclare"
  only if the language happens to have one, and otherwise ships as a
  quietly dropped member. One such excision deleted a required test from a
  suite and duplicated a neighbour; the parse error revealed the
  duplicate, and only a later item-by-item diff against the plan found the
  missing test. Assert `start < end` before splicing, and re-count the
  artifact's members afterwards (`grep -c` for the declaration shape) —
  the count is what catches the deletion the duplicate distracted from.
- **A claim you write to REPLACE a false one is itself a falsifiable
  claim — run the same command on the new wording.** A review corrected
  a code-map entry that named a consumer which only mentioned the symbol
  in a COMMENT, and the replacement ("read by every other module in the
  area") was itself an overstatement: 6 of 13. Fixing a claim is the
  moment you are most certain and least likely to re-grep. Same family
  as verifying the REPAIR above.
- **An artifact assembled by several sequential edits has to be read END
  TO END before it ships — its claims must be consistent with EACH
  OTHER, not just with reality.** A contradiction that lives BETWEEN two
  sections is invisible to every hunk-level check, because each hunk is
  individually true: a policy doc rejected one dependency for requiring
  a C toolchain and, two bullets later, accepted another that builds C
  and assembly — the decision was right, the stated reason refuted
  itself, and no grep or gate can see it. Prose grown by edit-at-a-time
  is where this happens; one full read of the finished file is the whole
  check.
  **Read EVERY file the commit touched, not just the one you think of as
  the main one, and read each against ITS OWN other sections rather than
  only against reality.** A docs-home change did the end-to-end read on
  `architecture.md` alone and against the tree — and shipped three
  contradictions past it: a rule stating "nothing reader-facing is
  authored on the site" one screen below that same commit's own layout
  block listing the site's nine hand-written pitch pages; a
  two-sided "which pages are projected" partition naming 8 of the 9
  files it claimed to cover; and, in the sibling file the same commit
  edited, the present-tense "rendered here" that the main file had just
  been fixed to mark `(planned)`. The fresh reviewer found all three.
  A MECHANISM claim outranks a wrong count here: as written, the first
  one forbade the next author from adding a page to the site.
  **And a claim you ADD converts merely-stale sentences elsewhere into
  live contradictions — so the subject you introduce is a subject to
  sweep.** The same commit stated "six of the seven SDKs are already
  published"; three untouched sentences said all seven were unpublished.
  They had been quietly out of date for a release; the new sentence is
  what put a denial of them into the constitution, on the ordinary
  reader path. Sweeping only the subject you came to change (here: the
  docs home) never reaches it — after drafting, grep the subject of
  every NEW claim too.
  **An APPEND-ONLY file grown by successive cycles is the worst case,
  because the two entries were written weeks apart and only the READER
  ever sees them together.** `CHANGELOG.md` under one `Unreleased`
  heading is the example: a first cycle wrote "values clip at 200
  characters", a second cycle bounded a composed value at 80 and added
  its own entry — each true in isolation, contradictory side by side,
  and the newer entry landed ABOVE the one defining the regime it
  refines, so the reader met "that field is capped" before learning what
  the cap was. Whenever an entry lands next to an existing one on the
  SAME subject, read the pair in reading order and make the newer one
  connect to the older one's numbers ("at most 80 of those 200") instead
  of restating its own. Ordering is part of the claim.
- A discovery glob needs `expect(files.length)` against the real total,
  not `toBeGreaterThan(0)` (a 1-of-27 match also passes); READ the
  resulting diff before staging.
- **A build-time replacement TOKEN must appear exactly once, and its
  verification is the token's ABSENCE from the output — not the
  replacement's presence.** A CSP hash-injection step replaced the first
  occurrence of `__INLINE_SCRIPT_HASHES__`, which was the EXPLANATORY
  COMMENT that spelled the token, leaving the literal token on the
  deployed policy line; the check greped for the injected hashes (present,
  in the comment) and shipped. A comment describing a token must not
  spell it; use replaceAll; and assert the token is gone from the final
  artifact (the fix made survival a build failure).
- **Finish any rename — a path, an identifier, a diagnostic code — with
  a NEGATIVE sweep that must come back empty.** Grep the OLD shape
  repo-wide and require zero hits; do not work from a per-file list you
  enumerated earlier. A tree-wide `examples/` move fixed every listed
  file and still left three live code references that only the pattern
  sweep caught. The enumeration says where to start; the empty sweep
  says you are done.
  **A REVIEW FINDING is an enumeration too, and the most tempting one to
  treat as a census** — it arrives already itemized, by someone who
  looked hard, so fixing the files it lists feels complete. A reviewer
  reported one file stating an unbuilt feature in the present tense; the
  author fixed that file plus the one they had written it in, shipped,
  and left the same sentence standing in a third — the site config,
  which is the file a contributor to that area opens first. Nobody had
  asked "which OTHER files carry this claim?". After applying any review
  fix, sweep for the CLAIM's shape, not for the reported paths; a fix
  is finished when the sweep is empty, not when the list is.
- **Grepping a fan-out by NAME finds the code; it cannot find the
  COUNTS.** Sizing "what does adding one of these touch?" by grepping an
  existing member's name (`hi-IN`, `noto-sans-devanagari`) reaches every
  site that spells it and misses every site that asserts only how MANY
  there are. Adding one bundled example turned up eight such sites: two in
  the catalog's own test, one in its gallery-parse positive control, then
  `resources/tests.rs`, `tools/examples/tests.rs`,
  `server/tests/handshake.rs`, `tests/bin/main.rs` and the site's
  `gallery.test.ts` — plus a title TABLE (`examples.rs`'s `EXTRAS`) whose
  absence fails a DIFFERENT test ("every entry has a title"), because an
  entry with no gallery row falls back to its id. The name grep found two
  of the eight; the rest arrived one red suite at a time, across three
  gate runs. When a change adds a member to a SET, sweep for the set's
  CARDINALITY too — `grep -rn 'len(), [0-9]'` and `grep -rn 'toBe([0-9]'`
  over the area — and re-derive the number from the tree (`grep -c` the
  declaration, `find | wc -l` the directory) rather than incrementing the
  one you found.
- **A census by DECLARATION NAME finds only the sites someone named
  consistently — sweep for the BEHAVIOUR to find the rest.** Counting a
  duplicated primitive with `grep 'fn clip\|fn sanitize\|fn truncated'`
  reported 9; the real number was 13. The four it could not see were an
  INLINE expression with no function at all (`locale.chars().take(64)`),
  and two more named `snippet` — one of which documented itself as a
  hand-copy of the first, "crate-private there", which is exactly the
  condition that spawns unnamed clones. Only a sweep for the code SHAPE
  (`filter(|c| !c.is_control())`, `chars().take(`) found them, and it ran
  as the negative sweep AFTER the work was believed finished. So: when
  the deliverable is "consolidate N copies", derive N from behaviour
  before scoping, and treat a name-based count as a lower bound. The same
  asymmetry applies to enumerating a SURFACE: organizing by the type
  involved (every error enum) missed two of seven echo boundaries that
  grepping every WRITE site (`eprintln!`/`writeln!`) found immediately —
  one of them a line that reads as transparency ("fetched font `{id}`
  from {url}") rather than as an error, which is why two passes skipped
  it.
- **A membership sweep over SOURCE must read the table, not the file** —
  prose in doc comments contains the very characters and identifiers the
  table lists. Checking which of 18 candidate characters were already in
  a `matches!` set with `if c in open(path).read()` reported the em dash
  PRESENT; it occurs only in the comments' own `—` punctuation, and the
  table did not list it. Slice the function body first
  (`re.search(r"fn <name>\(.*?\) -> bool \{(.*?)\n\}", src, re.S)`, then
  `re.findall(r"'(.)'", body)`) so the answer is about code. The same
  slicing makes the reverse check cheap: a doc table's rows diffed
  set-by-set against the code sets, which is what catches doc/code drift
  no gate reads.

## Counts and structural claims in prose

- **The correction you write for a wrong count is itself a count.** A
  `dependabot.yml` comment listed THREE node version pins; a sweep found
  five. The fix written for it said FOUR — the negative sweep for the old
  value (`">=24"`) then turned up a fifth in `site/package.json`, hidden
  behind that same comment describing the shared `NODE_IMAGE` variable as
  driving "the local gui gates" when it drives the site gates too. Writing a
  correction is the moment of maximum certainty and minimum re-measuring,
  which is exactly when a list is enumerated from the thing you just read
  instead of from the tree. Re-run the sweep against the NEW sentence before
  shipping it. Better still, notice when the artifact should not be a list
  at all: this one now tells the reader to sweep (`node:2[0-9]`,
  `">=2[0-9]"`) rather than to trust the enumeration, because the
  enumeration was what was wrong both times.
- **A benefit your change is CREDITED with may already have been true.** A
  removal invites you to attribute every good consequence of the thing being
  gone to the act of removing it. One cycle took `docs/engine/features.md`
  off the site and wrote, in the changelog, the code map and the commit
  message, that this "cut `llms-full.txt` from about 442 KB to about 322 KB".
  It cut nothing: a separate `LLMS_FULL_OMIT` list had been excluding that
  file from llms-full for some time, so the payload was byte-identical before
  and after, and the real effects were the route, the raw copy under
  `/data/reference/`, and collapsing three special cases into one. Every gate
  was green — no gate reads a changelog. The check is one question per
  claimed benefit: **would this already be true on `main`?** Answer it by
  reading the pre-change code path, not by reasoning about the feature.
- **A number you INHERITED from a comment is not a number you measured.**
  The 442,505 figure above was copied out of an existing source comment,
  which had gone stale as the file grew (`features.md` was 148,522 bytes by
  then, so the total could never have been 442 KB). Copying it felt like
  citing the repository. Re-measure any figure you are about to restate,
  especially one that "the code already says" — a comment is prose, and
  prose is exactly what nothing checks.
- **A POSITIVE CONTROL measures the floor, not the phenomenon — and a tidy
  multiple is the tell that you are quoting one.** To prove a directory
  scan was inventorying build output, a cycle planted ONE copy of a
  lockfile under `target/` and measured 510 components and 322 dependency
  entries against the lockfile's 255 and 161. Both numbers are exactly
  double, because one copy is exactly one copy — and they shipped into the
  public `CHANGELOG.md`, into a gotchas file, and into a commit message as
  what "a tree with a populated `engine/target/`" produces. A real built
  tree (17 lockfile copies, plus the binaries) gives **1757**, so the
  defect was understated 3.4×. The synthetic figure is the right tool for
  proving a MECHANISM exists and the wrong one for describing its SIZE.
  Before a controlled number reaches prose, either re-measure the real
  condition or label the number as the control it is. A zero-context
  reviewer caught this one; the author had read the sentence many times.
  The same reasoning retires any generalization drawn from the control:
  "the fake `.exe` was not catalogued" was true of a 5-byte stub and false
  of the real tree, which reports five `application` components.
- **A "now X, rather than Y" contrast asserts something about the PREVIOUS
  state, and only `git show <base>:<path>` can check it.** The claim reads
  as a description of your own change, so it never reaches the grep pass a
  count gets — but half of it is a claim about code you did not write. A
  CHANGELOG entry, a component comment and a code-map line all said a
  playground panel now held "the whole runnable file rather than an excerpt
  beside the controls"; `git show HEAD~1:` showed the panel had ALWAYS
  rendered the whole file, and the change was only that it became a
  `<details>`. Three copies of one false contrast, shipped green, because
  nobody re-read the old file. Before writing "rather than", open the base
  revision.
- **A UNIVERSAL claim over a set you just generated ("each entry names its
  diagnostic code", "every page carries X") is counted, not asserted.** The
  set is large enough that you cannot have checked it by reading, and the
  counter-examples are legitimate: a Limitations pass produced 139 bullets of
  which 39 name no code, because a structural limit ("there is no `calc()`")
  has no diagnostic to name. The prose was the only thing wrong — and the
  cross-cutting table four rows under the claim already showed four dashes.
  Write the qualified form ("where a diagnostic reports it, the entry names
  its code"), which is both true and what the gate actually enforces.
- **The file you are ALREADY EDITING is the one you sweep least.** Editing it
  feels like having read it. Two in one change: a doc's INTRO PARAGRAPH still
  said the feature was "not yet built" while the two bullets directly under
  it had just been corrected to say it was; and a code map whose site section
  was rewritten by 61 lines kept "nine nav pages" while the same sentence's
  copy in the source file was updated to ten. Both sit inside the diff. After
  the last edit, re-read each touched file for the claim you came to change —
  the neighbouring sentences are where its other half lives.

- **A count or structural claim you assert in prose is grepped before
  it ships** — no gate reads prose. A walkthrough claimed "~25 style
  maps" (29) and "three named `styles`" over a template that used two;
  a README said "Fourteen more" over a list of 13. Re-grep after any
  later edit of the artifact.
- **A NEGATIVE-SCOPE claim — "X is unaffected", "Y is untouched" — is
  falsified by the change's own test fixtures first.** It reads as
  reassurance rather than as an assertion, so it escapes the grep pass
  that a count would get. A CHANGELOG entry said "Japanese output is
  unaffected" while the same commit added a test whose fixture is
  hiragana (`ああ”あ`) and whose whole point is that it now wraps
  differently. The bundled examples WERE unchanged — a narrower, true
  statement that had been conflated with the broad one. Before writing
  such a sentence, grep your own new fixtures for the population you are
  exempting, and say the narrow thing you actually verified. This class
  matters more than a wrong count: an upgrade-risk line is what a reader
  uses to decide whether to re-check their own documents.
- **Hard-wrapped prose defeats a line-anchored grep: flatten before
  matching.** Docs in this repo wrap at ~72 chars, so any phrase longer
  than a few words straddles a newline and `grep "publish together at"`
  reports a clean, confident ZERO over a file that says exactly that.
  Both false negatives in one doc review came from it — a mandated
  clause read as "delivered 6/7" and a design rule read as absent — and
  each would have shipped as a fabricated finding, which is worse than
  a missed one because it sends the next author editing correct text.
  Pipe the file through `tr '\n' ' '` first (or match a distinctive
  SINGLE word), and treat any per-file zero in a set where the others
  hit as a measurement bug until proven otherwise. The sibling trap
  when you reach for alternation to dodge this: **`\|` inside
  `grep -E` is a LITERAL pipe** (ERE spells alternation `|`
  unescaped), so `-ciE 'traversal\|\.\.'` matches nothing and looks
  like a missing clause — three zeros in that same review were this,
  not the artifact.
  **The same root cause in CODE: a two-stage `grep A | grep B` pipeline
  only ever finds sites where A and B share a LINE, and a formatter
  wraps them apart.** A census of "an untrusted value composed into a
  single diagnostic arg" ran `grep '\.arg(' | grep 'format!'` and
  reported one site in a file that had two — the second had `.arg(` and
  `format!` on different lines after rustfmt. Treat such a pipeline as a
  LOWER BOUND, and confirm the real count with something line-agnostic
  (a scripted `str.count` of the exact text you are replacing, which is
  what caught this one, or `rg -U` over the whole file).
- **Measure file/line counts AFTER the formatter has run, and re-measure
  after review fixes** — the formatter is a bulk edit of every number
  you just took. **It is a bulk edit of every ANCHOR too**: a scripted
  edit that matched an import line silently no-oped because Biome had
  already reordered the imports it keyed on, and the run reported
  success — the same class as a stale count, but it fails as a MISSING
  edit rather than a wrong number. Assert every replacement
  (`assert old in s`), including the ones you add as an afterthought. Two incidents of the class: a gui count taken before
  Biome reflowed the file, and a cycle record asserting "14 src files …
  longest 228 lines" measured before `make fmt-fix` reflowed the crate
  (20 files, longest 282 by ship time — rustfmt splits long asserts
  across lines and review fixes add files).
- **A BREAKDOWN that sums to the right total is not verified — check
  the partition, not the sum.** A review "corrected" an area
  enumeration to `canvas 24 + panel 11 + text 5 + toolbar 4 + palette 3
  = 47`; the total was right and every area named was real, but the
  real partition was `palette 2` plus one file in the module's OWN
  area, and the reviewer had reached 47 by mixing a PRE-change count
  with a POST-change one. A correct sum is the easiest thing to
  reverse-engineer and the first thing a reader trusts, so re-derive
  each term from one measurement of one state; when two states are in
  play, say which one every number is from — **and read the same FILE
  SET on both sides**: a before/after cap census compared three named
  product files at the base against a `*.ts` glob that also matched
  `*.test.ts`, and every "DIFF" it reported was the suite's own uses of
  the constant, not a lost enforcement site.
- **A count you read off a tool's own output by eye is not a
  measurement.** A census listing 63 importers with their imported
  symbols was skimmed as "35 take only the type"; the number was 47,
  and it rode into a plan, a cycle record and a queue item before a
  scripted re-count caught it. If the number will be written down,
  compute it — the same output you are looking at can be piped through
  something that counts.
- **When the number is a metric a GATE computes, take it FROM the
  gate's own command** — never your re-implementation of its rule (a
  scratch counter billed JSX comment lines the gate excludes and put
  four figures 2–7 lines high across the commit message, PR table, and
  queue item).
- **When a doc NAMES a command — as proof or as the method the next
  author will use — RUN it before committing, in the state the next
  author will be in.** An ERE pattern with a PCRE lookahead errors
  instead of matching; a burn-down queue told slices to size files with
  `make gui-budget` "which prints the offenders", but that gate reports
  only UNWAIVED violations and every listed file was waived — it prints
  `OK` and nothing else.
- **A check whose EXPECTED answer is zero cannot sit in an `&&` chain:
  `grep -c` exits 1 when it counts nothing.** Verifying an ABSENCE is
  exactly where this bites — `git log -1 --format=%B | grep -ciE
  'co-authored-by|claude' && git push` prints the reassuring `0` and then
  silently drops the push, because the successful verification is a
  non-zero exit. The chain simply ends; nothing says a step was skipped,
  and the missing effect is discovered later, if at all. Run an
  absence check as its own command, or terminate it (`|| true`) when it
  must stay in a chain — and treat any `&&` chain whose later steps
  produced no output as a suspected short-circuit rather than a no-op.
- **"No job ran" is not "nothing was broken", and a PR reporting zero
  checks is the easiest green there is to misread.** `ci.yml` skips its
  whole matrix when every changed path matches `paths-ignore`, on the
  premise that markdown cannot redden a gate. Three of those paths are
  read by the site — `docs/engine/**` (projected onto `/reference/`),
  `CHANGELOG.md` (which versions the site may pin) and `README.md` (the
  generated gallery) — so two markdown-only PRs in a row moved `main`
  past a gate nobody had run. What caught it was a cycle re-running
  `make verify:site` locally after merging `main` into its branch; no
  amount of reading the PRs would have. `site-docs.yml` now covers
  exactly those paths, and the durable habit is the one that found it:
  after merging `main` into a branch, re-run the gates for whatever the
  INCOMING commits touched, not only for your own diff.
  **A commit-message marker cannot rescue this** — the reflex is to reach
  for a `[run-site]` — because path filters are evaluated against the
  EVENT: a filtered-out workflow never starts, so nothing is running to
  read one. Markers can only ever SKIP (`[skip ci]`), never start.
- **A gate run through a pipe reports the PIPE's exit code, not the
  gate's.** `make <gate> 2>&1 | tail -40` exits 0 because `tail` exited
  0 — the gate underneath may have failed, and the harness reports
  "completed (exit code 0)" either way. Never let a green exit code
  from a piped run back a "gates pass" claim. **Use the check-a-result
  targets instead of piping**: `make verify:gui` / `test:engine` /
  `budget:gui` … or `make quiet T=<any target>` (grid in
  [CONTRIBUTING.md](../../../CONTRIBUTING.md)). They print one PASS/FAIL
  line, exit with the gate's real code, and keep the full log — so a
  failure is `cat .make-logs/last-error.log`, not a re-run to find where
  it died.
- **Count with `wc -l`, never by eyeballing a listing** — piped through
  `head` (a "20 bundled templates" claim was the author's own 20-line
  cap; the real number was 24) or in full (an eyeballed 60 over a
  59-line listing). **This bites hardest when the count is used to call
  an EXISTING doc STALE**: the doc was right, and "correcting" it writes
  the wrong number in. Before declaring a recorded number wrong, compute
  it at the recorded state — `git stash`, run the counter, `git stash
  pop` — and diff the two sets rather than the two totals.
- **Cross-check any count that decides something with a second
  method.** `git grep <sym> | wc -l` counts `Binary file <path>
  matches` as a hit (a call-site census manufactured a phantom
  regression); a hand-rolled regex over multi-line source matched 1 of
  4 dep arrays. When a sweep's answer gates a decision, list the
  matches and read them.
- **Counting a language construct needs an ANCHORED pattern — a bare
  substring silently counts its own name inside other identifiers.**
  `grep -c "it("` over a test file also matches `fireEvent.submit(`,
  reporting 16 cases in a suite of 14. Anchor to the construct's
  position (`grep -cE "^[[:space:]]*it\("`), or take the number from
  the runner's own per-file output (`✓ <file> (14 tests)`) — which is
  the second method the rule above asks for anyway. **The two numbers
  legitimately differ under `it.each`**: one anchored site generates a
  case per table row (29 sites, 48 cases in one suite), so the anchored
  count measures SITES and only the runner measures CASES — quote
  whichever the claim is about, and say which. **The same trap in Rust
  is `grep '<Type> {'` to count CONSTRUCTORS**: it also matches the
  `pub struct <Type> {` declaration and every `fn … -> <Type> {`
  signature, whose body brace is indistinguishable. A plan sized "13
  literal constructors to fix" that way; 7 were real, the other 6 being
  three declarations and three signatures. Anchor to an assignment or
  call position, or list the matches and read them — which is what the
  rule two bullets down asks for anyway.
  **Over-anchoring is the same failure with the opposite sign, and the
  tell is two of your own measurements disagreeing.** Counting one
  attribute across a crate went 93 → 90 → 92 in three attempts: the bare
  substring billed the DOC COMMENT that quotes the attribute, and the
  `^`-anchored pattern then missed the two occurrences that are INDENTED
  inside a nested item. Only "allow leading whitespace AND exclude
  comment lines" is the real count. Neither wrong answer looks wrong on
  its own — each is a plausible number from a plausible command — so the
  rule is procedural: when a count matters, measure it twice by
  DIFFERENT means and reconcile the difference before writing it down.
  The same shape appears over JSON: counting `description` keys in a
  schema document reported three stray nodes that were wire keys
  literally NAMED `description`, whose value is a subschema rather than
  a string. A keyword and a property name are the same token; only the
  VALUE tells them apart.
- **CORRECTING a falsifiable claim is where it most often stays
  falsifiable: re-run the grep and write the claim from its FULL
  output**, never from the one instance you remember (a review narrowed
  "no `??`/`?.`" to "the one that remains is X" while the grep on
  screen listed three more; the fresh reviewer falsified the corrected
  sentence one stage later). A claim that enumerates ("the only",
  "exactly N", "all of them") is a set claim: paste the set from the
  command, or weaken to the invariant you can prove.
- **Grouping things into a NEW module tempts a shared-property summary
  that only some members have — verify it per MEMBER.** A `choiceFields`
  module's header said all three widgets are "controlled,
  commit-on-change"; two were. A wrong MECHANISM claim outranks a wrong
  count: it tells the next author an unsafe addition is safe.
- **A structural claim ALREADY in a doc becomes yours the moment your
  change touches its subject** — a refactor falsified a code-map
  sentence ("the wiring hooks never import each other") the diff never
  went near. When a change alters an area's shape, re-prove the
  invariants that area's map asserts.
- **A claim about an artifact your own tooling will PRODUCE is
  measurable in seconds — produce it before you argue from it.** The
  external-system rule below is about evidence you cannot reach; this is
  its opposite and it is easier to get wrong, because the artifact does
  not exist yet and the claim feels like a prediction rather than a
  measurement. A design choice was put to the user partly on the grounds
  that a real `git subtree split` history would show "a repository with
  history" on the package page; the split, run locally later in the same
  cycle, produced **7 commits on main and one at the release tag**, since
  a split keeps only the commits that touched the subdirectory. The
  decision survived on its other merits (stable shas, real ancestry,
  fast-forward pushes) and the overstatement had to be corrected after
  the fact. When an OPTION's selling point is a property of something a
  command can generate now, generate it first — the cost is one command
  and it moves the claim from prediction to measurement.
- **A claim about an EXTERNAL system's behaviour has no grep that can
  falsify it — check it against the real thing, or do not write it.**
  The sweep discipline above all assumes the evidence is in the tree; a
  sentence about what a registry renders, what a CI provider skips, or
  what a viewer displays is confidently written from memory and passes
  every gate green. A changelog entry asserting "the four registries
  that render a package README" shipped as far as the review before one
  fetch of a real package page showed a fifth one does. The tells are
  the same set-claim words (`the only`, `exactly N`, `all of them`)
  pointed at something outside the repo: either fetch the page and
  count, or weaken the sentence to the part the tree can prove.
- **A doc claim that a GATE enforces something is checked against the
  gate**: a code-map line called a convention "a test-visible rule"
  while no test enforced it — worse than a wrong count, because it
  tells the next author they are protected. Name the command that holds
  the rule, or add the gate; never assert one that does not exist.
- **This repo keeps live git WORKTREES under `.claude/worktrees/`, and an
  unfiltered `grep -rn` reads them as if they were the tree you are
  measuring.** They are real checkouts at other commits (git-excluded, so
  `git status` never mentions them), which means a recursive sweep
  DOUBLE-reports every doc and can hand you a hit in a file that was
  deleted from `main` cycles ago — one sweep surfaced a retired
  per-topic backlog file that no longer exists, which reads as a stale
  cross-reference to go fix. Exclude by PATH on every repo-wide sweep
  (`--exclude-dir=worktrees`), and when a "stale reference" turns up in a
  file you did not expect to exist, check its path before editing it.
  `git worktree list` is the one-line confirmation.

## A behaviour fix needs a NEGATIVE control, and it must not cost you the fix

A test written alongside a fix is not evidence the fix does anything.
Both halves of that have bitten here.

- **A GATE needs the same control, and a green one is not evidence it
  LOOKED at your change.** `make deny` printed PASS over a dependency it
  never traversed: `cargo deny check` does not walk an optional
  dependency that no enabled feature turns on, so adding one behind a
  non-default Cargo feature is invisible to it. The PASS was not wrong
  about anything — it was about a graph the new crate was not in. The
  control that settled it took two runs: a crate whose licence the
  allowlist REJECTS (`webpki-roots`, CDLA-Permissive-2.0) passes this
  gate as an optional dep, and fails it the moment it is made
  non-optional. `--all-features` is the fix, and the same probe proves
  the fix reaches. The lesson is not about cargo-deny: **when a phase's
  job is to get an answer FROM a gate, make the gate fail on purpose
  before believing its pass.** It cost nothing here and turned up a hole
  that had been open for as long as `engine/napi`'s feature-gated N-API
  dependencies had existed — shipped inside the npm package, never
  licence- or advisory-checked.
  The mirror-image duty applies to a gate you SHIP: a doc sentence
  saying `make <new-gate>` fails on drift is a claim about the gate, and
  observing only its PASS does not check it. Perturb the artifact,
  watch the gate go red, read the message it prints (it should name the
  fix), and restore — with a COPY, per the rule three bullets down.

- **Assert the number the fix CHANGED, not a number nearby.** A test for
  "an `fr` grid row must subtract the auto row above it" asserted the
  rows' y OFFSETS — which were identical before and after, because the
  auto row was always folded to its tallest child afterwards. It passed
  on the unfixed engine. What actually changed was the row's SIZE, and
  the only way to see a track's size from the outside was what fits in
  it: a 70pt child clean, a 71pt one overflowing. When a fix's effect is
  a size, an internal budget, or anything the output does not print, ask
  what observable value differs — if you cannot name one, the test you
  are about to write is decoration.
- **Then prove it: neutralize the fix and watch the test go red.** One
  line is enough (`+ auto_sum` → `+ auto_sum * 0.0`), and it is the
  difference between "my test passes" and "my test tests". Do this
  BEFORE committing, while the neutralization is trivial to undo.
- **A control that FAILS is telling you the PROBE is broken — and a probe
  that changes nothing looks exactly like a fix that works.** The
  companion-control rule above says a control must be able to fail; the
  other half is that when it DOES fail, the experiment is void rather
  than informative. Three probes in one sitting, each a different way for
  the mechanism to be wrong while the output looked like an answer:
  a sabotaged COPY of a script run from `/tmp`, which resolved its repo
  root elsewhere and died before reaching the thing under test (red, for
  the wrong reason); the same copy moved INSIDE the repo, where the
  scanner it belonged to then scanned it, so the control went red too;
  and a sabotage written `[ "$f" = X ] && false || cmd`, which still runs
  `cmd` — `A && false || B` always reaches `B` — so the gate stayed green
  having been changed in no way, and "the fix works" was about to be
  concluded from a probe that did nothing. Run the control every time,
  expect it to PASS, and treat a red control as "measure the measurement"
  rather than as a second finding. Prefer sabotaging the real file in
  place and restoring it (with a copy, per the next bullet) over
  experimenting on a duplicate, which changes the path and can change
  what the tool under test sees.

- **Undo the experiment with a COPY, never with git.** `git checkout
  <path>` restores the file from HEAD, which silently deletes every
  uncommitted change in it — a whole feature's wiring vanished that way,
  mid-negative-control, and had to be re-applied from scratch. `cp
  file /tmp/backup` first and `cp` back after; git's undo verbs are for
  committed history, not for a two-minute experiment on live work.

## A background watcher's silence is not a result

A background task that finishes notifies you. A task whose exit
condition never fires does not — it keeps running, and nothing in the
conversation says so. Both halves of that have shipped here.

- **A `while ! grep -q …; do sleep 30; done` spun for three and a half
  hours** after the run it was watching had finished, because the
  anchored pattern never matched the actual bytes — the line's `FAIL`
  carries a terminal colour escape. It cost nothing and it was
  invisible; it was
  found because the user asked. **Validate a grep pattern against the
  ACTUAL bytes of the output** (escapes, colour codes, `\r`), never
  against what the line looks like on screen — and prefer a condition
  that cannot silently never-fire, e.g. a job's own `conclusion` over a
  grep of its log.
- **A watcher also dies with the session that started it, and reports to
  nobody.** A poll waiting for a Maven Central repo1 mirror sync was
  never heard from again; the sync had in fact landed, and the state
  went unrecorded until someone re-asked the URL directly. So: **no
  report is not "not yet" — it is no information at all.** Two rules
  follow. Record any background watcher where a later reader can
  reconcile it against reality, with its STOP CONDITION written down and
  not just its command (a row naming only the command cannot show that
  the condition never fired). And when you actually need the answer,
  **re-ask the source** — one `curl`/`gh` call now beats waiting to be
  told by something that may already be dead.
- The reconciliation, at any cleanup:
  `ps aux | grep -E "[t]ail -f|[g]make|[c]laude -p"`. A process with no
  record, or a record with no process, is the finding.

## A substring assertion needs a fixture the substring can only come from

- **`not.toContain('data:')` over a fixture whose value IS a `data:` URI
  tests the fixture, not the code.** A quick-fix test asserting that the
  `data:` KEY had been removed used an image whose `src` was
  `"data:image/png;base64,…"`, so the substring survived every correct
  removal and the case went red against working code. The same family as
  a `grep "it("` that also bills `emit(`/`edit(`: before writing a
  contains/not-contains assertion, ask where else in the fixture that
  sequence of characters can appear, and pick a fixture where the answer
  is nowhere (here: `src: logo.png`). A structural read is better still
  when one is available.

## Binary-classified files: the grep blind spot

- **A zero-hit grep over a NARROWED path is evidence about the path, not
  the repo.** A review concluded a code-map claim was false ("a binary
  test pins the absence of this flag") because the search covered
  `engine/cli/src/tests/` and a `engine/cli/tests/*.rs` glob — while the
  test sat in `engine/cli/tests/bin/sign.rs`, which neither reached. The
  claim was true, and the "correction" would have replaced an accurate
  pointer with a wrong one. Before calling a doc claim false, widen to the
  whole repo (`grep -rn <subject> .`) and only then narrow to explain the
  hit; a glob that silently matched no files is the same failure as one
  that matched the wrong ones.
- **Verify a zero-hit grep with a second tool before acting on it.** A
  source file holding a raw control byte is classified BINARY, and
  ugrep-style shims grep with `-I` (skip binary), so the file is
  silently ABSENT from every recursive search — `file <path>` printing
  `data` instead of `text` is the tell. A census that comes back one
  short is this, not a miscount. A "dead" conclusion needs two tools or
  an opened file; and dynamically COMPOSED keys
  (`` `palette.type.${name}` ``) never appear verbatim in any grep.
- **You can CREATE one by writing a byte-oriented fixture, and no gate
  objects.** Every entry above is about DETECTING a binary-classified
  file; this is the authoring side. A WebP sniff test whose RIFF length
  field was typed as literal NUL bytes rather than as escapes turned the
  whole test file binary from that moment on. The bytes were correct, so
  vitest passed, and fmt / lint / coverage have no opinion about a NUL —
  meanwhile the file left `grep -rn` and `git diff`'s content view
  entirely, and `git diff --stat` reported it as `Bin <n> -> <m> bytes`.
  It surfaced only because a later step enumerated that suite's test
  titles FROM THE DIFF and this file contributed none. The risk is
  highest in exactly the tests that need such bytes — magic numbers,
  length fields, separators — so spell them as escapes (`\u0000`) or
  build them with a byte array, and treat "a file I just edited shows no
  diff content" as this until proven otherwise (`git diff --numstat`
  prints `-` in both columns for it).
- **A PIPE hides it completely**: `git show <rev>:<file> | grep …` has
  no filename to report, so grep prints NOTHING — not even "Binary file
  matches" — and an empty result reads as "that line is gone".
  Reviewing against a pre-fix revision is exactly when this bites. Use
  `grep -a`, or read the blob with a tool that does no binary
  detection.
- **A special character typed into a tool call may not survive as
  itself — so a checker that spells it literally can LIE about work that
  is correct.** A showcase code panel must be indented with NBSP
  (U+00A0); the generator's `NB = " "` transported fine and the file was
  right, but the *verifier* written moments later in a separate call had
  its `NB` arrive as an ordinary space, so `line.startswith(NB)` reported
  `0 NBSP-indented lines` over a file that had six — and the correct work
  was reverted on the strength of it. The tell is a second signal
  disagreeing: the file's own byte count (`perl -ne '/\xc2\xa0/'`) had
  gone 168 → 174, i.e. exactly the six lines the checker denied. Name any
  such character by CODE POINT (`"\u00a0"`) on both sides — in the writer
  and in the check — and prefer a byte-level probe (`perl`, `grep -c`)
  over an in-language literal for the verification. Before reverting on a
  checker's say-so, confirm with a tool that reads bytes: a
  disagreement between two measurements is a measurement bug until proven
  otherwise, and reverting is the expensive direction to be wrong in.
- **Writing the escape is where the byte gets in**: an editing tool
  hands the file whatever your content literally contained, so a
  `\u0000` typed into tool-call content can land as a RAW NUL. **This is
  not only a fixture problem — PRODUCT code hits it through a
  character-class regex**: a template-name guard written as
  `/[\x00-\x1f\x7f]/` is semantically right and can still land as raw
  bytes, which makes the whole source file binary-classified and absent
  from every later grep of it. `file <path>` printing `data` instead of
  `text` is the tell, and it is worth running over any new file whose job
  is to REJECT control characters. **It reaches PROSE the same way** — a
  cycle record quoting that very regex went binary-classified, so every
  later `grep` of the cycle's own state came back empty and read as
  "not present". Anything that WRITES about control characters is a
  candidate, not just anything that matches them. Never
  trust the source of a control-character literal: write it, then
  convert (`perl -pi -e 's/\x00/\\u0000/g'`) and sweep the tree before
  committing
  (`find … -print | xargs perl -ne 'print "$ARGV\n" if /[\x00-\x08\x0b\x0c\x0e-\x1f]/'`,
  printing the file count it read first). Probing for NULs needs perl,
  not `grep $'\x00'` — bash truncates that pattern to empty and the
  grep then matches every line.
- **The byte can land where you typed an ORDINARY character, in a file
  that has nothing to do with control characters — and then it hides the
  file from the PR DIFF, not just from grep.** Both narrowings above are
  too generous: it is not only the ESCAPE that carries the risk (a
  plainly-typed space came back as `0x00` twice in a row, in the same
  string literal), and the candidate set is not just files that match or
  describe control characters (this one joined two strings to build a
  dedup key). Treat ANY file written through a tool call as a candidate.
  The consequence nobody had paid for yet is the expensive one: git
  classifies the file as binary, so `git show --stat` prints
  `<file> | Bin 0 -> N bytes` and **the file never renders in the pull
  request at all** — GitHub says "Binary file not shown". A reviewer can
  approve a change having been shown none of its central logic, which is
  precisely what happened: a 182-line module, the whole subject of its
  PR, went up unreadable and only a review reading the working tree
  instead of the diff caught it. Two guards, both cheap:
  **check `git diff --stat` for `Bin` before opening a PR** (the tell is
  unmissable once you look for it), and prefer a construction with no
  separator character to get wrong — `JSON.stringify([a, b])` rather
  than joining on a delimiter, which is the right answer anyway when the
  parts are document-derived and could contain that delimiter.

## Claims that live outside prose

- **A limitation you are RETIRING is written in the retired sentence's
  words, not in the new feature's.** Shipping `visible:` made
  `page_break.md`'s "no keys beyond `id`: … and no conditional break" false.
  The subject sweep for the new spellings (`visible`, `collapse`) hit 33 and
  24 doc files respectively and did not surface it, because the stale
  sentence contains neither word. Grep the CLAIM being retired
  ("conditional", "not supported", "cannot"), not the key that retires it —
  by definition the new key appears nowhere yet, which is exactly why a
  sweep keyed on it reads clean.
- **A CODE COMMENT asserting a limitation is a falsifiable claim, and it is
  the one nobody greps.** A panel shipped with "the panel has no handle on
  the enclosing array from a selected child … so the gap is a narrower
  picker, never a wrong write." A helper doing precisely that existed and was
  used by five other files, and the write really was wrong. Both halves were
  checkable in one grep. The comment is worse than silence: it explains why
  the defect is safe, so the next reader stops looking. Any comment
  containing "no way to", "has no handle on", "cannot" gets the same grep a
  doc claim would.

## A backgrounded watcher's exit code is the WRAPPER's, not the command's

`gh pr checks --watch` exits 8 when a check fails. Wrap it to record that —

```sh
gh pr checks 121 --watch > ci.log 2>&1; echo "GH_EXIT=$?" >> ci.log
```

— and the SHELL's exit code becomes the `echo`'s, which is 0 whatever `gh`
did. A harness that reports "completed (exit code 0)" is reporting the
wrapper. One cycle read that notice as "CI is green" and said so to the user;
three checks had failed, and the log's own `GH_EXIT=1` line said so.

**A PIPE does the same thing, and a backgrounded one is worse.** CLAUDE.md
already forbids piping a gate (`make … | tail`) because the pipeline reports
the LAST command's status. In the foreground that costs you a glance at the
output; backgrounded, the harness announces *"completed (exit code 0)"* as a
task result, which reads as a verdict rather than as a shell artifact. One
cycle backgrounded `gmake quiet T=site 2>&1 | tail -20`, was told it had
completed successfully, and the gate had exited 2 with a failing test — the
`FAIL` line was sitting in the captured output the whole time. Run gates
unpiped, and when a background task reports success, read its log before
repeating the claim.

**Judge a PR by asking GitHub, never by the watcher's completion:**

```sh
gh pr view <n> --json mergeStateStatus,statusCheckRollup \
  -q '.mergeStateStatus, ([.statusCheckRollup[] | select(.conclusion != "SUCCESS" and .conclusion != "NEUTRAL")] | length)'
```

## A CONFLICTING PR reports ONE green check and the watcher exits 0

When a PR conflicts, `pull_request` has no merge commit to build, so no
Actions job runs at all. Only the non-Actions integrations report — here a
single Cloudflare Pages check — and `--watch` sits on that one green line and
exits 0. It is indistinguishable from "everything passed" unless you look at
the count or at `mergeStateStatus` (`DIRTY` / `CONFLICTING`).

Same shape, different cause, as the `paths-ignore` case already in the cycle
skill: **fewer checks than the diff deserves is the signal.** Read
`mergeStateStatus` before believing a green watcher.

## `-c commit.gpgsign=false` silently fails the merge bar

`main`'s ruleset requires `required_signatures`, and the repo config already
sets `commit.gpgsign true`. Overriding it per-commit (a habit from
environments where signing prompts) produces a PR that passes all 33 checks
and still reports `mergeStateStatus: BLOCKED` with an EMPTY `reviewDecision` —
which reads as "waiting for a review", not "unsigned".

`git log --format='%h %G? %s'` shows the truth: `N` for unsigned, `G` for a
good signature. The fix is `git commit --amend -S` (the agent usually has the
key unlocked already) and a force-push; the tree is unchanged, so CI simply
re-certifies the same content.
