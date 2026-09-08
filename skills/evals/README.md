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

## Writing a case

Aim it at a decision, not at a phrase. A grader that greps for the rule's
own wording passes whenever the model quotes the skill back, which is the
one thing a loaded skill will always do. The graders worth writing ask what
the answer DID: which tool it reached for, which library it refused, what it
put in the file it wrote.

Pair a judgment (`llm`) grader with a mechanical one where you can. But a
`tool_used: Skill` grader alone does **not** prove the skill under test fired:
the sandbox carries the operator's own skills too, and a name-only match is
satisfied by any of them. Give it an `input_match` naming the skill.

Every case here sets `runs: 1` rather than the official default of 3. That is a
COST choice, not a quality one: one `llm` verdict on one sample is a weak
signal, so treat a single red run as a reason to re-run with `--runs 3` before
concluding anything about the skill.

When a grader fails, read the transcript it scored: `make skills:eval` writes
one per run under `results/<timestamp>/`, and the failing line names the
directory. The two mistakes below are both ones you can only SEE in the
transcript — the score alone is consistent with either reading.

**A `not_contains` pattern is scored against the whole transcript, and the
transcript contains the PROMPT.** If the thing you are forbidding also appears
in the prompt — showing the model a bad example to see whether it copies it —
the grader cannot tell "wrote it" from "quoted it while refusing". Forbid
something only a wrong answer would produce, or check the shape of the output
instead.
