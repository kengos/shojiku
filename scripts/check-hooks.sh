#!/bin/sh
# Self-test for the tracked Claude Code hooks (.claude/hooks/*.sh) and the
# secret-scanning git commit hook (.githooks/pre-commit).
#
# The hooks are the deterministic half of this repository's development rules:
# rules that were written into the skills as prose, broken anyway, and moved
# here so they are decided rather than remembered. A hook that silently stops
# deciding therefore removes a control without reddening anything — which is
# the exact failure this gate exists to catch.
#
# Every Claude Code hook case feeds a synthetic hook event on stdin and
# asserts the decision; every commit hook case runs a real `git commit` or
# `git merge` in a temporary repository and asserts whether the commit was
# recorded.
# The table carries BOTH halves: commands that must be caught, and the
# legitimate spellings beside them that must NOT be. A deny rule with no
# negative case is a blindfold waiting to happen.
#
# POSIX sh; jq, git and iconv are the only dependencies (the hooks need jq and
# git too). Every git command reads no global or system configuration
# (GIT_CONFIG_GLOBAL=/dev/null), so a developer's own hooksPath or aliases do
# not change a case.
# The commit hook cases write only under a temporary directory.

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

# The Bash guard refuses a commit, merge or pull unless the project's shared
# hooks directory holds the secret-scanning hooks exactly as `.githooks/`
# holds them in HEAD or origin/main, and no core.hooksPath setting makes git
# read hooks from another directory. The cases run against a temporary project repository with a committed
# `.githooks/` and its hooks installed by scripts/install-commit-hooks.sh (the
# script `make secrets:install` runs); the cases at the end of the guard's
# hook section each change one part of the project's hook installation (the
# installed copies or core.hooksPath).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
project="$tmp/project"
git_tmp() { git -c user.name=t \
	-c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }
git_tmp init -q "$project"
mkdir "$project/.githooks"
for f in pre-commit pre-merge-commit; do
	printf '#!/bin/sh\n# shojiku-secret-scan-hook (scripts/install-commit-hooks.sh recognises an\nexit 0\n' \
		> "$project/.githooks/$f"
done
git_tmp -C "$project" add .githooks
git_tmp -C "$project" commit -q -m hooks
install_hooks() { "$root/scripts/install-commit-hooks.sh" "$1" "$2" >/dev/null; }
install_hooks "$project/.githooks" "$project"
export CLAUDE_PROJECT_DIR="$project"
# The guard counts a statement assignment to an upper-case variable when the
# variable is set in the environment the guard runs with; the cases below
# assume MSG is not set there.
unset MSG

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
case_bash 'cargo after ;'                deny 'x; cargo build'
case_bash 'cargo behind a prefix'       deny 'time cargo test'
case_bash 'cargo opening a subshell'    deny '(cargo test)'
# A heredoc fed to a SHELL is commands, so its body is read, not skipped.
case_bash 'cargo in a heredoc run by sh' deny 'sh <<EOF
cargo test
EOF'

# A shell metacharacter inside a QUOTED argument is not a separator, and the two
# rules about `make` used to read it as one — in BOTH directions. The quoted-`;`
# row is the serious one: it truncated the scan and let a genuinely piped gate
# through, i.e. the control failed OPEN.
case_bash 'quoted ; then a real pipe'   deny "make gui:test F='a;b' | tail -40"
case_bash 'quoted && then a real pipe'  deny "make gui:test F='a&&b' | tail -40"
case_bash 'quoted || then a real pipe'  deny "make engine:test F='x||y' | grep error"
case_bash 'pipe with no spaces'         deny 'make engine:test|tail -40'
# Both rules about `make` used to read only LINE 1 of the command, so a gate on
# any later line was waved through — failing open, the serious direction.
case_bash 'gate piped on line 2'        deny 'cd x
make engine:test | tail -40'
case_bash 'make -n on line 2'           deny 'cd x
make -n verify'
case_bash 'gate piped after make help'  deny 'make help
gmake gui:verify | grep -i error'
case_bash 'gate piped in a substitution' deny 'out=$(make engine:test | tail -5)'
case_bash 'gate piped in backticks'     deny 'echo `make engine:test|tail`'
case_bash 'piped with 2>&1 first'       deny 'make engine:test 2>&1 | tail -40'
case_bash 'piped stderr and stdout'     deny 'make engine:test |& tail -40'
case_bash 'gate piped in a sh heredoc'  deny 'sh <<EOF
make engine:test | tail -40
EOF'

