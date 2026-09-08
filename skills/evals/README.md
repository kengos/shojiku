# Eval cases for the product skills

One case per skill under `skills/`, each aimed at a rule that skill exists
to enforce — not at whether the sentence is PRESENT (a grep proves that),
but at whether a session that loads the skill makes the decision the rule
forces.

`make skills:verify` validates every case here and fails when a skill has
neither a case nor an exemption. It never calls a model.
`make skills:eval` runs them for real, and is not a gate.

A case is a directory holding `case.yaml` and `graders/*.md`, in the format
`claude plugin eval` itself defines — its key names (`match:`, not `mode:`;
`min`/`max`, not `count`), its six grader types and its numeric bounds. Every
variant of that schema is `.strict()`, so a key it does not know is an error
here too. **The point of that is that these CASES survive**; `scripts/skill-eval.py`
is the part that would be replaced. What it does NOT do is listed in that
script's docstring, and is worth reading before assuming a case will load
elsewhere unchanged.

## Writing a case that measures something

**Where this evidence comes from.** The incidents below are from the
DEVELOPMENT-skill suite — `~/shojiku-work/skill-evals`, run by
`make skills:eval-dev` — which is larger and has been run more. This tree's
five cases are named where they are the example. The advice transfers; the
anecdotes are not from here, and saying otherwise would send you looking for
a commit-message case among these five.

First, the thing that decides whether a case is worth writing at all: **aim
it at a DECISION, not at a phrase.** A grader that greps for the rule's own
wording passes whenever the model quotes the skill back, which is the one
thing a loaded skill will always do. The graders worth writing ask what the
answer DID — which tool it reached for, which library it refused, what it put
in the file it wrote — and pair a judgment (`llm`) grader with a mechanical
one wherever both are possible.

### 1. Check the skill FIRES. Everything else is downstream of this.

In one full ablated run of the development suite, five cases scored 0.00 and
two scored 1.00. Of the five cases carrying an indicator that can answer the
question, **three showed the model had never loaded the skill, and all three
scored 0.00; the two where it did load scored 1.00.** All three reproduced
`0x` on a second independent sample.

(Two further cases scored 0.00 with **no** indicator, so why they failed is
unknown — which is itself the argument for this step. Do not read the
correlation as "every zero is a non-firing skill"; read it as "a zero means
nothing until you know whether the skill was there".)

A rule inside a skill that never activates is inert however well written, and
no other grader in the case can tell you it happened. So give every case
this, and read it before you read the score:

```
---
type: tool_used
tool: Skill
input_match: <the skill's own directory name>
arm: with-only
---
```

Both keys are load-bearing. `input_match` because the sandbox also carries
whatever skills the operator's `~/.claude` provides, so matching the tool
NAME alone is satisfied by any of them. `arm: with-only` because without it
the indicator SCORES: it is false by construction on the no-skill arm, which
caps that arm and inflates the ablation delta by up to +0.5 — enough for a
case that measures nothing to escape the `MEASURES NOTHING` flag.

**When a skill does not fire, the case is not the problem.** Look at the
skill's `description:` frontmatter and ask whether it advertises the thing
you are prompting about. One skill owning the commit-message rules described
itself in terms of Dockerfiles, CI and versioning, and never fired on "write
the commit message".

### 2. Put the PRESSURE in the prompt

A rule exists to beat something. If that something is absent, both arms pass
for the same empty reason and the case measures nothing.

A rule forbidding attribution trailers exists to beat the convention in
`git log` — and the sandbox has no `git log`. With a bare "write a commit
message" that case scored 1.00 with the skill and 1.00 without. The
counter-evidence has to be IN the prompt.

Ask of every case: *what would make a careful model get this wrong?* If
nothing in the prompt pushes that way, you are testing the base model.

### 3. Make the prompt self-contained

The sandbox has **no repository, no engine, no rendered output and no git**.
A prompt saying "I have staged a change" earns a clarifying question rather
than an answer, and graders then pass vacuously on a transcript with no
answer in it. Paste the diff, the schema, the code.

(The sandbox is not bare: it holds the skill's whole directory, so a skill
shipping `template/` assets has those too, and the operator's own skills are
present alongside.)

This is what makes some skills legitimately unevaluable here: one whose
subject IS a rendered page or a running browser can only be asked to recite
its checklist, which a grep already proves. Those get an `exemptions.yml`
entry carrying the reason.

### 4. Know what each grader can and cannot see

| type | sees | the trap |
| --- | --- | --- |
| `regex` | the model's OUTPUT — not the prompt | `target:` validates and is ignored; every regex scores the whole transcript |
| `tool_used` | tool name + input | a bare name matches any skill — use `input_match`; the trace records ATTEMPTED calls, so it can pass on one the permission layer denied |
| `tool_order` | the call sequence | — |
| `file_exists` | a path resolved inside the **sandbox temp dir**, which is deleted after the run | a repo-relative path is always false |
| `llm` | the transcript, judged against `criteria` | one judge verdict on one sample |
| `baseline` | — | validated, never executed here |

**The prompt is NOT in the transcript.** Only assistant text and the final
result are, so a `not_contains` pattern cannot be tripped by an example you
put in the prompt as pressure — which means step 2 is free, and an anchored
pattern buys nothing over a plain one.

### 5. Read the DELTA, not the score

`ABLATION=1` runs each case again with the skill removed. A case scoring the
same both ways is measuring the model, and the runner says so
(`MEASURES NOTHING`).

That is not a failed case — it is a true and useful answer. It means the rule
is not carrying weight on that prompt, so either find the prompt where it
does, or accept that the skill is confirming an instinct rather than creating
one. `rust-security-sees-quadratic-input` is the worked example: the skill
demonstrably loaded, and the base model refuses the quadratic parser anyway.

Apply step 1 before believing any such verdict. A case with no indicator that
scores equal on both arms may simply have had the skill absent from both.

### 6. When a grader fails, read the transcript before believing it

`<cases>/results/<timestamp>/` holds the prompt, transcript and tool trace
for every run, and the failing line names the directory. Two defects in this
suite's own history were found there and were invisible in the score: one
case passed because no answer was produced at all, and one failure was read
as the model quoting the prompt when the transcript showed it had written the
forbidden thing itself.

Cases are `runs: 1` for cost. One judge verdict on one sample is a weak
signal — re-run before concluding anything about a skill.
