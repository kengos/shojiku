#!/usr/bin/env python3
"""Eval suite for this repository's skills — validate the cases, and run them.

A skill is a page of rules. Nothing in this repository could say whether a rule
still WORKS: a grep proves the sentence is present, and presence is not the
question. The question is whether a fresh session that loads the skill makes
the decision the rule exists to force, which until now was answered by hand,
one cycle at a time, by a zero-context relay reviewer.

This script is the two halves of answering it mechanically, and they are
deliberately different targets because a GATE CANNOT CALL A MODEL:

  check      parse every case, validate it against the schema `claude plugin
             eval` itself enforces, check every grader is well-formed, and
             check the case tree COVERS the skill set. Deterministic, free,
             offline — this is `make skills:verify`, and it runs in CI.

  run        actually put each case's prompt to a fresh agent that has the
             skill and nothing else, then score the transcript with the case's
             graders. Costs money, calls a model, is not deterministic — this
             is `make skills:eval`, and it is NOT a gate and NOT in CI.

  selftest   run `check` over known-good AND known-bad fixtures, asserting
             each rule both fires and stays quiet. Runs BEFORE the real tree,
             so a detector that rejects everything (or nothing) fails on the
             fixture instead of silently passing the repo.

The case format is the one `claude plugin eval` defines — `case.yaml` (or
`prompt.md`) plus `graders/*.md`, its key names, its six grader types, and its
numeric bounds. Every variant of that schema is `.strict()`, so a key it does
not know is an error here too. That command is early-access and refuses to run
on this account today.

**What the mirroring buys is that the CASES survive; this script is what would
be replaced.** An earlier draft of this file claimed migration was "deleting
this script" — that was written while the graders said `mode:` where the schema
says `match:`, and `count:` where it says `min`/`max`, so every grader in the
suite would have been REJECTED by the runner it claimed to mirror. The claim is
now true of the key names and false in the ways listed next, which is why they
are listed rather than summarised.

Deviations from the official runner, all in the safe direction:

  * `baseline` graders are validated but not EXECUTED (`--ablation` below is
    what stands in for the with/without arm), and `mocks/` is not supported at
    all.
  * `max_turns` is validated against the official bound and then not enforced:
    this CLI exposes no `--max-turns` flag.
  * `prompt.md` is read as a plain body; the official spelling allows
    frontmatter on it.
  * a `regex` grader's `target` key validates (the official schema has it) and
    is IGNORED: every regex is scored against the whole transcript. An author
    reaching for `target` to narrow the match gets a key that does nothing.

  * `scaffold_script` is validated and NEVER executed. The official runner
    hides it behind `--scaffold` because it runs author-supplied bash as you.
    This one has no such flag: a case carrying the key is refused, in all three
    places an author might put it.
  * `llm` graders ARE executed, as a second model call judging the transcript.
    It is the only grader that can answer "did it make the DECISION", which is
    the whole point of the suite.

No author-supplied code is ever executed, `yaml.safe_load` is the only loader,
symlinks anywhere in a case tree are refused, and `check` neither opens a socket
nor spawns a process — the imports that could are local to `run`.

**What the sandbox does NOT isolate, stated because it was claimed otherwise.**
`--settings` MERGES with the operator's user settings rather than replacing
them, so the sandbox carries whatever skills that config provides — measured at
22, of which one was the skill under test. `--restricted` would drop them and
also hides the skill under test; `--bare` would drop them and cannot
authenticate. Neither is usable, so **an eval score depends on the operator's
`~/.claude` configuration**, and "a fresh agent that has the skill and nothing
else" is not true of this runner. What IS removed is the operator's MCP servers
(see `_invoke`), because those were a live external-service surface reachable
from author-supplied prompt text. A `tool_used` grader that needs to prove the
skill UNDER TEST fired therefore needs `input_match`; the tool name alone is
satisfied by any of the others.
"""

import argparse
import fnmatch
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - exercised by the dependency check
    sys.stderr.write(
        "skill-eval: PyYAML is required (the cases are YAML).\n"
        "            Fix: python3 -m pip install --user pyyaml\n"
    )
    raise SystemExit(1)

GRADER_TYPES = ("regex", "tool_order", "tool_used", "file_exists", "llm", "baseline")
EXECUTABLE_GRADERS = ("regex", "tool_order", "tool_used", "file_exists", "llm")
REGEX_MATCHES = ("contains", "not_contains")
ARMS = ("with-only", "both")
JS_FLAGS = re.compile(r"^[dgimsuvy]*$")
TOOL_NAME = re.compile(r"^[A-Za-z0-9_-]+$")
VERSION = re.compile(r"^\d+(\.\d+)*$")
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SUPPORTED_MAJOR = 1

# The key tables ARE the official schema's, because the mirroring is the whole
# reason this format was chosen: a suite written to a bespoke shape would have to
# be REWRITTEN the day `claude plugin eval` opens up, not migrated. Every
# variant of that schema is `.strict()`, so an unknown key is an error there and
# is an error here. Recovered from the CLI binary; the divergences this runner
# still has are listed in the module docstring, not papered over.
CASE_KEYS = frozenset({"schema_version", "name", "description", "plugins",
                       "expected_outcome", "tags", "runs", "execution", "context",
                       "skill"})
EXECUTION_KEYS = frozenset({"prompt", "model", "artifact_publish", "env",
                            "append_system_prompt", "growthbook_overrides",
                            "max_turns", "timeout_seconds", "allowed_tools"})