# ---- Bash guard: heavy commands piped into a filter --------------------
# The output of an expensive command piped into tail/head/grep is lost, and a
# miss means running it again. One row per member of the heavy set, then the
# filters, then the spellings that keep the output.
case_bash 'docker run to tail'          deny 'docker run --rm img render 2>&1 | tail -20'
case_bash 'docker build to grep'        deny 'docker build -t x . | grep -i error'
case_bash 'docker compose run to head'  deny 'docker compose run --rm app test | head -50'
case_bash 'cargo to grep -c'            deny 'cargo test | grep -c ok'
case_bash 'cargo to rg'                 deny 'cargo clippy 2>&1 | rg warning'
case_bash 'pnpm test to tail'           deny 'pnpm -C gui test 2>&1 | tail -40'
case_bash 'npm run build to less'       deny 'npm run build | less'
case_bash 'npx tsc to head'             deny 'npx tsc --noEmit | head'
case_bash 'npx vitest to sed -n'        deny 'npx vitest run | sed -n 1,5p'
case_bash 'vitest to grep -E'           deny 'vitest run | grep -E "FAIL|PASS"'
case_bash 'playwright to tail'          deny 'playwright test 2>&1 | tail -30'
case_bash 'gh run view --log to grep'   deny 'gh run view 123 --log | grep error'
case_bash 'gh run view --log-failed'    deny 'gh run view 123 --log-failed |& head -50'
case_bash 'gh run watch to tail'        deny 'gh run watch 123 | tail -5'
case_bash 'claude -p to head'           deny 'claude -p "hi" | head -3'
case_bash 'heavy to awk NR'             deny 'docker run x | awk "NR<3"'
case_bash 'heavy to tee then tail'      deny 'docker run x 2>&1 | tee /tmp/a.log | tail'
case_bash 'heavy on a later line'       deny 'cd x
pnpm test | tail'
case_bash 'heavy after &&'              deny 'cd gui && pnpm test 2>&1 | tail'

# The deny message names the per-session scratch path the replacement writes to.
msg=$(jq -n '{session_id:"sess-42", cwd:"/tmp", tool_input:{command:"docker run x | tail"}}' |
	"$hooks/guard-bash.sh" 2>/dev/null | jq -r '.hookSpecificOutput.permissionDecisionReason // ""')
