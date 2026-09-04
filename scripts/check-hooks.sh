#!/bin/sh
# Self-test for the tracked Claude Code hooks (.claude/hooks/*.sh).
#
# The hooks are the deterministic half of this repository's development rules:
# rules that were written into the skills as prose, broken anyway, and moved
# here so they are decided rather than remembered. A hook that silently stops
# deciding therefore removes a control without reddening anything — which is
# the exact failure this gate exists to catch.
#
# Every case feeds a synthetic hook event on stdin and asserts the decision.
# The table carries BOTH halves: commands that must be caught, and the
# legitimate spellings beside them that must NOT be. A deny rule with no
# negative case is a blindfold waiting to happen.
#
# Pure read-only POSIX sh; jq is the only dependency (the hooks need it too).

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
hooks="$root/.claude/hooks"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

if ! command -v jq >/dev/null 2>&1; then
	echo "check-hooks: jq is required (the hooks use it too)" >&2
	exit 1
fi

for h in guard-bash.sh guard-edit.sh; do
	[ -f "$hooks/$h" ] || { echo "check-hooks: missing $hooks/$h" >&2; exit 1; }
	[ -x "$hooks/$h" ] || { echo "check-hooks: $hooks/$h is not executable" >&2; exit 1; }
	sh -n "$hooks/$h" || { echo "check-hooks: $hooks/$h has a syntax error" >&2; exit 1; }
done

# Every hook the settings file registers must exist, and vice versa: a hook
# nobody registers is dead, and a registration pointing nowhere is worse.
registered=$(jq -r '.hooks[][].hooks[].command' "$root/.claude/settings.json" |
	sed 's#.*/##' | sort -u)
present=$(ls "$hooks" | sort -u)
if [ "$registered" != "$present" ]; then
	echo "check-hooks: .claude/settings.json registers [$registered] but .claude/hooks holds [$present]" >&2
	exit 1
fi

pass=0
fail=0
denies=0

# outcome <hook> <event-json> -> deny | ask | note | silent
outcome() {
	out=$(printf '%s' "$2" | "$hooks/$1" 2>/dev/null || true)
	[ -n "$out" ] || { echo silent; return; }
	d=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // ""' 2>/dev/null || true)
	case "$d" in
	deny | ask)
		echo "$d"
		return
		;;
	esac
	c=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null || true)
	[ -n "$c" ] && echo note || echo silent
}

bash_event() {
	jq -n --arg c "$1" --arg w "${2:-$tmp}" \
		'{hook_event_name:"PreToolUse", cwd:$w, tool_name:"Bash", tool_input:{command:$c}}'
}
edit_event() {
	jq -n --arg p "$1" \
		'{hook_event_name:"PostToolUse", tool_name:"Write", tool_input:{file_path:$p}}'
}

check() { # check <label> <expected> <actual>
	if [ "$2" = "$3" ]; then
		pass=$((pass + 1))
		[ "$2" = deny ] && denies=$((denies + 1))
		return 0
	fi
	fail=$((fail + 1))
	printf 'FAIL  %-46s expected %-6s got %s\n' "$1" "$2" "$3" >&2
}

case_bash() { check "$1" "$2" "$(outcome guard-bash.sh "$(bash_event "$3" "${4:-}")")"; }
case_edit() { check "$1" "$2" "$(outcome guard-edit.sh "$(edit_event "$3")")"; }

# ---- Bash guard: the mistakes ------------------------------------------
case_bash 'gate piped to tail'          deny 'make engine:test | tail -40'
case_bash 'V=1 gate piped to tail'      deny 'V=1 make gui:verify | tail -120'
case_bash 'gate piped to grep'          deny 'gmake verify | grep -i error'
case_bash 'gate piped to rg'            deny 'make engine:test | rg error'
case_bash 'gate piped to cat'           deny 'make engine:test | cat'
case_bash 'gate piped to jq'            deny 'make engine:test | jq .'
case_bash 'gate piped to sort'          deny 'make engine:test | sort -u'
case_bash 'make -n'                     deny 'make -n verify'
case_bash 'make --dry-run'              deny 'make --dry-run engine:test'
case_bash 'host cargo'                  deny 'cargo test --workspace'
case_bash 'host cargo after &&'         deny 'cd engine && cargo clippy'
case_bash 'signing disabled'            deny 'git -c commit.gpgsign=false commit -m wip'
case_bash 'signing disabled, git casing' deny 'git -c commit.gpgSign=false commit -m wip'
case_bash 'signing disabled, falsy 0'   deny 'git -c commit.gpgsign=0 commit -m wip'
case_bash 'signing off by flag'         deny 'git commit --no-gpg-sign -m wip'
case_bash 'attribution trailer'         deny 'git commit -m "fix

