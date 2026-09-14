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
case_bash 'flag after the target'       deny 'make engine:test --dry-run'
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
# The push and signing rules read the git invocation's own words now, so these
# prove that reading still reaches every spelling that pushes to main or turns
# signing off — including one that is not the first command in the call.
case_bash 'push to main after &&'       deny 'git fetch -q origin && git push -f origin main'
case_bash 'force by a + refspec'        deny 'git push origin +main'
case_bash 'force to HEAD:main'          deny 'git push --force origin HEAD:main'
case_bash 'another remote, dest main'   deny 'git push upstream feat/x:main'
case_bash 'lease to main after cd'      deny 'cd repo; git push --force-with-lease=main origin main'
case_bash 'combined short flags'        deny 'git push -uf origin main'
case_bash 'global -C then push'         deny 'git -C /repo push origin main'
case_bash 'signing off, second command' deny 'git status && git -c commit.gpgsign=false commit -m wip'
case_bash 'push in a substitution'      deny 'echo $(git push -f origin main)'
# A substitution or subshell INSIDE a git command is part of that command — the
# first version of the invocation reader ended the command at `(`, `)` or a
# backtick and let every one of these through, each of which the older
# whole-string match had denied. A zero-context review found them.
case_bash 'push after -C $(pwd)'        deny 'git -C $(pwd) push -f origin main'
case_bash 'push after -C backticks'     deny 'git -C `pwd` push --force origin main'
case_bash 'substituted refspec source'  deny 'git push -f origin $(git branch --show-current):main'
case_bash 'flag after a substitution'   deny 'git commit -m $(date) --no-gpg-sign'
# A here-string and an arithmetic shift are not heredocs; reading them as one
# skipped the rest of the command. Only a heredoc whose closing line exists is
# skipped now.
case_bash 'push after a here-string'    deny 'grep x <<<"$v"
git push -f origin main'
case_bash 'push after a shift'          deny 'echo $(( 1 << 3 ))
git push -f origin main'
case_bash 'unclosed heredoc, then push' deny 'cat <<X
git push -f origin main'
# `<<""` is a heredoc closed by an empty line, not a bare `<<` waiting for its
# delimiter word; reading it as the second swallowed the next command's verb.
case_bash 'empty heredoc delimiter'     deny 'cat <<"" ; git push -f origin main'
case_bash 'empty heredoc, single quotes' deny "cat <<'' ; git push -f origin main"
# A shift inside `$(( … ))` is not a heredoc, even when a later line happens to
# read like its delimiter — skipping to that line hid the push between.
case_bash 'shift, then a matching line'  deny 'echo $((1 << 2))
git push --force origin main
2'
# A substitution inside DOUBLE quotes runs too.
case_bash 'push in a quoted substitution' deny 'echo "$(git push --force origin main)"'
case_bash 'push in quoted backticks'     deny 'echo "`git push -f origin main`"'
# A record separator in the input must not discard what came before it.
case_bash 'a 0x01 byte after the push'   deny "git push --force origin main
echo a$(printf '\001')b"
# Git reads signing config from its environment too, as a prefix or exported.
case_bash 'signing off by environment'  deny "GIT_CONFIG_PARAMETERS=\"'commit.gpgsign=false'\" git commit -m x"
case_bash 'signing off, exported'       deny "export GIT_CONFIG_PARAMETERS=\"'commit.gpgsign=false'\"; git commit -m x"
case_bash 'signing off by key/value'    deny 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false git commit -m x'
case_bash 'signing off, quoted key'     deny "GIT_CONFIG_PARAMETERS=\"'commit.gpgsign'='false'\" git commit -m x"
# Words that keep a command position open: a transparent prefix, or the shell
# word that opens a command.
case_bash 'sudo prefix'                 deny 'sudo git push -f origin main'
case_bash 'env prefix with assignment'  deny 'env A=1 git push -f origin main'
case_bash 'command prefix'              deny 'command git push origin main'
case_bash 'brace group'                 deny '{ git push -f origin main; }'
case_bash 'then opens a command'        deny 'if true; then git push -f origin main; fi'
# Pushes that carry main without naming it as a refspec.
case_bash 'mirror push'                 deny 'git push --mirror origin'
case_bash 'all branches, forced'        deny 'git push --all -f origin'
case_bash 'cargo after a docker command' deny 'docker rm -f x; cargo test'