case $msg in
*'~/shojiku-work/tmp/sess-42/'*) check 'deny message carries session path' deny deny ;;
*) check 'deny message carries session path' deny "message: $msg" ;;
esac
case_bash 'heavy into the session dir' silent 'docker run x > ~/shojiku-work/tmp/s1/a.log 2>&1'
case_bash 'heavy into /tmp stays ok'   silent 'docker run x > /tmp/a.log 2>&1'
case_bash 'heavy redirected to a file'  silent 'docker run x > /tmp/a.log 2>&1'
case_bash 'heavy &> a file'             silent 'pnpm test &> /tmp/a.log'
case_bash 'heavy to tee only'           silent 'docker run x 2>&1 | tee /tmp/a.log'
case_bash 'file read in its own call'   silent 'grep -n error /tmp/a.log'
case_bash 'file read, tail -n'          silent 'tail -n 50 /tmp/a.log'
case_bash 'heavy then read the file'    silent 'pnpm test > /tmp/a.log 2>&1; grep -n FAIL /tmp/a.log'
case_bash 'git log to grep'             silent 'git log --oneline | grep fix'
case_bash 'ls to head'                  silent 'ls | head'
case_bash 'docker ps to grep'           silent 'docker ps | grep shojiku'
case_bash 'docker images to head'       silent 'docker images | head'
case_bash 'gh pr list to head'          silent 'gh pr list | head'
case_bash 'gh run view without log'     silent 'gh run view 123 | head'
case_bash 'pnpm install to tail'        silent 'pnpm install | tail -3'
case_bash 'npm view to head'            silent 'npm view left-pad | head'
case_bash 'claude --version to head'    silent 'claude --version | head -1'
case_bash 'echo naming a piped heavy'   silent 'echo "cargo test | tail"'
case_bash 'commit msg naming one'       silent "git commit -m 'deny docker run x | tail and cargo test | head'"
case_bash 'heredoc naming one'          silent 'cat <<EOF
docker run x | tail
cargo test | grep ok
EOF'

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
# file, six times in one cycle. It reads the shell's own word split now.
case_bash 'name inside a quoted string' silent 'echo "docker rm -f x; cargo test"'
case_bash 'quoted name under grep -n'   silent 'grep -n "x; cargo test" file'
case_bash 'quoted push to main'         silent 'echo "git push origin main"'
# A BACKSLASH-escaped pipe is a literal `|` passed as an argument, exactly as it
# is in a shell — so it is not a pipeline and the gate rule does not apply.
case_bash 'escaped pipe after a gate'   silent 'make engine:test \| tail -40'
# A heredoc body is data: prose that NAMES a piped gate or `make -n` on its own
# line is not one, whichever line the body starts on.
case_bash 'piped gate in heredoc prose' silent "cd x
cat <<'EOF'
make engine:test | tail -40
make -n verify
EOF"
case_bash 'make help piped on line 2'   silent 'cd x
make help | grep engine'
case_bash 'gate || fallback'            silent 'make engine:test > /tmp/e.log 2>&1 || cat .make-logs/last-error.log'
case_bash 'gate redirected with >|'     silent 'make engine:test >| /tmp/e.log'
case_bash 'make help redirected'        silent 'make help > /tmp/h.txt; head -n 5 /tmp/h.txt'
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
# Any other heredoc body is data. The cargo rule split each LINE on whitespace,
# so a body line beginning with the word, or a prose `(no` read as a subshell
# whose next word is the command, was refused as host cargo — two edits to
# skill prose on 2026-10-14, both of which invoked only python and cat.
case_bash 'cargo opening a python heredoc line' silent "python3 - <<'EOF'
edit('x', \"\"\"...staying in Docker.\"\"\", \"\"\"...the
cargo target is a pooled volume now...\"\"\")
EOF"
case_bash 'cargo after a prose (no'      silent "cat >> notes.md <<'EOF'
containing \"cargo\" + build words
  (no cargo invocation).
EOF"
case_bash 'cargo after (no, no heredoc'  silent 'echo x; (no cargo here)'
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
# One LINE, because the quote-blanking pass the make rules once used read a line
# at a time: a 400 KB single-line command took 11 s there before it was linear.
awk 'BEGIN { printf "echo \047"; for (i = 0; i < 1000000; i++) printf "A"; printf "\047 > /tmp/x && git push --force origin main" }' >"$tmp/oneline.txt"
big_case 'a 1 MB single line, then push' "$tmp/oneline.txt"
# The two rules about `make` read the same whole-command scan, so the same load
# must leave a piped gate on the LAST line just as refused.
awk 'BEGIN { for (i = 0; i < 20000; i++) printf "echo an-ordinary-generated-line-of-text-number-%d-nothing-special\n", i; printf "make engine:test | tail -40" }' >"$tmp/bulkmake.txt"
big_case 'a 1.4 MB command, then piped gate' "$tmp/bulkmake.txt"

# A scan that FAILS must not read as "found nothing": with awk broken, a
# command naming git is refused rather than waved through.
mkdir -p "$tmp/brokenawk" && printf '#!/bin/sh\nexit 2\n' >"$tmp/brokenawk/awk" && chmod +x "$tmp/brokenawk/awk"
broken=$(bash_event 'git status' | PATH="$tmp/brokenawk:$PATH" "$hooks/guard-bash.sh" 2>/dev/null |
	jq -r '.hookSpecificOutput.permissionDecision // "silent"' 2>/dev/null || true)
check 'git command, awk broken' deny "${broken:-silent}"

# No local squash: a soft reset onto a remote-tracking ref is denied; a reset
# to the branch's own history (amending) and a rebase are not.
case_bash 'reset --soft origin/main'    deny 'git reset --soft origin/main'
case_bash 'reset --soft upstream ref'   deny 'git reset --soft @{upstream}'
case_bash 'reset --soft HEAD~1'         silent 'git reset --soft HEAD~1'
case_bash 'reset --hard origin/main'    silent 'git reset --hard origin/main'
case_bash 'rebase origin/main'          silent 'git rebase origin/main'
case_bash 'reset --soft refs/remotes'   deny 'git reset --soft refs/remotes/origin/main'
case_bash 'echo naming reset --soft'    silent 'echo "never run git reset --soft origin/main"'
case_bash 'commit msg naming reset'     silent 'git commit -m "no more git reset --soft origin/main"'
case_bash 'grep naming reset --soft'    silent 'grep -rn "reset --soft origin/main" docs'

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

# ---- Bash guard: the secret-scanning commit hook -----------------------
case_bash 'commit --no-verify'           deny   'git commit --no-verify -m x'
case_bash 'commit --no-veri (a prefix)'  deny   'git commit --no-veri -m x'
case_bash 'pull --no-verify'             deny   'git pull --no-verify origin main'
case_bash 'hooksPath by --config-env'    deny   'HP=/dev/null git --config-env=core.hooksPath=HP commit -m x'
case_bash 'hooksPath, --config-env word' deny   'HP=/dev/null git --config-env core.hooksPath=HP commit -m x'
case_bash 'alias by -c'                  deny   "git -c alias.c='commit --no-verify' c -m x"
case_bash 'alias written by git config'  deny   "git config alias.ci 'commit --no-verify'"
case_bash 'include by -c'                deny   'git -c include.path=/tmp/h.cfg commit -m x'
case_bash 'signing off by --config-env'  deny   'V=false git --config-env=commit.gpgsign=V commit -m x'
case_bash 'hooksPath, config --add'      deny   'git config --add core.hooksPath .githooks'
case_bash 'commit -n'                    deny   'git commit -n -m x'
case_bash 'commit -n in a group'         deny   'git commit -anm x'
case_bash 'merge --no-verify'            deny   'git merge --no-verify feature'
case_bash 'hooksPath by -c'              deny   'git -c core.hooksPath=/dev/null commit -m x'
case_bash 'hooksPath by the environment' deny   'GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null GIT_CONFIG_COUNT=1 git commit -m x'
case_bash 'hooksPath set by git config'  deny   'git config core.hooksPath /tmp/none'
case_bash 'hooksPath unset'              deny   'git config --unset core.hooksPath'
case_bash 'hooksPath, config set'        deny   'git config set core.hooksPath x'
case_bash 'docker stub for the hook'     deny   'SHOJIKU_GITLEAKS_DOCKER=true git commit -m x'
case_bash 'n inside a -m group'          silent 'git commit -mnote'
case_bash 'n inside -uno'                silent 'git commit -uno -m x'
case_bash '--no-verbose is not the flag' silent 'git commit --no-verbose -m x'
case_bash 'hooksPath set to .githooks'   deny   'git config core.hooksPath .githooks'
case_bash 'PATH before a commit'         deny   'PATH=/tmp/fake:$PATH git commit -m x'
case_bash 'HOME exported, then commit'   deny   'export HOME=/tmp/h && git commit -m x'
case_bash 'DOCKER_HOST before a merge'   deny   'DOCKER_HOST=tcp://x:2375 git merge feature'
case_bash 'author date allowed'          silent 'GIT_AUTHOR_DATE=2026-01-01T00:00:00 git commit -m x'
case_bash 'locale allowed'               silent 'LC_ALL=C git commit -m x'
case_bash 'PATH without a commit'        silent 'PATH=/tmp/x:$PATH ls'
case_bash 'commit -C elsewhere'          silent 'git -C ~/elsewhere commit -m x'
case_bash 'config -f, reading hooksPath' silent 'git config -f x.cfg core.hooksPath'
case_bash 'variable before merge --abort' silent 'FOO=1 git merge --abort'
git_tmp -C "$project" config alias.ci 'commit --no-verify'
git_tmp -C "$project" config alias.co commit
git_tmp -C "$project" config alias.sci '!git commit -n'
case_bash 'alias expanding to --no-verify' deny  'git ci -m x'
case_bash 'alias to commit, then -n'     deny   'git co -n -m x'
case_bash 'shell alias with -n'          deny   'git sci'
case_bash 'alias to commit, clean'       silent 'git co -m x'
git_tmp -C "$project" config alias.c2 ci
git_tmp -C "$project" config alias.last '!git log -n 1'
git_tmp -C "$project" config alias.commit 'commit --no-verify'
case_bash 'alias of an alias'            deny   'git c2 -m x'
case_bash 'shell alias -n without commit' silent 'git last'
case_bash 'alias named like a built-in'  silent 'git commit -m x'
case_bash 'lower-case shell variable'    silent 'msg=$(cat m.txt) && git commit -m "$msg"'
case_bash 'exec-path before a commit'    deny   'git --exec-path=/tmp/x commit -m x'
case_bash 'variable before another tool' silent 'V=1 make gui:verify && git commit -m x'
case_bash 'assignments inside a message'  silent 'git commit -m "$(cat <<'"'"'EOF'"'"'
Fix the release script

export HOME=/tmp/x
PATH=/tmp/fake git commit
EOF
)"'
case_bash 'GPG_TTY before a commit'      silent 'GPG_TTY=$(tty) git commit -m x'
case_bash 'PATH as its own statement'    deny   'PATH=/tmp/x:$PATH; git commit -m x'
case_bash 'lower-case statement'         silent 'msg=x; git commit -m "$msg"'
case_bash 'upper-case shell variable'    silent 'MSG=$(cat m.txt) && git commit -m "$MSG"'
case_bash 'GIT_TRACE before a commit'    silent 'GIT_TRACE=1 git commit -m x'
case_bash 'environment variable, statement' deny 'CLAUDE_PROJECT_DIR=/x; git commit -m x'
case_bash 'assignment inside $( )'       silent 'git commit -m "$(PATH=/x; echo hi)"'
case_bash 'variable before git, then $( )' deny 'GIT_FOO=1 msg=$(true) git commit -m x'
case_bash 'HOME as its own statement'    deny   'HOME=/tmp/h; git commit -m x'
case_bash 'env PATH= before a commit'    deny   'env PATH=/tmp/x git commit -m x'
case_bash 'exec-path, only printing'     silent 'git --exec-path'
case_bash 'Commit in mixed case'         deny   'git Commit --no-verify -m x'
case_bash 'IFS in a read loop'           silent 'while IFS= read -r l; do :; done < f; git commit -m x'
case_bash 'merge editor variable'        silent 'GIT_MERGE_AUTOEDIT=no git merge feature'
git_tmp -C "$project" config --remove-section alias
case_bash 'reading an alias'             silent 'git config alias.ci'
case_bash 'n inside a -m value'          silent 'git commit -m -n'
case_bash 'n in a --message value'       silent 'git commit --message -n'
case_bash 'merge -n is --no-stat'        silent 'git merge -n feature'
case_bash 'reading hooksPath'            silent 'git config core.hooksPath'
case_bash 'reading hooksPath, --get'     silent 'git config --get core.hooksPath'
case_bash 'prose naming --no-verify'     silent 'echo "never git commit --no-verify"'
git_tmp -C "$project" config core.hooksPath .githooks
case_bash 'commit, hooksPath set'        deny   'git commit -m x'
case_bash 'merge, hooksPath set'         deny   'git merge origin/main'
case_bash 'pull, hooksPath set'          deny   'git pull'
case_bash 'merge --abort, hooksPath set' silent 'git merge --abort'
case_bash 'status, hooksPath set'        silent 'git status'
install_hooks "$project/.githooks" "$project"
case_bash 'commit, hooks installed'      silent 'git commit -m x'
echo '# edited' >> "$project/.git/hooks/pre-commit"
case_bash 'commit, installed copy edited' deny  'git commit -m x'
install_hooks "$project/.githooks" "$project"
rm "$project/.git/hooks/pre-merge-commit"
case_bash 'merge, a hook not installed'  deny   'git merge origin/main'
install_hooks "$project/.githooks" "$project"
chmod -x "$project/.git/hooks/pre-commit"
case_bash 'commit, hook not executable'  deny   'git commit -m x'
install_hooks "$project/.githooks" "$project"
case_bash 'commit, reinstalled'          silent 'git commit -m x'
# The shared hooks directory serves worktrees on branches of different ages:
# a copy equal to origin/main passes while HEAD holds a newer version.
git_tmp -C "$project" update-ref refs/remotes/origin/main HEAD
echo '# newer' >> "$project/.githooks/pre-commit"
git_tmp -C "$project" commit -q -am 'newer hook'
case_bash 'installed copy = origin/main' silent 'git commit -m x'
git_tmp -C "$project" update-ref -d refs/remotes/origin/main
case_bash 'installed copy older than HEAD' deny 'git commit -m x'
install_hooks "$project/.githooks" "$project"