CONTEXT_KEYS = frozenset({"history_file", "scaffold_script", "add_dirs"})
GRADER_KEYS = {
    "regex": frozenset({"target", "pattern", "flags", "match"}),
    "tool_used": frozenset({"tool", "input_match", "min", "max"}),
    "tool_order": frozenset({"before", "after"}),
    "file_exists": frozenset({"path", "exists"}),
    "llm": frozenset({"criteria", "focus"}),
    "baseline": frozenset({"baseline_file", "criteria"}),
}
GRADER_COMMON_KEYS = frozenset({"type", "name", "weight", "arm"})
# Official numeric bounds. Without them a case can name a timeout the official
# runner rejects, which is the migration promise failing quietly.
BOUNDS = {"max_turns": (1, 200), "timeout_seconds": (1, 3600), "runs": (1, 50)}
# A pathological pattern would hang the gate: Python's `re` has no timeout. The
# cap bounds the author's room to do it by accident; it does not eliminate it.
MAX_PATTERN = 500
EXECUTABLE_GRADERS = ("regex", "tool_order", "tool_used", "file_exists", "llm")
JS_FLAGS = re.compile(r"^[dgimsuvy]*$")
TOOL_NAME = re.compile(r"^[A-Za-z0-9_-]+$")
VERSION = re.compile(r"^\d+(\.\d+)*$")
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
SUPPORTED_MAJOR = 1


class Problem:
    """One rule violation, carrying the rule id so the gate SAYS what it found.

    Every construction records the SOURCE LINE that raised it, because the
    self-test's completeness assertion is per detector BRANCH, not per rule id.
    One id covers several checks — R08 alone rejects a bad `flags`, a missing
    `pattern`, an over-long one and one that will not compile — so "every rule
    has a fixture" was satisfied by a tree that exercised one branch in four.
    """

    #: line numbers of the `Problem(...)` sites reached, when recording is on.
    fired = None

    def __init__(self, rule, where, message):
        self.rule = rule
        self.where = where
        self.message = message
        if Problem.fired is not None:
            Problem.fired.add(sys._getframe(1).f_lineno)

    def __str__(self):
        return f"{self.rule}  {self.where}\n      {self.message}"


def _unknown_keys(mapping, allowed, where, what, problems):
    """R19: refuse a key nobody reads. A typo that is merely IGNORED is worse
    than one that fails, because the case keeps scoring and stops meaning what
    it says."""
    extra = sorted(k for k in mapping if k not in allowed)
    if extra:
        problems.append(Problem("R19", where,
                                f"unknown {what} key(s): {', '.join(repr(k) for k in extra)} "
                                f"(expected one of: {', '.join(sorted(allowed))})"))


def _frontmatter(text, path, rule, problems):
    """Split `---` frontmatter from a body. Returns (mapping, body) or None."""
    if not text.startswith("---"):
        problems.append(Problem(rule, path, "no `---` frontmatter block"))
        return None
    parts = text.split("---", 2)
    if len(parts) < 3:
        problems.append(Problem(rule, path, 'unterminated frontmatter (opening "---" with no closing "---")'))
        return None
    try:
        meta = yaml.safe_load(parts[1])
    except yaml.YAMLError as exc:
        problems.append(Problem(rule, path, f"invalid YAML frontmatter: {exc}"))
        return None
    if not isinstance(meta, dict):
        problems.append(Problem(rule, path, "frontmatter is not a YAML mapping"))
        return None
    return meta, parts[2].strip()