# A shell metacharacter inside a QUOTED argument is not a separator, and the two
# rules about `make` used to read it as one — in BOTH directions. The quoted-`;`
# row is the serious one: it truncated the scan and let a genuinely piped gate
# through, i.e. the control failed OPEN.
case_bash 'quoted ; then a real pipe'   deny "make gui:test F='a;b' | tail -40"
case_bash 'quoted && then a real pipe'  deny "make gui:test F='a&&b' | tail -40"
case_bash 'quoted || then a real pipe'  deny "make engine:test F='x||y' | grep error"
case_bash 'pipe with no spaces'         deny 'make engine:test|tail -40'

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
# The `-n` rule used to test the WHOLE command string for a stray flag, so it
# denied every one of these: `grep -n` is the form CLAUDE.md recommends, and
# running a gate then reading its log in one call is the shape the
# don't-pipe-a-gate rule beside it pushes you toward. Each of these is a real
# spelling a cycle typed and had refused.
case_bash 'gate then grep -n its log'   silent 'make engine:test > /tmp/e.log 2>&1; grep -n error /tmp/e.log'
case_bash 'gate then head -n'           silent 'make -C /repo gui:test > /tmp/g.log 2>&1; head -n 40 /tmp/g.log'
case_bash 'gate then tail -n'           silent 'make gui:verify > /tmp/v.log 2>&1; tail -n 20 /tmp/v.log'
case_bash 'gate then sort -n'           silent 'make engine:test > /tmp/e.log 2>&1; sort -n /tmp/e.log'
# The negative twins of the quoted-metacharacter rows above. `F='a|b'` is the
# ordinary way to run two suites in one call, and it was DENIED — twice in one
# cycle, the second time on the write-up of the first. A `-n` or a `--dry-run`
# inside an argument is not make's flag either.
case_bash 'quoted pipe in an argument' silent "make gui:test F='spansModel|SpansSection'"
case_bash 'quoted pipe, double quotes' silent 'make gui:test F="a|b" > /tmp/x.log 2>&1'
case_bash 'quoted -n in an argument'   silent "make gui:test F='opt -n dry'"
case_bash 'quoted --dry-run'           silent 'make gui:test F="--dry-run inside"'
# The same rule one layer down. `at_command_position` tokenizes on whitespace,
# so a quoted argument with a SPACE after a separator used to split into two
# tokens and open a command position INSIDE the quotes — which made the guard
# refuse an edit whose only offending name was a fixture string in this very
# file, six times in one cycle. It reads the blanked view now.
case_bash 'name inside a quoted string' silent 'echo "docker rm -f x; cargo test"'
case_bash 'quoted name under grep -n'   silent 'grep -n "x; cargo test" file'
case_bash 'quoted push to main'         silent 'echo "git push origin main"'
# A BACKSLASH-escaped pipe is a literal `|` passed as an argument, exactly as it
# is in a shell — so it is not a pipeline and the gate rule does not apply.
case_bash 'escaped pipe after a gate'   silent 'make engine:test \| tail -40'
# The signing rule had FOUR positive cases and no negative one, and tested the
# whole command string — so it denied any command that merely NAMES the flag,
# with no git in sight. It fired on a heredoc writing documentation about the
# rule, and again on the write-up of that trap; the workaround each time was to
# reach for a different tool, which is how a guard stops being read as a
# decision. Same shape, same fix and same evidence as the `-n` block above.
case_bash 'documenting the flag'        silent "cat <<'X'
prose naming -c commit.gpgsign=false
X"
case_bash 'grep for the flag'           silent 'grep -rn "commit.gpgsign=false" docs/'
case_bash 'flag named mid-sentence'     silent 'echo "never pass --no-gpg-sign to a commit"'
case_bash 'make --version then head -n' silent 'make --version > /dev/null; head -n 2 /etc/hosts'
# The cargo rule and the two push rules used to match a RAW STRING, so naming
# them was enough to be refused. Six wrong denials in one cycle, including the
# probe that reproduced it, the write-up of the incident and the edit that
# carried the fix. They are anchored to a command-position TOKEN now, which is
# the mechanism that always saved the two rules about `make`; the positives
# above and below are what proves the anchoring did not cost the control.
case_bash 'cargo named in a quoted alternation' silent 'grep -E "make|cargo x" file'
case_bash 'cargo named in prose'         silent "echo 'never run cargo test here'"
case_bash 'push rule documented in prose' silent "echo 'never git push --force origin main again'"
case_bash 'push rule grepped in docs'     silent "grep -rn 'git push origin main ' docs/"
case_bash 'make help then grep -n'      silent 'make help; grep -n verify Makefile'
# Anchoring the `git` VERB was still not enough: the rules then looked for their
# words anywhere in the call. A registry update whose heredoc prose said "main"
# and "push", beside an `rm -f` and a `git worktree list`, was refused as a
# force push to main, and the plan for this fix was refused by the signing rule
# for naming the flag beside an `&& git`. Each row below pushes nothing to main
# and disables nothing; the words only sit next to a git call.
case_bash 'git call, then push words'   silent 'git -C /repo status --short; echo "a push note" -f main'
case_bash 'git call, unquoted words'    silent 'git status; echo push origin main'
case_bash 'git call, flag in prose'     silent 'git fetch && echo "never pass --no-gpg-sign to a commit"'
case_bash 'main is the source'          silent 'git push origin main:feat/x'
case_bash 'push quoted in a message'    silent 'git commit -m "git push -f origin main"'
case_bash 'push line in a heredoc body' silent "git status; cat <<'X'
git push --force origin main
X"
case_bash 'push line in a quoted message' silent 'git commit -m "first line
git push -f origin main
"'
case_bash 'rm -f beside git and prose'  silent "rm -f a.md; git worktree list; echo 'the main push run failed'"
case_bash 'closed heredoc, git after'   silent "cat <<'EOF'
rm -f x
EOF
git worktree list"
case_bash 'flag as a grep pattern'      silent 'git grep -n -- --no-gpg-sign'
case_bash 'config value named in prose' silent 'git status; echo "GIT_CONFIG_PARAMETERS is how git reads commit.gpgsign=false"'
# An assignment only counts where one can stand; as a search pattern it is an
# argument.
case_bash 'config names as search terms' silent 'git status; rg "GIT_CONFIG_KEY_0=commit.gpgsign" -n .claude/ && rg "GIT_CONFIG_VALUE_0=false" -n .claude/'
# The everyday shape of a commit or PR written from a heredoc inside a quoted
# substitution: its body may discuss exactly these words.
case_bash 'commit message from a heredoc' silent "git commit -m \"\$(cat <<'EOF'
Fix the guard