# ---- Commit hook: .githooks/pre-commit refuses a staged secret ----------
# `make secrets:scan` runs the real gitleaks and checks that it still reports
# generated secrets despite the allowlists. This section runs real `git
# commit`s in a temporary repository whose shared hooks directory holds this
# checkout's .githooks, installed by scripts/install-commit-hooks.sh as `make
# secrets:install` installs them, with a stub in place of `docker`, so it runs
# without Docker. The stub reports a finding for each copied file that
# holds a GitHub-token-shaped value (the hook's generated check token
# included), except a line holding the marker `gitleaks:allow` when the hook
# omits `--ignore-gitleaks-allow` (gitleaks itself skips such a line). When
# the hook omits `--network none`, `--pull never`, the read-only `/scan` mount,
# `--max-archive-depth=8` or `--config`, or passes the staged `.gitleaks.toml`
# (a case below stages one that holds `WIDENED`), the stub writes no JSON
# report, so the hook refuses every commit and the `committed` cases fail. A commit with no HEAD has no committed `.gitleaks.toml`, so the hook
# passes no `--config`; STUB_NO_HEAD=1 tells the stub to expect that.
stub="$tmp/docker-stub"
cat > "$stub" <<'STUB'
#!/bin/sh
mode=${STUB_DOCKER:-up}
case "$1" in
info) [ "$mode" != down ]; exit ;;
image) [ "$mode" != nopull ]; exit ;;
esac
# The docker options must come before the image name; the gitleaks options
# after it.
before=" ${*%%zricethezav/gitleaks*} "
after=" ${*#*zricethezav/gitleaks}"
for need in ' --network none ' ' --pull never ' ':/scan:ro '; do
	case "$before" in *"$need"*) ;; *) echo "stub: $need missing before the image" >&2; exit 1 ;; esac
