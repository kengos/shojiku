#!/bin/sh
# PreToolUse guard over Bash commands — the deterministic half of this
# repository's development rules.
#
# WHY THIS FILE EXISTS. Every rule below was written into two to five of the
# development skills as prose, and every one was then broken anyway, by
# sessions that had it in front of them. The record is explicit about the
# diagnosis: "Repeated reaches for one wrong tool are a wrong default, not a
# memory failure", and "Re-reading it is not the fix; not needing it is".
# A rule a reader has to remember at the moment of acting is not a control.
# So the rules that can be decided mechanically are decided here instead, and
# deleted from the prose that could not enforce them.
#
# Reads the PreToolUse event on stdin and writes at most one decision:
#
#   deny  a mistake with no legitimate spelling and an obvious remedy
#   ask   a legitimate action whose call belongs to a human
#   note  additionalContext only; the command proceeds through the normal
#         permission flow, having been told what to watch
#
# It never breaks a session: a missing jq, an unparsable event or any
# unexpected state exits 0 saying nothing.

command -v jq >/dev/null 2>&1 || exit 0

event=$(cat 2>/dev/null) || exit 0
cmd=$(printf '%s' "$event" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
cwd=$(printf '%s' "$event" | jq -r '.cwd // ""' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0

decide() {
	jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput:{
		hookEventName:"PreToolUse", permissionDecision:$d, permissionDecisionReason:$r}}'
	exit 0
}
has() { printf '%s' "$cmd" | grep -Eq -- "$1"; }
hasi() { printf '%s' "$cmd" | grep -Eqi -- "$1"; }

# The non-flag arguments of the first make invocation — its TARGETS. `make`
# bare, `make help` and `make --version` ask for nothing that can be reported
# green, so they are not gates; anything else is. Deciding from the arguments
# rather than from a list of pagers is what keeps the rule complete in one
# direction and quiet in the other.
make_targets() {
	printf '%s' "$cmd" | awk '
		{
			n = split($0, tok, /[ \t]+/)
			seen = 0
			for (i = 1; i <= n; i++) {
				t = tok[i]
				if (!seen) { if (t ~ /^g?make$/) seen = 1; continue }
				if (t ~ /^[|;&]/ || t == "&&" || t == "||") break
				if (skip) { skip = 0; continue }
				if (t ~ /^-[CfjIoW]$/) { skip = 1; continue }
				if (t ~ /^-/) continue
				if (t ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
				if (t != "") print t
			}
		}'
}

# Is a gate being run, as opposed to make being asked a question?
is_gate() {
	t=$(make_targets)
	[ -n "$t" ] || return 1
	for one in $t; do
		case "$one" in help) ;; *) return 0 ;; esac
	done
	return 1
}