never run git push -f origin main here, and never pass --no-gpg-sign
EOF
)\""
case_bash 'PR body from a heredoc'      silent "gh pr create --title x --body \"\$(cat <<'EOF'
git push --force origin main is refused
EOF
)\""

# ---- Bash guard: the git reader under load -----------------------------
# The hook has a 10 s timeout, and a hook that times out decides nothing — so a
# scan that is slow on a large command is a scan that lets its push through.
# macOS's /usr/bin/awk made a character loop quadratic (an 850 KB command took
# 14 s); a burst of unclosed `<<` was quadratic in every awk. Each case ends in
# a force push to main, must be DENIED, and must answer well inside the budget.
big_case() { # big_case <label> <file>
	start=$(date +%s)
	got=$(jq -Rs --arg w "$tmp" \
		'{hook_event_name:"PreToolUse", cwd:$w, tool_name:"Bash", tool_input:{command:.}}' <"$2" |
		"$hooks/guard-bash.sh" 2>/dev/null |
		jq -r '.hookSpecificOutput.permissionDecision // "silent"' 2>/dev/null || true)
	took=$(($(date +%s) - start))
	[ "$took" -le 5 ] || got="$got after ${took}s"
	check "$1" deny "${got:-silent}"
}
awk 'BEGIN { for (i = 0; i < 20000; i++) printf "echo an-ordinary-generated-line-of-text-number-%d-nothing-special\n", i; printf "git push -f origin main" }' >"$tmp/bulk.txt"
big_case 'a 1.4 MB command, then push' "$tmp/bulk.txt"
awk 'BEGIN { for (i = 0; i < 16000; i++) print "cat <<A"; printf "git push -f origin main" }' >"$tmp/heredocs.txt"
big_case '16000 unclosed heredocs, push' "$tmp/heredocs.txt"
# One LINE, because every other rule's quote-blanking pass reads a line at a
# time: a 400 KB single-line command took 11 s there before it was made linear.
awk 'BEGIN { printf "echo \047"; for (i = 0; i < 1000000; i++) printf "A"; printf "\047 > /tmp/x && git push --force origin main" }' >"$tmp/oneline.txt"
big_case 'a 1 MB single line, then push' "$tmp/oneline.txt"

# A scan that FAILS must not read as "found nothing": with awk broken, a
# command naming git is refused rather than waved through.
mkdir -p "$tmp/brokenawk" && printf '#!/bin/sh\nexit 2\n' >"$tmp/brokenawk/awk" && chmod +x "$tmp/brokenawk/awk"
broken=$(bash_event 'git status' | PATH="$tmp/brokenawk:$PATH" "$hooks/guard-bash.sh" 2>/dev/null |
	jq -r '.hookSpecificOutput.permissionDecision // "silent"' 2>/dev/null || true)