done
case "$after" in *' --max-archive-depth=8 '*) ;; *) echo 'stub: --max-archive-depth=8 missing after the image' >&2; exit 1 ;; esac
marker=gitleaks:allow
case "$after" in *' --ignore-gitleaks-allow '*) marker='no marker is honoured' ;; esac
if [ "${STUB_NO_HEAD:-}" != 1 ]; then
	case "$after" in *' --config /gitleaks.toml '*) ;; *) echo 'stub: --config missing after the image' >&2; exit 1 ;; esac
fi
[ "$mode" = broken ] && { echo 'stub: gitleaks crashed' >&2; exit 1; }
[ "$mode" = empty ] && { echo '[]'; exit 0; }
scan=$(printf '%s\n' "$@" | sed -n 's#^\(.*\):/scan:ro$#\1#p')
config=$(printf '%s\n' "$@" | sed -n 's#^\(.*\):/gitleaks.toml:ro$#\1#p')
[ -n "$config" ] && grep -q WIDENED "$config" && { echo 'stub: the staged config was used' >&2; exit 1; }
cd "$scan" || exit 1
# gitleaks's default configuration skips files named gitleaks.toml or
# .gitleaks.toml; the stub skips them too.
find . -name gitleaks.toml -o -name .gitleaks.toml | while IFS= read -r f; do mv "$f" "$f.skipped"; done
# Every staged copy sits in a numbered directory of its own.
ls staged | grep -qv '^[0-9][0-9]*$' && { echo 'stub: staged/ holds a name that is not a number' >&2; exit 1; }
grep -rE --exclude='*.skipped' 'ghp_[A-Za-z0-9]{36}' . | grep -vF "$marker" | cut -d: -f1 | sort -u | sed 's#^\./#/scan/#' |
	jq -R '{RuleID: "github-pat", File: ., StartLine: 1}' | jq -s .