# Does a pipe follow the make invocation, before any `;` or `&&` ends it?
piped_after_make() {
	printf '%s' "$cmd" | awk '
		{
			rest = $0
			if (match(rest, /(^|[;&|(])[ \t]*([A-Za-z_][A-Za-z0-9_]*=[^ \t]*[ \t]+)*(sudo[ \t]+)?g?make[ \t]/) == 0) exit 1
			rest = substr(rest, RSTART + RLENGTH)
			if (match(rest, /\|\||;|&&/) > 0) rest = substr(rest, 1, RSTART - 1)
			exit (index(rest, "|") > 0) ? 0 : 1
		}'
}

# A command-position invocation: start of the command or just after a
# separator, allowing leading VAR=value assignments (`V=1 make ...`).
POS='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
MAKE="$POS(sudo[[:space:]]+)?g?make([[:space:]]|$)"
CARGO="${POS}cargo([[:space:]]|$)"

# ---------------------------------------------------------------- deny ----

# A pipeline reports the LAST command's status, so a piped gate exits 0 over a
# failure — and a BACKGROUNDED piped gate has the harness announce that lie as
# a verdict. Carried in one cycle's own pre-flight list and violated twice.
if has "$MAKE" && is_gate && piped_after_make; then
	decide deny 'A pipeline reports the last command'"'"'s exit status, so this reports a
FAILED gate as green. Redirect, and read the file as a SEPARATE call:
  make <target> > /tmp/<name>.log 2>&1
Then `cat` or `tail` that file. Do not append `; echo $?` either — that is the
same trap in suffix form, and the exit code you would read is echo'"'"'s
(docs/agents/verification.md). A failure is also kept at .make-logs/last-error.log,
and V=1 streams the raw output instead.'
fi

# GNU make still executes recipe lines containing $(MAKE) under -n, so a "dry"
# run takes the gate lock and has killed a running gate. The Makefile refuses
# it at parse time; this refuses it before the container starts.
if has "$MAKE" && has '[[:space:]](-n|--dry-run|--just-print|--recon)([[:space:]]|$)'; then
	decide deny '`make -n` is not a dry run here: recipe lines containing $(MAKE) still
run for real (the documented GNU recursion rule), so a dry run takes the gate
lock and has killed a gate mid-run. Read the recipe, or run `make help`.'
fi

# There is no Rust toolchain on this host, and a hand-built invocation is not a
# sanctioned claim even where one exists.
if has "$CARGO" && ! has 'docker[^;&|]*cargo'; then
	decide deny 'This host has no Rust toolchain, and a correctness claim comes from a make
target, never from an ad-hoc cargo run. Use the <scope>:<job> grid:
  make engine:lint | engine:test | engine:coverage | engine:budget
`make help` lists them; the allowlist is the header of the Makefile.'
fi

# The branch ruleset requires signatures; disabling signing produces a commit
# that passes locally and meets mergeStateStatus BLOCKED hours later.
if hasi 'commit\.gpgsign[[:space:]]*=[[:space:]]*(false|0|no|off)' ||
	has '[[:space:]]--no-gpg-sign([[:space:]]|$)'; then
	decide deny 'The branch ruleset requires signed commits. A commit made with signing
off — `-c commit.gpgSign=false`, `=0`, or `--no-gpg-sign` — pushes fine and is
then BLOCKED at merge. Fix the signing setup instead of disabling it.'
fi

# A standing user rule that the harness default actively fights, which is
# exactly why prose never held it.
if has '(git[[:space:]]+([^|;&]*[[:space:]])?commit|gh[[:space:]]+pr[[:space:]]+(create|edit)|gh[[:space:]]+release[[:space:]]+create)' \
	&& has '(Co-[Aa]uthored-[Bb]y|Generated with \[Claude Code\]|Co-authored-by)'; then
	decide deny 'No attribution trailers in this repository (user rule): no `Co-Authored-By`
and no "Generated with" line in any commit message or PR body. This overrides
the harness default that adds one.'
fi

# main takes no direct pushes and no force pushes (repository ruleset). Denying
# here removes a round trip, not a capability: --force-with-lease on a FEATURE
# branch is the documented squash workflow and is untouched.
if has 'git[[:space:]]+([^|;&]*[[:space:]])?push'; then
	if has '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))' \
		&& has '([[:space:]]|:|\+)main([[:space:]]|$)'; then
		decide deny 'main takes no force pushes (repository ruleset). History there accumulates
through PRs. Force-push your own feature branch instead.'
	fi
	if has 'push[[:space:]]+(-[^[:space:]]+[[:space:]]+)*origin[[:space:]]+(HEAD:)?(refs/heads/)?main([[:space:]]|$)'; then
		decide deny 'main is ruleset-protected: it takes no direct pushes, docs-only changes
included. Open a PR from a branch.'
	fi
fi

# ----------------------------------------------------------------- ask ----

# The approval gate from the playbook, made deterministic: the session may drive
# change up to the merge and may not pass it. Merge authorization is per
# change and never carries from one to the next.
if has 'gh[[:space:]]+pr[[:space:]]+merge'; then
	decide ask 'Merging needs explicit authorization for THIS change (user rule) — approval
for one change never carries to the next. Confirm the merge bar is green and
say so here.'
fi

# ---------------------------------------------------------------- note ----

notes=''
add() { notes="$notes$1
"; }

# In a worktree the Bash tool resets cwd between calls, so a bare `make` runs
# the gates over the PRIMARY checkout — and they go green there.
if has "$MAKE" && ! has '(^|[[:space:]])-C([[:space:]]|=)' && [ -f "$cwd/.git" ]; then
	add "This is a worktree, and the shell cwd resets between calls: a bare \`make\` can run the gates over the PRIMARY checkout and pass there. Use \`make -C $cwd <target>\`."
fi

# Self-matching argv, reached for four times across three sessions after the
# rule had been read. There is a completion notification; there is no watcher.
if has "${POS}pgrep([[:space:]]|$)"; then
	add 'pgrep matches its own argv, so a watcher keyed on it sees itself and never settles — and the pattern is machine-wide, so a neighbouring session satisfies or blocks it. A harness-tracked background task notifies on its own; poll nothing.'
fi

# zsh expands the glob before grep runs, and the command dies before it searches.
if has '--include=[^"'"'"'[:space:]]*\*'; then
	add 'Quote the glob: an unquoted --include=*.ts is expanded by zsh before grep runs, and the command dies before it searches.'
fi

# The -f rule was retired: it came from misreading `*.log` in the global
# excludes, and the changes of a tracked file never need -f anyway.
if has 'git[[:space:]]+add[^|;&]*[[:space:]]-f' && has 'Cargo\.lock'; then
	add 'engine/Cargo.lock is tracked and stages normally — `git add engine/Cargo.lock`. The `-f` rule was a misread of `*.log` in the global excludes.'
fi

if [ -n "$notes" ]; then
	jq -n --arg c "$notes" '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$c}}'
fi
exit 0