def check_grader(path, problems):
    """Validate one `graders/*.md`. Returns the parsed grader, or None."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        # A directory named `x.md`, a permission error, a non-UTF-8 byte. Each
        # used to raise through as a traceback, which names no rule, so
        # `gate-culprits.sh` printed nothing and the contributor got a stack.
        problems.append(Problem("R24", path, f"grader is unreadable: {exc}"))
        return None
    meta_body = _frontmatter(text, path, "R06", problems)
    if meta_body is None:
        return None
    meta, body = meta_body

    gtype = meta.get("type")
    if gtype not in GRADER_TYPES:
        problems.append(Problem("R06", path, f'type must be one of {" | ".join(GRADER_TYPES)} (got {gtype!r})'))
        return None

    _unknown_keys(meta, GRADER_COMMON_KEYS | GRADER_KEYS[gtype], path,
                  f"{gtype} grader", problems)

    if not body:
        problems.append(Problem("R11", path, "expected_outcome body is empty — a grader with no stated pass criteria cannot be reviewed"))

    if "weight" in meta:
        weight = meta["weight"]
        if not isinstance(weight, (int, float)) or isinstance(weight, bool) or weight <= 0:
            problems.append(Problem("R12", path, f"weight must be a positive number (got {weight!r})"))

    if "arm" in meta and meta["arm"] not in ARMS:
        problems.append(Problem("R20", path, f'arm must be {" | ".join(ARMS)} (got {meta["arm"]!r})'))
    if "name" in meta and (not isinstance(meta["name"], str) or not meta["name"].strip()):
        problems.append(Problem("R21", path, "name, when present, must be a non-empty string"))

    if gtype == "regex":
        match = str(meta.get("match", "contains"))
        if match not in REGEX_MATCHES and not re.fullmatch(r"count:\d+", match):
            problems.append(Problem("R07", path, f"match must be contains | not_contains | count:N (got {match!r})"))
        flags = str(meta.get("flags", ""))
        if not JS_FLAGS.match(flags):
            problems.append(Problem("R08", path, f"flags must be JS RegExp flags (d g i m s u v y), got {flags!r}"))
        pattern = meta.get("pattern")
        if not isinstance(pattern, str) or not pattern:
            problems.append(Problem("R08", path, "regex grader needs a non-empty `pattern`"))
        elif len(pattern) > MAX_PATTERN:
            problems.append(Problem("R08", path, f"pattern is {len(pattern)} chars (cap {MAX_PATTERN})"))
        else:
            try:
                re.compile(pattern)
            except re.error as exc:
                problems.append(Problem("R08", path, f"pattern does not compile: {exc}"))

    elif gtype == "tool_order":
        for key in ("before", "after"):
            name = meta.get(key)
            if not isinstance(name, str) or not TOOL_NAME.match(name or ""):
                problems.append(Problem("R09", path, f"tool_order needs `{key}` as a tool name matching {TOOL_NAME.pattern}"))

    elif gtype == "tool_used":
        name = meta.get("tool")
        if not isinstance(name, str) or not TOOL_NAME.match(name or ""):
            problems.append(Problem("R09", path, f"tool_used needs `tool` matching {TOOL_NAME.pattern}"))
        for key in ("min", "max"):
            if key in meta:
                bound = meta[key]
                if not isinstance(bound, int) or isinstance(bound, bool) or bound < 0:
                    problems.append(Problem("R10", path, f"{key} must be a non-negative integer (got {bound!r})"))
        if isinstance(meta.get("min"), int) and isinstance(meta.get("max"), int) and meta["min"] > meta["max"]:
            problems.append(Problem("R10", path, f'min {meta["min"]} is greater than max {meta["max"]}'))

    elif gtype == "file_exists":
        if not isinstance(meta.get("path"), str) or not meta.get("path"):
            problems.append(Problem("R09", path, "file_exists needs a non-empty `path`"))

    if gtype == "baseline" and not isinstance(meta.get("baseline_file"), str):
        problems.append(Problem("R09", path, "baseline grader needs a `baseline_file`"))

    meta["_body"] = body
    meta["_path"] = path
    # `llm` and `baseline` carry their criteria in a `criteria` key officially;
    # in the .md spelling the body IS the criteria, so it fills in.
    meta["_criteria"] = meta.get("criteria") or body
    return meta


def check_case(case_dir, problems):
    """Validate one case directory. Returns the parsed case, or None."""
    case_file = case_dir / "case.yaml"
    prompt_file = case_dir / "prompt.md"
    case = {}

    if case_file.exists():
        try:
            loaded = yaml.safe_load(case_file.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            problems.append(Problem("R01", case_file, f"YAML parse failed: {exc}"))
            return None
        if not isinstance(loaded, dict):
            problems.append(Problem("R01", case_file, "case.yaml must be a YAML object"))
            return None
        case = loaded
    elif not prompt_file.exists():  # pragma: no cover - find_cases yields neither
        raise AssertionError("check_case reached a directory with no case definition")

    _unknown_keys(case, CASE_KEYS, case_dir / "case.yaml", "case", problems)

    version = case.get("schema_version")
    if version is None:
        problems.append(Problem("R02", case_dir, 'missing required field schema_version (e.g. "1.0")'))
    elif not isinstance(version, str) or not VERSION.match(version):
        problems.append(Problem("R02", case_dir, f"schema_version {version!r} is not a valid version string"))
    elif int(version.split(".")[0]) > SUPPORTED_MAJOR:
        problems.append(Problem("R02", case_dir, f"schema_version {version!r} requires a newer runner (this one supports up to {SUPPORTED_MAJOR}.x)"))

    context = case.get("context") or {}
    if isinstance(context, dict):
        _unknown_keys(context, CONTEXT_KEYS, case_dir / "case.yaml", "context", problems)

    execution = case.get("execution") or {}
    if not isinstance(execution, dict):
        problems.append(Problem("R03", case_dir, "`execution` must be a mapping"))
        execution = {}
    _unknown_keys(execution, EXECUTION_KEYS, case_dir / "case.yaml", "execution", problems)
    prompt = execution.get("prompt")
    if not prompt and prompt_file.exists():
        prompt = prompt_file.read_text(encoding="utf-8").strip()
    if not prompt:
        problems.append(Problem("R03", case_dir, "execution.prompt is required (a prompt.md body, or execution.prompt in case.yaml)"))
    if isinstance(context, dict) and context.get("history_file") and not execution.get("prompt"):
        problems.append(Problem("R04", case_dir, "context.history_file requires execution.prompt (the resumed session needs a next turn)"))

    # Official numeric bounds, so a case cannot name a value the official runner
    # rejects — which is the migration promise failing quietly.
    for key, (low, high) in BOUNDS.items():
        holder = case if key == "runs" else execution
        if key in holder:
            value = holder[key]
            if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
                problems.append(Problem("R22", case_dir, f"{key} must be an integer in {low}..{high} (got {value!r})"))
    if "name" in case and (not isinstance(case["name"], str) or not case["name"].strip()):
        problems.append(Problem("R21", case_dir, "name, when present, must be a non-empty string"))

    # `context` is where the official schema puts it; the other two are where an
    # author might reasonably try. All three are refused — a guard that checks
    # every place but the canonical one is the shape this rule shipped with.
    if any("scaffold_script" in m for m in (case, execution, context if isinstance(context, dict) else {})):
        problems.append(Problem("R14", case_dir, "scaffold_script is refused: this runner never executes author-supplied code"))

    graders_dir = case_dir / "graders"
    graders = []
    if not graders_dir.is_dir():
        problems.append(Problem("R05", case_dir, "no graders/ directory"))
    else:
        files = sorted(p for p in graders_dir.iterdir() if p.suffix == ".md")
        if not files:
            problems.append(Problem("R05", graders_dir, "graders/ holds no .md files"))
        for f in files:
            grader = check_grader(f, problems)
            if grader:
                graders.append(grader)

        seen_names = {}
        for g in graders:
            gname = g.get("name") or g["_path"].stem
            if gname in seen_names:
                problems.append(Problem("R23", g["_path"], f'grader name "{gname}" is already used by {seen_names[gname].name} in this case'))
            seen_names[gname] = g["_path"]

    if graders and all(g["type"] not in EXECUTABLE_GRADERS for g in graders):
        problems.append(Problem("R13", case_dir, "every grader is `baseline`, which this runner does not execute — the case can never be scored"))

    case["_dir"] = case_dir
    case["_name"] = case.get("name") or case_dir.name
    case["_prompt"] = prompt
    case["_graders"] = graders
    case["_execution"] = execution
    return case


def find_cases(cases_dir, problems):
    """Every case directory under the tree, refusing symlinks anywhere in it."""
    cases = []
    for root, dirs, files in os.walk(cases_dir):
        root_path = Path(root)
        for name in list(dirs) + files:
            if (root_path / name).is_symlink():
                problems.append(Problem("R15", root_path / name, "symlinks are refused inside a case tree"))
        if ("case.yaml" in files or "prompt.md" in files) and root_path.name != "graders":
            cases.append(root_path)
            # NOTE: `graders` is deliberately NOT pruned from `dirs`. Pruning it
            # stopped the walk descending, so a symlink inside it was never
            # checked while three places asserted "a symlink anywhere in the case
            # tree is refused". It is excluded as a CASE ROOT by name instead.
    return sorted(cases)


def list_skills(skills_dir):
    """Skill names in a skills directory. The population is `*/SKILL.md`."""
    if not skills_dir.is_dir():
        return None
    return sorted(p.parent.name for p in skills_dir.glob("*/SKILL.md"))


def check_tree(cases_dir, skills_dir, require_coverage):
    """Validate a whole case tree against a skill set. Returns (problems, report)."""
    problems = []

    if not cases_dir.is_dir():
        problems.append(Problem("R00", cases_dir, "case directory does not exist"))
        return problems, {}
    skills = list_skills(skills_dir)
    if skills is None:
        problems.append(Problem("R00", skills_dir, "skills directory does not exist"))
        return problems, {}
    if not skills:
        problems.append(Problem("R00", skills_dir, "skills directory holds no */SKILL.md — nothing to evaluate"))
        return problems, {}

    case_dirs = find_cases(cases_dir, problems)
    if not case_dirs:
        problems.append(Problem("R00", cases_dir, "no cases found (a case is a directory holding case.yaml or prompt.md)"))
        return problems, {"skills": skills}

    cases, seen, covered = [], {}, {}
    for case_dir in case_dirs:
        case = check_case(case_dir, problems)
        if case is None:
            continue
        cases.append(case)
        name = case["_name"]
        if name in seen:
            problems.append(Problem("R13", case_dir, f'case name "{name}" is already used by {seen[name]} — the report cannot distinguish them'))
        seen[name] = case_dir
        skill = case.get("skill")
        if skill is None:
            problems.append(Problem("R16", case_dir, "case names no `skill:` — a case must say which skill it evaluates"))
        elif not isinstance(skill, str) or not SAFE_SEGMENT.match(skill):
            problems.append(Problem("R16", case_dir, f"skill {skill!r} is not a plain directory name"))
        elif skill not in skills:
            problems.append(Problem("R16", case_dir, f'skill "{skill}" does not exist in {skills_dir}'))
        else:
            covered.setdefault(skill, []).append(name)

    exempt = {}
    exemptions_file = cases_dir / "exemptions.yml"
    if exemptions_file.exists():
        try:
            loaded = yaml.safe_load(exemptions_file.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            problems.append(Problem("R18", exemptions_file, f"YAML parse failed: {exc}"))
            loaded = {}
        if not isinstance(loaded, dict):
            problems.append(Problem("R18", exemptions_file, "exemptions.yml must be a mapping of skill name to reason"))
        else:
            for skill, reason in loaded.items():
                if skill not in skills:
                    problems.append(Problem("R18", exemptions_file, f'exempts "{skill}", which is not a skill in {skills_dir} — a stale waiver is a silent hole'))
                elif not isinstance(reason, str) or not reason.strip():
                    problems.append(Problem("R18", exemptions_file, f'exemption for "{skill}" carries no reason'))
                elif skill in covered:
                    problems.append(Problem("R18", exemptions_file, f'exempts "{skill}", which HAS a case — remove the stale waiver'))
                else:
                    exempt[skill] = reason

    uncovered = [s for s in skills if s not in covered and s not in exempt]
    if uncovered and require_coverage:
        for skill in uncovered:
            problems.append(Problem("R17", skills_dir / skill, "no case evaluates this skill, and no exemption gives a reason"))

    return problems, {
        "skills": skills,
        "cases": cases,
        "covered": covered,
        "exempt": exempt,
        "uncovered": uncovered,
    }


# ---------------------------------------------------------------------------
# run — the half that calls a model. Never reached by `check`, and the imports
# that could spawn a process or open a socket are local to these functions.
# ---------------------------------------------------------------------------


REPO_ROOT = Path(__file__).resolve().parent.parent


def run_dir(out_root, stamp, case_name, attempt, with_skill):
    """Where one run's transcript goes. Pure, so the self-test can pin it.

    Mirrors the official layout — `<eval dir>/results/<timestamp>/` — because a
    suite that migrates should not also have to relearn where its output lives.
    The ablation arm gets its own leaf: two runs of one case differ only by
    whether the skill was there, and a shared name would let the second silently
    overwrite the evidence for the first.
    """
    arm = "with-skill" if with_skill else "no-skill"
    return Path(out_root) / stamp / case_name / f"run-{attempt}-{arm}"


def _sandbox(skill_dir, tmp_root, with_skill=True):
    """A throwaway tree holding ONLY the skill under test, and a deny rule.

    Living outside the checkout is NOT enough, and believing it was is the bug
    this function was written with. Outside the checkout stops CLAUDE.md being
    AUTO-LOADED; it does nothing about an agent that decides to go and look. A
    measured baseline run — same prompt, no skill, cwd in a temp directory —
    came back citing `examples/business/pickup-slip-ja/legacy/pickup_slip.tlf`
    by name, with its real contents. The isolation was imaginary.

    So the sandbox also carries a settings file DENYING reads of the home
    directory and of this repository. Two things learned the hard way, both from
    the CLI's own refusals:

      * only `Read(path)` rules are matched by file permission checks — they
        cover every file-reading tool, and a `Glob(...)` or `Grep(...)` deny
        rule is silently inert (the CLI warns, and the warning is easy to miss
        in a captured log);
      * `Read(//**)` is too blunt: it denies the SANDBOX too, and every case
        then fails for the wrong reason.

    `--restricted` looks like the right flag and is not: it hides the skill
    under test, so every case scores zero.

    `with_skill=False` builds the ablation arm — the same sandbox, minus the
    skill. A case that scores the same either way is measuring the model, not
    the skill.
    """
    import shutil
    import tempfile

    sandbox = Path(tempfile.mkdtemp(prefix="skill-eval-", dir=tmp_root))
    dest = sandbox / ".claude" / "skills" / skill_dir.name
    dest.parent.mkdir(parents=True)
    if with_skill:
        shutil.copytree(skill_dir, dest, symlinks=False)
    (sandbox / "deny.json").write_text(json.dumps({
        "permissions": {"deny": ["Read(~/**)", f"Read(//{REPO_ROOT}/**)"]}
    }), encoding="utf-8")
    return sandbox


def _invoke(prompt, sandbox, execution, model, timeout):
    """One `claude -p` run inside the sandbox. Returns (transcript, tools)."""
    import subprocess

    argv = ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose",
            "--permission-mode", "dontAsk", "--settings", str(sandbox / "deny.json"),
            # The operator's MCP servers are otherwise IN the sandbox: one
            # measured run carried 18 tools of a live external service, several
            # of which write. An eval prompt is author-supplied text, so that is
            # a reachable surface, and it also made a score depend on which
            # servers the operator happens to have configured.
            "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']
    if model:
        argv += ["--model", model]
    allowed = execution.get("allowed_tools")
    if allowed:
        argv += ["--allowed-tools", *[str(t) for t in allowed]]

    proc = subprocess.run(argv, cwd=str(sandbox), capture_output=True,
                          text=True, timeout=timeout, check=False,
                          stdin=subprocess.DEVNULL)

    transcript, tools, final = [], [], None
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "result" and isinstance(event.get("result"), str):
            # FALLBACK ONLY. The `result` event repeats the final assistant turn,
            # so appending both recorded every answer TWICE — measured at 12 of
            # 20 saved runs being exactly 2x duplicated. `contains` /
            # `not_contains` survive that (both are booleans over the hit list),
            # but `match: count:N` cannot: an author asking for "names the flag
            # once" had to write `count:2` or the grader could never pass.
            final = event["result"]
            continue
        # `message` is not always an object: some stream-json events carry it as
        # a bare string. Found by the ABLATION arm — the no-skill run produces a
        # different event shape, and the bug was latent in the with-skill path
        # the whole time, which is its own argument for running both.
        message = event.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "text" and isinstance(block.get("text"), str):
                    transcript.append(block["text"])
                elif block.get("type") == "tool_use" and isinstance(block.get("name"), str):
                    # The INPUT is recorded, not just the name: a `tool_used:
                    # Skill` grader that matches on the name alone passes when
                    # ANY skill fires, and the operator's own skills are in the
                    # sandbox (see `_sandbox`). `input_match` is what tells the
                    # skill under test from the other twenty.
                    tools.append((block["name"], json.dumps(block.get("input", {}), sort_keys=True)))
    if not transcript and final is not None:
        transcript.append(final)          # no text blocks parsed; use the summary
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:400]}")
    if not transcript:
        # An empty transcript scored every `not_contains` grader as a PASS and
        # reported the case green. A run that produced no answer is a failed
        # run, not a passing one.
        raise RuntimeError("claude produced no transcript (exit 0) — refusing to score an empty run")
    return "\n".join(transcript), tools


def _judge(criteria, transcript, model, timeout):
    """An `llm` grader: a second model call, answering PASS or FAIL."""
    prompt = (
        "You are grading one transcript against one criterion. Answer with the "
        "single word PASS or FAIL on the first line, then one sentence of "
        "reasoning.\n\n=== CRITERION ===\n" + criteria +
        "\n\n=== TRANSCRIPT ===\n" + transcript[:40000] + "\n=== END ===\n"
    )
    import subprocess

    proc = subprocess.run(["claude", "-p", prompt, "--model", model or "haiku"],
                          capture_output=True, text=True, timeout=timeout,
                          check=False, stdin=subprocess.DEVNULL)
    answer = proc.stdout.strip()
    return answer.upper().startswith("PASS"), answer.splitlines()[0] if answer else "(no answer)"


def _js_flags(flags):
    out = 0
    if "i" in flags:
        out |= re.IGNORECASE
    if "m" in flags:
        out |= re.MULTILINE
    if "s" in flags:
        out |= re.DOTALL
    return out


def score_grader(grader, transcript, tools, sandbox, judge_model, timeout):
    """Score one grader. Returns (passed, detail) or None when not executable.

    `tools` is a list of (name, input_json) pairs — the input matters because a
    grader matching on the tool NAME alone cannot tell the skill under test from
    any other skill in the sandbox.
    """
    gtype = grader["type"]
    names = [t[0] for t in tools]

    if gtype == "baseline":
        return None

    if gtype == "regex":
        rx = re.compile(grader["pattern"], _js_flags(str(grader.get("flags", ""))))
        hits = rx.findall(transcript)
        match = str(grader.get("match", "contains"))
        if match == "contains":
            return bool(hits), f"{len(hits)} match(es)"
        if match == "not_contains":
            return not hits, f"{len(hits)} match(es), expected none"
        want = int(match.split(":")[1])
        return len(hits) == want, f"{len(hits)} match(es), expected {want}"

    if gtype == "tool_used":
        name = grader["tool"]
        used = [t for t in tools if t[0] == name]
        pattern = grader.get("input_match")
        if isinstance(pattern, str):
            rx = re.compile(pattern)
            used = [t for t in used if rx.search(t[1])]
        low = grader.get("min", 1)
        high = grader.get("max")
        ok = len(used) >= low and (high is None or len(used) <= high)
        bound = f">={low}" + (f" and <={high}" if high is not None else "")
        shown = f'"{name}"' + (f" matching {pattern!r}" if pattern else "")
        return ok, f"{shown} called {len(used)}x (expected {bound})"

    if gtype == "tool_order":
        before, after = grader["before"], grader["after"]
        if before not in names:
            return False, f'"before" tool {before} never called'
        if after not in names:
            return False, f'"after" tool {after} never called'
        ok = names.index(before) < names.index(after)
        return ok, f'{before} {"precedes" if ok else "does NOT precede"} {after}'

    if gtype == "file_exists":
        target = sandbox / grader["path"]
        want = grader.get("exists", True)
        present = target.exists()
        return present is bool(want), f"{grader['path']} {'exists' if present else 'is missing'} (expected {'present' if want else 'absent'})"

    if gtype == "llm":
        return _judge(grader["_criteria"], transcript, judge_model, timeout)

    raise AssertionError(f"unreachable grader type {gtype!r}")  # pragma: no cover


def _score_once(case, skill_dir, model, judge_model, tmp_root, with_skill, label,
                details, out_dir=None):
    """One sandboxed run, scored. Returns the fraction of grader weight earned.

    `out_dir` is where the transcript and tool trace land. Scoring used to throw
    both away, so a FAILED grader could only be diagnosed by paying for another
    run — and the second run is a different sample, so it need not reproduce.
    One real failure was left undiagnosed exactly this way: a `not_contains`
    grader reported six matches while the judgment grader beside it passed, and
    whether the answer WROTE the forbidden string or QUOTED it was unanswerable.
    """
    import shutil

    execution = case["_execution"]
    timeout = int(execution.get("timeout_seconds", 600))
    sandbox = _sandbox(skill_dir, tmp_root, with_skill=with_skill)
    try:
        transcript, tools = _invoke(case["_prompt"], sandbox, execution, model, timeout)
        trace = None
        if out_dir is not None:
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "transcript.txt").write_text(transcript, encoding="utf-8")
            (out_dir / "trace.json").write_text(
                json.dumps([{"name": n, "input": i} for n, i in tools], indent=2),
                encoding="utf-8")
            (out_dir / "prompt.txt").write_text(case["_prompt"], encoding="utf-8")
            trace = out_dir
        earned = possible = 0.0
        for grader in case["_graders"]:
            result = score_grader(grader, transcript, tools, sandbox, judge_model, timeout)
            if result is None:
                details.append(f"    {label}  SKIP  {grader['_path'].name} (baseline)")
                continue
            passed, detail = result
            if not passed and trace is not None:
                # The failure line is where someone is actually looking.
                detail += f"  [transcript: {trace}]"
            if grader.get("arm") == "with-only":
                # Officially an indicator that the plugin fired, not part of the
                # score — it is trivially false on the no-skill arm.
                details.append(f"    {label}  {'yes ' if passed else 'no  '}  {grader['_path'].name} [indicator]: {detail}")
                continue
            weight = float(grader.get("weight", 1))
            possible += weight
            earned += weight if passed else 0.0
            details.append(f"    {label}  {'PASS' if passed else 'FAIL'}  {grader['_path'].name}: {detail}")
        return earned / possible if possible else 0.0
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)


def run_case(case, skills_dir, model, judge_model, tmp_root, ablation=False,
             out_root=None, stamp=None):
    """Run one case `runs` times and return (score, baseline_score_or_None, details).

    With `ablation`, each run is paired with a second one whose sandbox has no
    skill. The pair is the only thing that says whether the SKILL did anything:
    a case that scores 1.00 both ways is measuring the model.

    The arm is not optional decoration. This suite was built without it, and the
    first attempt to measure a baseline by hand ran in a directory the agent
    could read the repository from — it answered from the real converted example
    and "passed", which is what an ablation with no isolation is worth. Under the
    deny rules in `_sandbox`, the same case scores 1.00 with the skill and 0.00
    without it.
    """
    execution = case["_execution"]
    runs = int(case.get("runs", 3))  # the official default
    skill_dir = skills_dir / case["skill"]

    totals, baselines = [], []
    details = []
    def where(attempt, with_skill):
        if out_root is None:
            return None
        return run_dir(out_root, stamp, case["_name"], attempt + 1, with_skill)

    for attempt in range(runs):
        label = f"run {attempt + 1}"
        totals.append(_score_once(case, skill_dir, model, judge_model, tmp_root, True,
                                  label, details, where(attempt, True)))
        if ablation:
            baselines.append(_score_once(case, skill_dir, model, judge_model, tmp_root,
                                         False, f"{label} (no skill)", details,
                                         where(attempt, False)))
    score = sum(totals) / len(totals) if totals else 0.0
    baseline = (sum(baselines) / len(baselines)) if baselines else None
    return score, baseline, details


# ---------------------------------------------------------------------------
# selftest — the fixtures, run BEFORE the real tree
# ---------------------------------------------------------------------------

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "skill-eval"


def detector_lines():
    """Every line in this file that can raise a Problem — the branch inventory.

    Read from the source rather than maintained by hand, so a new check is
    covered by the completeness assertion the moment it is written, without
    anyone remembering to add it to a list.
    """
    # The needle is ASSEMBLED rather than written, so this function's own source
    # does not contain it and therefore does not match itself. Spelling it out
    # made the detector report two phantom branches — its own comment and its
    # own predicate — which is the self-reference every source-reading check has
    # to answer for.
    needle = "append(" + "Problem" + "("
    lines = set()
    for n, text in enumerate(Path(__file__).read_text(encoding="utf-8").splitlines(), 1):
        if needle in text:
            lines.add(n)
    return lines


def rule_ids_in_source():
    """Every rule id this file can actually emit, read from the source.

    R00 is excluded because its fixtures cannot be COMMITTED — every one of them
    is an empty or absent directory, and git stores neither. `selftest_fail_closed`
    builds them at runtime instead; it is not an exemption from being tested.
    Say so wherever this assertion is described: "every rule id EXCEPT R00, which
    four runtime-built cases prove instead" is the true sentence, and the bare
    "every rule the source can emit" is the overclaim it exists to prevent.
    """
    source = Path(__file__).read_text(encoding="utf-8")
    return {m for m in re.findall(r'Problem\("(R\d\d)"', source)} - {"R00"}


def selftest_fail_closed():
    """R00: a gate that finds NOTHING must fail, not pass quietly.

    This is the half a fixture directory cannot express. Every case here is an
    absence — no case tree, no skills tree, a skills tree holding no skills, a
    case tree holding no cases — and an absence is exactly what a green gate
    looks like when the detector has stopped reaching the files.
    """
    import tempfile

    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        empty_cases, empty_skills = tmp / "cases", tmp / "skills"
        empty_cases.mkdir()
        empty_skills.mkdir()
        (tmp / "skills-with-one").mkdir()
        (tmp / "skills-with-one" / "s").mkdir()
        (tmp / "skills-with-one" / "s" / "SKILL.md").write_text("---\nname: s\n---\nx\n")

        cases = [
            ("a case tree that does not exist", tmp / "nope", FIXTURES / "skills"),
            ("a skills tree that does not exist", FIXTURES / "good", tmp / "nope"),
            ("a skills tree holding no */SKILL.md", FIXTURES / "good", empty_skills),
            ("a case tree holding no cases", empty_cases, tmp / "skills-with-one"),
        ]
        for label, c, k in cases:
            problems, _ = check_tree(c, k, require_coverage=False)
            if not any(p.rule == "R00" for p in problems):
                got = ", ".join(sorted({p.rule for p in problems})) or "nothing"
                failures.append(f"fail-closed: {label} produced {got}, not R00")
    return failures


def selftest_run_dir():
    """`run_dir` is the one part of the model-calling half that is pure.

    Worth pinning because the ablation arm's two runs differ ONLY by the skill:
    a layout that collided would overwrite the with-skill evidence with the
    no-skill one, and the collision is invisible in the scores.
    """
    failures = []
    a = run_dir("/out", "T", "case", 1, True)
    b = run_dir("/out", "T", "case", 1, False)
    if a == b:
        failures.append(f"run_dir: the two ablation arms collide at {a}")
    if run_dir("/out", "T", "case", 1, True) == run_dir("/out", "T", "case", 2, True):
        failures.append("run_dir: two runs of one case collide")
    if run_dir("/out", "T", "a", 1, True) == run_dir("/out", "T", "b", 1, True):
        failures.append("run_dir: two cases collide")
    if Path("/out") not in Path(a).parents:
        failures.append(f"run_dir: {a} is not under the output root")
    return failures


def selftest():
    """Assert every rule both FIRES on a bad fixture and stays QUIET on the good one.

    A rule with only a positive fixture cannot tell a working detector from one
    that rejects everything, which is why the good tree is checked first and has
    to come back completely clean while exercising every construct the rules
    police.
    """
    skills = FIXTURES / "skills"
    failures = []
    Problem.fired = set()

    good = FIXTURES / "good"
    problems, report = check_tree(good, skills, require_coverage=True)
    if problems:
        failures.append("the GOOD fixture tree must produce no problems, but produced:\n" +
                        "\n".join(f"      {p}" for p in problems))
    elif not report.get("cases"):
        failures.append("the GOOD fixture tree parsed zero cases — it proves nothing")

    bad_root = FIXTURES / "bad"
    seen_rules = set()
    for tree in sorted(p for p in bad_root.iterdir() if p.is_dir()):
        rule = tree.name.split("-")[0]
        seen_rules.add(rule)
        problems, _ = check_tree(tree, skills, require_coverage=rule in ("R17", "R18"))
        hit = [p for p in problems if p.rule == rule]
        if not hit:
            got = ", ".join(sorted({p.rule for p in problems})) or "nothing"
            failures.append(f"{tree.name}: expected rule {rule} to fire, but got {got}")

    failures += selftest_fail_closed()
    failures += selftest_run_dir()

    missing = rule_ids_in_source() - seen_rules
    if missing:
        failures.append("rules with no bad fixture (a detector nothing proves fires): " +
                        ", ".join(sorted(missing)))

    unfired = detector_lines() - Problem.fired
    Problem.fired = None
    if unfired:
        src = Path(__file__).read_text(encoding="utf-8").splitlines()
        failures.append(
            f"{len(unfired)} detector branch(es) that no fixture reaches — a check "
            "nothing proves fires:\n" +
            "\n".join(f"      line {n}: {src[n - 1].strip()[:96]}" for n in sorted(unfired)))

    if failures:
        sys.stderr.write("skill-eval selftest FAILED:\n")
        for f in failures:
            sys.stderr.write(f"  - {f}\n")
        return 1
    print(f"    selftest ok — {len(seen_rules)} rules over {len(detector_lines())} detector "
          f"branches, every branch reached by a fixture; the good tree stays silent; "
          f"4 fail-closed cases refuse to pass on an absence; "
          f"the transcript layout keeps every run distinct")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def cmd_check(args):
    if selftest() != 0:
        return 1
    # stdout is block-buffered when the gate redirects it to a log, so the
    # self-test line would otherwise land AFTER the problems written to stderr,
    # reading as though the fixtures ran last.
    sys.stdout.flush()
    problems, report = check_tree(Path(args.cases), Path(args.skills), args.require_coverage)
    if problems:
        sys.stderr.write(f"skill-eval: {len(problems)} problem(s) in {args.cases}\n\n")
        for p in problems:
            sys.stderr.write(f"  {p}\n")
        sys.stderr.write("\n")
        return 1

    skills = report.get("skills", [])
    cases = report.get("cases", [])
    covered, exempt, uncovered = report.get("covered", {}), report.get("exempt", {}), report.get("uncovered", [])
    print(f"    {len(cases)} case(s) over {len(skills)} skill(s): "
          f"{len(covered)} covered, {len(exempt)} exempt, {len(uncovered)} uncovered")
    for skill in uncovered:
        print(f"    (no case) {skill}")
    return 0


def cmd_run(args):
    import tempfile

    problems, report = check_tree(Path(args.cases), Path(args.skills), False)
    if problems:
        sys.stderr.write("skill-eval: refusing to run an invalid case tree; `check` first.\n")
        for p in problems:
            sys.stderr.write(f"  {p}\n")
        return 1

    cases = [c for c in report["cases"] if not args.case or fnmatch.fnmatch(c["_name"], args.case)]
    if not cases:
        sys.stderr.write(f"skill-eval: no case matches {args.case!r}\n")
        return 1

    tmp_root = tempfile.gettempdir()
    stamp = time.strftime("%Y%m%dT%H%M%S")
    out_root = None if args.no_save else Path(args.output_dir or (Path(args.cases) / "results"))
    if out_root is not None:
        print(f"  transcripts -> {out_root / stamp}\n")

    worst, rows = 1.0, []
    for case in cases:
        score, baseline, details = run_case(case, Path(args.skills), args.model,
                                            args.judge_model, tmp_root, args.ablation,
                                            out_root, stamp)
        worst = min(worst, score)
        rows.append((case["_name"], case["skill"], score, baseline))
        delta = "" if baseline is None else f"   (no skill: {baseline:.2f}, delta {score - baseline:+.2f})"
        print(f"  {case['_name']}  [{case['skill']}]  score {score:.2f}{delta}")
        for line in details:
            print(line)

    print("\n  " + "-" * 60)
    for name, skill, score, baseline in rows:
        note = ""
        if baseline is not None and score <= baseline:
            note = "   <- MEASURES NOTHING: the base model scores as well without the skill"
        print(f"  {'PASS' if score >= args.threshold else 'FAIL'}  {score:.2f}  {name} [{skill}]{note}")
    if worst < args.threshold:
        sys.stderr.write(f"\nskill-eval: lowest score {worst:.2f} is below the threshold {args.threshold:.2f}\n")
        return 1
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(prog="skill-eval.py", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="validate a case tree (offline, deterministic)")
    p_check.add_argument("--cases", required=True)
    p_check.add_argument("--skills", required=True)
    p_check.add_argument("--require-coverage", action="store_true",
                         help="fail when a skill has neither a case nor an exemption")
    p_check.set_defaults(func=cmd_check)

    p_run = sub.add_parser("run", help="run the cases through a model and score them")
    p_run.add_argument("--cases", required=True)
    p_run.add_argument("--skills", required=True)
    p_run.add_argument("--case", default=None, help="glob over case names")
    p_run.add_argument("--model", default=None, help="model under test")
    p_run.add_argument("--judge-model", default="haiku", help="model that scores `llm` graders")
    p_run.add_argument("--threshold", type=float, default=1.0)
    p_run.add_argument("--ablation", action="store_true",
                       help="also run each case WITHOUT the skill, and report the delta")
    p_run.add_argument("--output-dir", default=None,
                       help="where transcripts go (default: <cases>/results/<timestamp>/)")
    p_run.add_argument("--no-save", action="store_true",
                       help="score without keeping the transcripts")
    p_run.set_defaults(func=cmd_run)

    p_self = sub.add_parser("selftest", help="run the fixtures only")
    p_self.set_defaults(func=lambda _args: selftest())

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