exit 1
STUB
chmod +x "$stub"

repo="$tmp/commit-repo"
token="ghp_$(printf '%036d' 0 | tr 0 A)"
export SHOJIKU_GITLEAKS_DOCKER="$stub"
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid
export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
git init -q -b main "$repo"
install_hooks "$root/.githooks" "$repo"
git -C "$repo" config commit.gpgsign false

# case_commit <label> <committed|refused|unscanned> <command run in the repository>
# refused: the hook reported a secret; unscanned: the hook refused because it
# could not scan; committed: the commit was recorded.
case_commit() {
	before=$(git -C "$repo" rev-parse -q --verify HEAD || echo none)
	if (cd "$repo" && sh -c "$3") >/dev/null 2>"$tmp/commit.err"; then status=0; else status=1; fi
	after=$(git -C "$repo" rev-parse -q --verify HEAD || echo none)
	if [ "$status" = 0 ] && [ "$before" != "$after" ]; then got=committed
	elif [ "$status" != 0 ] && [ "$before" = "$after" ] && grep -q 'gitleaks reported a secret' "$tmp/commit.err"; then got=refused
	elif [ "$status" != 0 ] && [ "$before" = "$after" ] && grep -q 'could not be scanned' "$tmp/commit.err"; then got=unscanned
	else got="exit $status, HEAD moved: $([ "$before" != "$after" ] && echo yes || echo no)"
	fi
	check "$1" "$2" "$got"
}
secret() { printf 'token = "%s"\n' "$token" > "$repo/$1"; }