check 'git command, awk broken' deny "${broken:-silent}"

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

f="$tmp/engine/core/src/near.rs"
{ echo '//! Near the cap.'; i=0; while [ $i -lt 270 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'rs within 50 of the cap'     note "$f"

f="$tmp/engine/core/src/mid.rs"
{ echo '//! Comfortably inside.'; i=0; while [ $i -lt 200 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'rs at 200 lines is fine'     silent "$f"

mkdir -p "$tmp/engine/core/src/thing/tests"
f="$tmp/engine/core/src/thing/tests.rs"
{ echo '//! Tests.'; i=0; while [ $i -lt 400 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'a long suite is out of scope' silent "$f"

f="$tmp/engine/core/src/thing/tests/cases.rs"
{ echo '//! Tests.'; i=0; while [ $i -lt 400 ]; do echo "// $i"; i=$((i + 1)); done; } > "$f"
case_edit 'a split suite too'           silent "$f"

f="$tmp/engine/core/src/thing/tests/noheader.rs"
printf '#[test]\nfn a() {}\n' > "$f"
case_edit 'but a suite still needs //!' note "$f"

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

# The HYPHENATED family was invisible to the first pattern, which required two
# letters run straight into a number. It is not a corner: measured against the
# queue, `GUI-nn` and `ENGINE-nn` are the overwhelming majority of live codes,
# and six `GUI-41` comments had already reached the tracked tree unnoticed.
f="$tmp/docs/hyphenated.md"
printf 'See GUI-44 for the surface.\n' > "$f"
case_edit 'hyphenated code in docs'     note "$f"

f="$tmp/gui/designer/src/coded.tsx"
printf '// ENGINE-7 — the wire this pins.\nconst a = 1;\n' > "$f"
case_edit 'hyphenated code in source'   note "$f"

# The list had rotted behind the queue. These six two-letter families and the
# two hyphenated ones were live work items the guard could not see — and the
# hyphenated pair is `SKILL-` and `DOC-`, so the codes of the work being done
# to this very file were invisible to it.
#
# ONE CASE PER FAMILY, deliberately. A single fixture line naming all eight
# passes as long as ANY one of them still matches, because `case_edit` reads
# only note-vs-silent and never the note's CONTENT — so six of the eight could
# be deleted from the guard with this gate staying green, which is precisely
# the rot this change exists to catch. Measured: dropping `GC` alone, or `DOC`
# alone, left the whole suite PASS under the one-line form. Split like this,
# each family reddens on its own.
for fam in GC19 FV8 FM2 MK2 TL1a KC3 SKILL-6 DOC-1; do
	f="$tmp/docs/family-$fam.md"
	printf 'Work item %s is queued.\n' "$fam" > "$f"
	case_edit "family $fam is seen" note "$f"
done

# The measured reason a family is admitted only after it counts zero over the
# tracked tree. `LB` reads exactly like the six above and is UAX #14's own rule
# namespace: engine/layout/src/wrap/kinsoku.rs cites LB19. Admitting it would
# have put a note on a correct citation of the spec the file implements.
mkdir -p "$tmp/engine/layout/src/wrap"
f="$tmp/engine/layout/src/wrap/spec.rs"
printf '//! Kinsoku.\n// LB19 forbids a break on either side of the class.\npub fn a() {}\n' > "$f"
case_edit 'UAX #14 rule names are not codes' silent "$f"

# ...and the reason the pattern is a NAMED prefix list rather than a general
# `[A-Z]{2,}-[0-9]+`: that shape matches the standards and sample identifiers
# this repository is full of. Measured over the tracked tree, the general form
# returns 1330 `OFL-n`, 129 `UTF-n`, 60 `SHA-n` and every order number in
# examples/ — a note that fires on almost every edit teaches people to ignore
# it, which is worse than the miss it was fixing.
#
# Those three are measured AFTER this comment, not before: this file sits
# inside the scanned globs, so writing the figures down changes them. The
# earlier text spelled the families out as `OFL-1`, `UTF-8` and `SHA-256`,
# which the census counted — so recording the census removed one of each from
# it. Spelled `OFL-n` the sentence is a fixed point, which is why it is
# written that way. guard-edit.sh states the same three; they move together.
f="$tmp/docs/standards.md"
printf 'UTF-8, SHA-256, BSD-3, PDF-1.7 and OFL-1.1 are not work items.\n' > "$f"
case_edit 'standards are not codes'     silent "$f"

f="$tmp/docs/sample-ids.md"
printf 'Order INV-2026-001 shipped as SO-2026-14.\n' > "$f"
case_edit 'sample identifiers either'   silent "$f"

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