Co-Authored-By: Someone <x@y>"'
case_bash 'attribution in PR body'      deny 'gh pr create --body "text

Generated with [Claude Code]"'
case_bash 'force push to main'          deny 'git push --force origin main'
case_bash 'direct push to main'         deny 'git push origin main'
case_bash 'push to a full refspec'      deny 'git push origin HEAD:refs/heads/main'
case_bash 'cargo after a docker command' deny 'docker rm -f x; cargo test'

# ---- Bash guard: the legitimate spellings beside them -------------------
case_bash 'redirected gate'             silent 'make engine:test > /tmp/e.log 2>&1'
case_bash 'make help piped'             silent 'make help | grep engine'
case_bash 'make help through -C'        silent 'make -C /repo help | grep hooks'
case_bash 'make --version piped'        silent 'make --version | head -1'
case_bash 'bare make piped'             silent 'make | head -5'
case_bash 'make named inside a pattern' silent "grep -E 'a|make x' file | wc -l"
case_bash 'cargo inside docker'         silent 'docker run --rm rust:1 cargo test'
case_bash 'force-with-lease on feature' silent 'git push --force-with-lease origin feat/x'
case_bash 'make is an argument'         silent 'echo hello | grep make'
case_bash 'ordinary pipeline'           silent 'git log --oneline | head -5'
case_bash 'pr view'                     silent 'gh pr view 123'
case_bash 'grep for a trailer'          silent 'git log -1 | grep Co-Authored-By'

# ---- Bash guard: ask and note ------------------------------------------
case_bash 'merge asks'                  ask  'gh pr merge 123 --squash'
case_bash 'pgrep watcher'               note 'pgrep -f gmake'
case_bash 'unquoted include glob'       note 'grep -rn --include=*.ts foo gui/'
case_bash 'git add -f on the lockfile'  note 'git add -f engine/Cargo.lock'

# A worktree keeps .git as a FILE; that is what makes the missing -C dangerous.
wt="$tmp/worktree"
mkdir -p "$wt" && echo 'gitdir: /elsewhere' > "$wt/.git"
case_bash 'bare make in a worktree'     note 'make engine:lint' "$wt"
case_bash 'make -C in a worktree'       silent "make -C $wt engine:lint" "$wt"

# ---- Edit guard --------------------------------------------------------
mkdir -p "$tmp/engine/core/src" "$tmp/gui/designer/src" "$tmp/docs"

f="$tmp/engine/core/src/over.rs"
{ echo '//! Over the cap.'; i=0; while [ $i -lt 305 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'rs over the 300-line cap'    note "$f"

f="$tmp/engine/core/src/waived.rs"
{ echo '//! Waived.'; echo '// line-budget-exempt: a generated table'
	i=0; while [ $i -lt 305 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'rs over the cap with waiver' silent "$f"

f="$tmp/engine/core/src/noheader.rs"
printf 'pub fn a() {}\n' > "$f"
case_edit 'rs without a //! header'     note "$f"

f="$tmp/engine/core/src/ok.rs"
printf '//! Fine.\npub fn a() {}\n' > "$f"
case_edit 'rs within budget'            silent "$f"

f="$tmp/gui/designer/src/big.tsx"
{ i=0; while [ $i -lt 200 ]; do echo "const x$i = $i;"; i=$((i + 1)); done; } > "$f"
case_edit 'tsx over the 150 cap'        note "$f"

f="$tmp/gui/designer/src/documented.tsx"
{ echo '/* A long comment block.'; i=0; while [ $i -lt 300 ]; do echo " * $i"; i=$((i + 1)); done
	echo ' */'; i=0; while [ $i -lt 20 ]; do echo "const y$i = $i;"; i=$((i + 1)); done; } > "$f"
case_edit 'tsx that is mostly comment'  silent "$f"

f="$tmp/gui/designer/src/big.test.tsx"
{ i=0; while [ $i -lt 200 ]; do echo "const x$i = $i;"; i=$((i + 1)); done; } > "$f"
case_edit 'test file is out of scope'   silent "$f"

f="$tmp/docs/note.md"
printf 'Implements GU12 and TB1a.\n' > "$f"
case_edit 'work-item codes in docs'     note "$f"

f="$tmp/docs/clean.md"
printf 'Implements the character grid.\n' > "$f"
case_edit 'prose without codes'         silent "$f"

# ---- The detector still detects ----------------------------------------
if [ "$denies" -lt 8 ]; then
	echo "check-hooks: only $denies deny cases fired — the guard has stopped deciding, not the cases stopped mattering" >&2
	exit 1
fi

if [ "$fail" -gt 0 ]; then
	echo "check-hooks: $fail of $((pass + fail)) cases wrong" >&2
	exit 1
fi
echo "check-hooks: $pass cases, $denies denied, 1 asked — all as specified"