secret first.txt
case_commit 'first commit, no HEAD'           refused   'git add -A && STUB_NO_HEAD=1 git commit -q -m x'
rm "$repo/first.txt"
printf '[extend]\nuseDefault = true\n' > "$repo/.gitleaks.toml"
echo clean > "$repo/tracked.txt"
echo gone > "$repo/deleted.txt"
case_commit 'first commit, clean'             committed 'git add -A && STUB_NO_HEAD=1 git commit -q -m init'

secret conf.rb
case_commit 'new file, add + commit'          refused   'git add -A && git commit -q -m x'
git -C "$repo" reset -q
case_commit 'unstaged secret, other file'     committed 'echo more >> tracked.txt && git commit -q -m x tracked.txt'
rm "$repo/conf.rb"

printf 'token = "%s"\n' "$token" >> "$repo/tracked.txt"
case_commit 'tracked file, commit -a'         refused   'git commit -q -am x'
case_commit 'tracked file, commit <path>'     refused   'git commit -q -m x tracked.txt'
case_commit 'tracked file, amend'             refused   'git add tracked.txt && git commit -q --amend -m x'
git -C "$repo" checkout -q HEAD -- tracked.txt

secret conf.rb
git -C "$repo" add conf.rb
echo clean > "$repo/conf.rb"
case_commit 'staged secret, clean worktree'   refused   'git commit -q -m x'
git -C "$repo" rm -q -f --cached conf.rb
rm "$repo/conf.rb"

printf 'token = "%s" # gitleaks:allow\n' "$token" > "$repo/marked.txt"
case_commit 'gitleaks:allow in the commit'    refused   'git add -A && git commit -q -m x'
git -C "$repo" rm -q -f --cached marked.txt
rm "$repo/marked.txt"

# The hook copies the staged blob as stored; a .gitattributes conversion
# applied on checkout (here UTF-16, so `git add` stores the UTF-8 text and a
# checkout writes UTF-16) does not change what gitleaks reads.
printf 'enc.txt working-tree-encoding=UTF-16LE\n' > "$repo/.gitattributes"
git -C "$repo" add .gitattributes
git -C "$repo" commit -q --no-verify -m attributes
printf 'token = "%s"\n' "$token" | iconv -f UTF-8 -t UTF-16LE > "$repo/enc.txt"
case_commit 'working-tree-encoding file'      refused   'git add enc.txt && git commit -q -m x'
git -C "$repo" rm -q -f --cached enc.txt
rm "$repo/enc.txt"
git -C "$repo" rm -q .gitattributes
git -C "$repo" commit -q --no-verify -m 'no attributes'

secret later.txt
case_commit 'intent-to-add entry skipped'     committed 'git add -N later.txt && echo more >> tracked.txt && git commit -q -m x tracked.txt'
git -C "$repo" rm -q -f --cached later.txt
rm "$repo/later.txt"

# Two staged paths that differ only in letter case are one file on a
# case-insensitive file system (macOS); the hook copies each into its own
# directory, so the secret in the first is scanned too.
secret_blob=$(printf 'token = "%s"\n' "$token" | git -C "$repo" hash-object -w --stdin)
clean_blob=$(echo clean | git -C "$repo" hash-object -w --stdin)
git -C "$repo" update-index --add --cacheinfo "100644,$secret_blob,Case.txt"
git -C "$repo" update-index --add --cacheinfo "100644,$clean_blob,case.txt"
case_commit 'paths differing only in case'    refused   'git commit -q -m x'
git -C "$repo" rm -q -f --cached Case.txt case.txt

# A staged path holding a newline is refused rather than read wrongly; a
# submodule entry (mode 160000) is skipped.
git -C "$repo" update-index --add --cacheinfo "100644,$clean_blob,$(printf 'a\nb')"
case_commit 'path with a newline'             unscanned 'git commit -q -m x'
git -C "$repo" rm -q -f --cached "$(printf 'a\nb')"
git -C "$repo" update-index --add --cacheinfo "160000,$(git -C "$repo" rev-parse HEAD),sub"
case_commit 'submodule entry skipped'         committed 'echo more >> tracked.txt && git add tracked.txt && git commit -q -m x'
git -C "$repo" rm -q --cached sub
git -C "$repo" commit -q -m 'no submodule'

secret 設定.txt
case_commit 'non-ASCII file name'             refused   'git add -A && git commit -q -m x'
rm "$repo/設定.txt"

# gitleaks skips a file named .gitleaks.toml; the hook scans a second copy of
# a staged one under another name.
printf '# token = "%s"\n' "$token" >> "$repo/.gitleaks.toml"
case_commit 'secret in .gitleaks.toml'        refused   'git commit -q -am x'
git -C "$repo" checkout -q HEAD -- .gitleaks.toml

# The stub fails, and the commit is refused, if the hook passes the staged
# .gitleaks.toml instead of the one committed in HEAD.
printf '\n[[allowlists]]\nregexes = ["WIDENED"]\n' >> "$repo/.gitleaks.toml"
case_commit 'staged config is not the config' committed 'git commit -q -am x'
git -C "$repo" reset -q --hard HEAD~1

case_commit 'deletion only, Docker down'      committed 'STUB_DOCKER=down git rm -q deleted.txt && STUB_DOCKER=down git commit -q -m x'
echo safe > "$repo/safe.txt"
git -C "$repo" add safe.txt
case_commit 'Docker not running'              unscanned   'STUB_DOCKER=down git commit -q -m x'
case_commit 'image not pulled'                unscanned   'STUB_DOCKER=nopull git commit -q -m x'
case_commit 'gitleaks failed'                 unscanned   'STUB_DOCKER=broken git commit -q -m x'
case_commit 'check token not reported'        unscanned   'STUB_DOCKER=empty git commit -q -m x'
case_commit 'clean staged file'               committed 'git commit -q -m x'

# A branch with no .gitleaks.toml in HEAD (here an orphan branch, which has no
# HEAD at all) is scanned with the one in origin/main; the stub refuses a scan
# without `--config`.
git -C "$repo" update-ref refs/remotes/origin/main HEAD
git -C "$repo" checkout -q --orphan old
case_commit 'config from origin/main'         committed 'git commit -q -m x'
git -C "$repo" checkout -q -f main
git -C "$repo" branch -q -D old
git -C "$repo" update-ref -d refs/remotes/origin/main

git -C "$repo" checkout -q -b feature
secret feature.txt
git -C "$repo" add feature.txt
git -C "$repo" commit -q --no-verify -m 'unscanned secret'
git -C "$repo" checkout -q main
case_commit 'merge commit, pre-merge-commit'  refused   'git merge -q --no-ff --no-edit feature'
git -C "$repo" merge -q --abort 2>/dev/null || git -C "$repo" reset -q --hard
case_commit 'merge commit, clean'             committed 'git checkout -q -b clean && echo c > c.txt && git add c.txt && git commit -q -m c && git checkout -q main && git merge -q --no-ff --no-edit clean'
unset SHOJIKU_GITLEAKS_DOCKER
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

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
