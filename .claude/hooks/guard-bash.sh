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

# The shared half of the two rules about `make`: the command as the SHELL would
# read its metacharacters — every quoted span blanked to spaces, so a `|`, `;`,
# `&&` or `-n` inside an argument is no longer mistaken for one outside.
#
# Blanking rather than deleting keeps offsets and word boundaries intact, which
# is what lets the two rules below keep the regexes they already had: the change
# is what they are matched AGAINST, not what they look for.
#
# Quoting, not token boundaries, is the distinguishing fact here — which is why
# `at_command_position`'s whitespace tokenizer does not serve this pair. A real
# pipe can be written with no spaces around it (`make x|head`), so `x|head` and
# `F='a|b'` are one token either way; only the quotes tell them apart.
#
# Both directions were live before this, and the second is the serious one:
#
#   - a quoted `|` or `-n` DENIED a legitimate call — `make gui:test F='a|b'`
#     is the ordinary way to run two suites, and it fired twice in one cycle;
#   - a quoted `;`, `&&` or `||` truncated the scan and let a genuinely piped
#     gate THROUGH — `make gui:test F='a;b' | tail -40` was allowed. A control
#     that fails open is the failure this directory exists to prevent.
#
# `\` escapes the next character outside single quotes, as it does in a shell,
# so `make engine:test \| tail` passes a literal `|` as an argument rather than
# opening a pipeline. (A real target on purpose: `make:check` scans the tracked
# tree for `make <name>` and refuses a name that is not a target — including one
# invented for a comment, which is how this very line first reddened CI.)
#
# An UNTERMINATED quote leaves the rest of the line quoted, and therefore
# blanked. That is the shell's own reading — such a command does not run as
# written, it waits for the closing quote — so nothing after one can be a
# working piped gate, and there is nothing there for the rule to catch.
#
# It must stay LINEAR in every awk, because it runs on every command and the
# hook has a 10 s timeout that decides nothing when it fires. macOS's
# /usr/bin/awk makes `substr(s, i, 1)` and `length(s)` cost the length of `s`,
# and appending one character to a growing string costs its length in every
# awk — a 400 KB single-line command took 11 s. So characters are read from a
# moving 4096-character window, and the view is built in 4096-character pieces.
BLANK='
	function unquoted_view(s,   i, c, q, out, part, parts, len, base, chunk) {
		q = ""; out = ""; part = ""; parts = 0; len = length(s); base = -1
		for (i = 1; i <= len; i++) {
			if (base < 0 || i > base + 4096) { base = i - 1; chunk = substr(s, i, 4096) }
			c = substr(chunk, i - base, 1)
			if (c == "\\" && q != "'"'"'") { part = part "  "; parts += 2; i++ }
			else if (q == "") {
				if (c == "'"'"'" || c == "\"") { q = c; part = part " " }
				else part = part c
				parts++
			} else {
				part = part " "
				parts++
				if (c == q) q = ""
			}
			if (parts >= 4096) { out = out part; part = ""; parts = 0 }
		}
		return out part
	}
	function after_make(s,   m) {
		if (match(s, /(^|[;&|(])[ \t]*([A-Za-z_][A-Za-z0-9_]*=[^ \t]*[ \t]+)*(sudo[ \t]+)?g?make[ \t]/) == 0) return ""
		return substr(s, RSTART + RLENGTH)
	}
'

# Does a pipe follow the make invocation, before any `;` or `&&` ends it?
piped_after_make() {
	printf '%s' "$cmd" | awk "$BLANK"'
		{
			rest = after_make(unquoted_view($0))
			if (rest == "") exit 1
			if (match(rest, /\|\||;|&&/) > 0) rest = substr(rest, 1, RSTART - 1)
			exit (index(rest, "|") > 0) ? 0 : 1
		}'
}

# Does a dry-run FLAG follow the make invocation, before any separator ends it?
# The twin of `piped_after_make`: same scan, looking for the flag rather than a
# pipe, so a `-n` belonging to a LATER command in the same call is not make's.
dry_run_after_make() {
	printf '%s' "$cmd" | awk "$BLANK"'
		{
			rest = after_make(unquoted_view($0))
			if (rest == "") exit 1
			if (match(rest, /\|\||;|&&|\|/) > 0) rest = substr(rest, 1, RSTART - 1)
			exit (match(rest, /(^|[ \t])(-n|--dry-run|--just-print|--recon)([ \t]|$)/) > 0) ? 0 : 1
		}'
}

# Is NAME invoked as a COMMAND, or merely NAMED inside an argument?
#
# Tokenizing tells the two apart WHEN the name sits inside one token — an
# alternation in a quoted regex gives the token `"make|cargo`, not `make`, so it
# never matches. That is not the whole story, and the gap cost this cycle three
# more wrong denials: a quoted argument with a SPACE after a separator splits
# into two tokens, the first ending in `;`, which opens a command position. The
# tokenizer then read a name inside a quoted string as a command — and the
# string in question was a FIXTURE in `scripts/check-hooks.sh`, so the guard
# refused the edit that was documenting its own defect, three times running.
#
# So it reads the BLANKED view as well: quoting is what decides whether a
# metacharacter is a separator, and `unquoted_view` is the one place that
# decision is made.
#
# That cost this repository six wrong denials in a single cycle: a sweep over
# the development skills, the minimal probe written to reproduce it, the
# write-up of the incident, a zero-context reviewer's own probes, the edit
# recording the correction, and the edit making this fix — two of them on the
# push rules rather than the cargo one. A guard that refuses the
# documentation of its own defect, and then the fix for it, is not being read
# as a decision.
#
# So the tokenizer is written once, here, and the rules that were matching a
# raw string use it. Leading VAR=value assignments are skipped (`V=1 make ...`),
# and a token that IS or ENDS in a separator opens a new command position, so
# `cd engine && cargo clippy` and `docker rm -f x; cargo test` are
# still caught.
at_command_position() {
	printf '%s' "$cmd" | awk -v want="$1" "$BLANK"'
		{
			n = split(unquoted_view($0), tok, /[ \t]+/)
			start = 1
			for (i = 1; i <= n; i++) {
				t = tok[i]
				if (t == "") continue
				if (start && t ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
				if (start && t == want) { found = 1; exit }
				start = (t ~ /[|;&]$/ || t ~ /^[|;&(]/)
			}
		}
		END { exit(found ? 0 : 1) }'
}

# A command-position invocation: start of the command or just after a
# separator, allowing leading VAR=value assignments (`V=1 make ...`).
POS='(^|[;&|(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
MAKE="$POS(sudo[[:space:]]+)?g?make([[:space:]]|$)"

# The git rules decide from a git INVOCATION's own words, and nothing else in
# the command. Anchoring only the verb was not enough: the push rules found
# `git` at a command position and then looked for `push`, `-f` and `main`
# ANYWHERE, so a registry update whose heredoc prose said "main" and "push",
# beside an `rm -f` and a `git worktree list`, was refused as a force push to
# main; and the signing rule refused the plan for this very fix, whose prose
# named the flag beside an `&& git`. Both times the command pushed nothing.
#
# So the whole command is read once, the way the shell reads it, and every
# command-position `git` is recorded as its global options, its subcommand and
# its arguments:
#
#   - quotes and backslashes remove their characters from the words, and an
#     unquoted `;`, `&`, `|` or newline ends a command;
#   - `$( … )`, a backtick pair and a `( … )` subshell hold commands of their
#     own, but they sit INSIDE the command around them — `git -C $(pwd) push`
#     is still one push — so they are scanned as a nested level and the outer
#     invocation carries on after them;
#   - a heredoc body is not commands, but only a heredoc that really closes is
#     skipped: `<<<` is a here-string, and a `<<` whose delimiter line never
#     appears (`$(( 1 << 3 ))`) is not a heredoc at all. Skipping to the end on
#     a guess would let everything after it through. `<<""` is a heredoc closed
#     by an EMPTY line, not a `<<` waiting for its delimiter word;
#   - transparent prefixes (`sudo`, `env`, `command`, `exec`, `time`, `nohup`,
#     `nice`) and the words that open a command (`then`, `do`, `else`, `{`, `!`,
#     `if`, `while`, `until`) keep the command position open;
#   - an assignment turning commit signing off through git's environment
#     (`GIT_CONFIG_PARAMETERS`, or a `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`
#     pair) counts where an assignment can stand: at a command position, or
#     after `export`, `declare`, `typeset`, `readonly` or `local`. The same text
#     as a search pattern is an argument, not an assignment.
#
# It is one read of the WHOLE command rather than a line at a time, because a
# commit message and a heredoc both span lines, and a line-at-a-time scan reads
# their bodies as commands.
#
# It has to stay LINEAR in every awk it meets, because the hook has a 10 s
# timeout and a hook that times out decides nothing — the push goes through.
# macOS's /usr/bin/awk makes `substr(s, i, 1)` cost the length of `s`, so a
# character loop over the whole record is quadratic there (an 850 KB command
# took 14 s) while mawk and gawk stay fast; the scan therefore reads characters
# out of a 4096-character window that moves forward. Heredocs are found through
# a line table built once — each line's start offset and the last line holding
# each text — so an unclosed `<<` costs one lookup, and a closed one walks only
# the lines it skips. A word stops growing past 4096 characters (no rule
# compares a word that long).
#
# If the scan fails anyway, the git rules DENY rather than go quiet: a guard
# that cannot read the command has not found it safe.
#
# What it cannot decide from the text, and so does not guess at: a push whose
# refspec is omitted (`git push -f` on main), a refspec held in a variable, a
# command inside a quoted `sh -c '…'`, and `$'…'` quoting.
GITSCAN='
	function begin_scan(s,   p, k, t) {
		n = 0; cur = 0; tok = ""; have = 0; at_start = 1; in_git = 0; opener = 0; decl = 0
		q = ""; pending = ""; hd_on = 0; heredoc_word = 0; depth = 0; word_q = 0
		sign_env_off = 0; sign_key = 0; sign_val = 0
		split("sudo env command exec time nohup nice then do else { ! if while until", p, " ")
		for (k in p) PREFIX[p[k]] = 1
		split("export declare typeset readonly local", p, " ")
		for (k in p) DECL[p[k]] = 1
		S = s; LEN = length(s); BASE = -1; CHUNK = ""
		LINES = split(s, L, "\n")
		lstart[1] = 1
		for (k = 1; k <= LINES; k++) {
			if (k > 1) lstart[k] = lstart[k - 1] + length(L[k - 1]) + 1
			t = L[k]
			sub(/^\t+/, "", t)
			last_at[t] = k
		}
	}
	# The character at k, read from a window that only moves when k leaves it.
	function ch(k) {
		if (BASE < 0 || k <= BASE || k > BASE + 4096) { BASE = k - 1; CHUNK = substr(S, k, 4096) }
		return substr(CHUNK, k - BASE, 1)
	}
	# The line holding offset i (binary search over the start offsets).
	function line_of(i,   lo, hi, mid) {
		lo = 1; hi = LINES
		while (lo < hi) {
			mid = int((lo + hi + 1) / 2)
			if (lstart[mid] <= i) lo = mid; else hi = mid - 1
		}
		return lo
	}
	# At the newline at i, with a heredoc pending: the offset of the newline that
	# ends its closing line, or i itself when no later line closes it.
	function skip_heredoc(i,   here, k, t) {
		here = line_of(i)
		if (!(pending in last_at) || last_at[pending] <= here) return i
		for (k = here + 1; k <= LINES; k++) {
			t = L[k]
			sub(/^\t+/, "", t)
			if (t == pending) return lstart[k] + length(L[k])
		}
		return i
	}
	function word_end(   w, lw, wq) {
		if (!have) return
		have = 0
		w = tok
		tok = ""
		wq = word_q
		word_q = 0
		if ((at_start || decl) && w ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
			lw = tolower(w)
			if (lw ~ /^git_config_parameters=.*commit\.gpgsign'"'"'?='"'"'?(false|0|no|off)([^a-z0-9]|$)/) sign_env_off = 1
			if (lw ~ /^git_config_key_[0-9]+=commit\.gpgsign$/) sign_key = 1
			if (lw ~ /^git_config_value_[0-9]+=(false|0|no|off)$/) sign_val = 1
		}
		if (heredoc_word) { pending = w; hd_on = 1; heredoc_word = 0; return }
		if (!lead_quoted && w ~ /^<</ && w !~ /^<<</ && !(depth > 0 && st_arith[depth])) {
			sub(/^<<-?/, "", w)
			if (w == "" && !wq) heredoc_word = 1; else { pending = w; hd_on = 1 }
			return
		}
		if (at_start) {
			if (w ~ /^[A-Za-z_][A-Za-z0-9_]*=/) return
			if (opener && w ~ /^-/) return
			if (w in PREFIX) { opener = 1; return }
			if (w in DECL) { at_start = 0; opener = 0; decl = 1; return }
			at_start = 0; opener = 0
			in_git = (w == "git")
			if (in_git) { cur = ++n; gopts[cur] = ""; subc[cur] = ""; args[cur] = ""; phase = "global"; takes_value = 0 }
			return
		}
		if (!in_git) return
		if (phase == "global") {
			if (takes_value) { gopts[cur] = gopts[cur] " " w; takes_value = 0; return }
			if (w == "-c" || w == "-C" || w == "--git-dir" || w == "--work-tree" || w == "--namespace") {
				gopts[cur] = gopts[cur] " " w; takes_value = 1; return
			}
			if (w ~ /^-/) { gopts[cur] = gopts[cur] " " w; return }
			subc[cur] = w; phase = "args"; return
		}
		args[cur] = args[cur] "\037" w
	}
	function command_end() { word_end(); at_start = 1; in_git = 0; opener = 0; decl = 0 }
	function add(c, quoted) {
		if (!have) lead_quoted = quoted
		if (quoted) word_q = 1
		if (length(tok) < 4096) tok = tok c
		have = 1
	}
	# Enter a nested level: remember the command around it, start a fresh one.
	function push_level(by_backtick, in_word, arith) {
		depth++
		st_arith[depth] = arith; st_q[depth] = ""
		st_cur[depth] = cur; st_git[depth] = in_git; st_phase[depth] = phase
		st_tv[depth] = takes_value; st_at[depth] = at_start; st_op[depth] = opener
		st_have[depth] = have; st_tok[depth] = tok; st_lq[depth] = lead_quoted
		st_wq[depth] = word_q; st_decl[depth] = decl
		st_bt[depth] = by_backtick; st_word[depth] = in_word
		have = 0; tok = ""; word_q = 0; at_start = 1; in_git = 0; opener = 0; decl = 0
	}
	# Leave it: the outer command resumes, and a substitution inside a word
	# stands in that word as one placeholder character.
	function pop_level(   in_word) {
		command_end()
		cur = st_cur[depth]; in_git = st_git[depth]; phase = st_phase[depth]
		takes_value = st_tv[depth]; at_start = st_at[depth]; opener = st_op[depth]
		have = st_have[depth]; tok = st_tok[depth]; lead_quoted = st_lq[depth]
		word_q = st_wq[depth]; decl = st_decl[depth]; q = st_q[depth]
		in_word = st_word[depth]
		depth--
		if (in_word) add("_", 0)
	}
	# `$(` at i, the `$` already in the word: open the substitution (two levels
	# for an arithmetic `$((`, whose `<<` is a shift, not a heredoc), and record
	# the quote it was opened inside so leaving it resumes that quote.
	function open_subst(i, quote,   first) {
		tok = substr(tok, 1, length(tok) - 1)
		if (ch(i + 1) == "(") { push_level(0, 1, 1); first = depth; push_level(0, 0, 1); i++ }
		else { push_level(0, 1, 0); first = depth }
		st_q[first] = quote
		return i
	}
	function scan(s,   i, c) {
		begin_scan(s)
		for (i = 1; i <= LEN; i++) {
			c = ch(i)
			if (q == "'"'"'") { if (c == q) q = ""; else add(c, 1); continue }
			if (q == "\"") {
				if (c == "\\" && i < LEN) { i++; add(ch(i), 1); continue }
				if (c == "`") { push_level(1, 1, 0); st_q[depth] = q; q = ""; continue }
				if (c == "(" && have && substr(tok, length(tok)) == "$") { i = open_subst(i, q); q = ""; continue }
				if (c == q) q = ""; else add(c, 1)
				continue
			}
			if (c == "\\") {
				if (i < LEN && ch(i + 1) != "\n") add(ch(i + 1), 1)
				i++
				continue
			}
			if (c == "'"'"'" || c == "\"") { q = c; word_q = 1; if (!have) { have = 1; lead_quoted = 1 }; continue }
			if (c == " " || c == "\t") { word_end(); continue }
			if (c == "\n") {
				command_end()
				if (hd_on) { i = skip_heredoc(i); hd_on = 0; pending = "" }
				continue
			}
			if (c == "(") {
				if (have && substr(tok, length(tok)) == "$") i = open_subst(i, "")
				else { word_end(); push_level(0, 0, depth > 0 && st_arith[depth]) }
				continue
			}
			if (c == ")") { if (depth > 0 && !st_bt[depth]) pop_level(); else command_end(); continue }
			if (c == "`") { if (depth > 0 && st_bt[depth]) pop_level(); else push_level(1, 1, 0); continue }
			if (c == ";" || c == "&" || c == "|") { command_end(); continue }
			add(c, 0)
		}
		command_end()
		while (depth > 0) pop_level()
	}
'

# One scan answers both git rules: prints the push verdict (`force`, `direct`
# or `-`) and whether signing is turned off (`1` or `0`).
#
# Push: the DESTINATION of a refspec decides — `main`, `+main`, `X:main`,
# `refs/heads/main` — so pushing main somewhere else is not a push to main, and
# `--mirror` or `--all` push main among everything else.
# Signing: a `-c` global option, the environment spelling, or the flag given to
# a command that takes it (not `git grep -- --no-gpg-sign`).
git_verdicts() {
	printf '%s' "$cmd" | awk "$GITSCAN"'
		BEGIN { RS = "\001" }
		{ all = all (NR > 1 ? "\001" : "") $0 }
		END {
			scan(all)
			verdict = "-"
			sign = (sign_env_off || (sign_key && sign_val)) && n > 0
			for (k = 1; k <= n; k++) {
				m = split(substr(args[k], 2), a, "\037")
				if (tolower(gopts[k] " ") ~ /(^| )-c commit\.gpgsign=(false|0|no|off) /) sign = 1
				if (subc[k] ~ /^(commit|merge|rebase|cherry-pick|revert|pull|am)$/) {
					for (j = 1; j <= m; j++) {
						if (a[j] == "--") break
						if (a[j] == "--no-gpg-sign") sign = 1
					}
				}
				if (subc[k] != "push") continue
				force = 0; positional = 0; to_main = 0
				for (j = 1; j <= m; j++) {
					t = a[j]
					if (t == "--mirror") { to_main = 1; force = 1; continue }
					if (t == "--all") { to_main = 1; continue }
					if (t == "--force-if-includes") continue
					if (t ~ /^--force/ || t ~ /^-[^-]*f/) { force = 1; continue }
					if (t ~ /^-/) continue
					positional++
					if (positional < 2) continue
					if (t ~ /^\+/) { force = 1; t = substr(t, 2) }
					if (index(t, ":") > 0) t = substr(t, index(t, ":") + 1)
					sub(/^refs\/heads\//, "", t)
					if (t == "main") to_main = 1
				}
				if (to_main && force) verdict = "force"
				else if (to_main && verdict == "-") verdict = "direct"
			}
			print verdict " " (sign ? 1 : 0)
		}'
}
case $cmd in
*git*)
	git_verdict=$(git_verdicts) || git_verdict=''
	case $git_verdict in
	'- 0' | '- 1' | 'force 0' | 'force 1' | 'direct 0' | 'direct 1') ;;
	*)
		decide deny 'The Bash guard could not read this command to check it for a push to main or
disabled commit signing — its scan did not produce an answer, which it treats as
a refusal rather than as safe. Split the command into smaller calls.'
		;;
	esac
	;;
*) git_verdict='- 0' ;;
esac

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
#
# The flag must belong to the MAKE invocation. Testing the whole command string
# for a stray ` -n ` denies `grep -n`, `head -n`, `tail -n`, `sort -n` and
# `ls -n` whenever make is mentioned anywhere in the same call — which is the
# ordinary shape of "run the gate, then look at its log", and `grep -rn` is the
# form CLAUDE.md and gotchas/verification-claims.md both recommend. So this
# reuses `dry_run_after_make`, cut from `piped_after_make` beside it, which
# stops at the first separator; and it asks `is_gate`, so `make --version` and
# `make help` are not gates and cannot be dry runs.
if has "$MAKE" && is_gate && dry_run_after_make; then
	decide deny '`make -n` is not a dry run here: recipe lines containing $(MAKE) still
run for real (the documented GNU recursion rule), so a dry run takes the gate
lock and has killed a gate mid-run. Read the recipe, or run `make help`.'
fi

# There is no Rust toolchain on this host, and a hand-built invocation is not a
# sanctioned claim even where one exists.
if at_command_position cargo && ! has 'docker[^;&|]*cargo'; then
	decide deny 'This host has no Rust toolchain, and a correctness claim comes from a make
target, never from an ad-hoc cargo run. Use the <scope>:<job> grid:
  make engine:lint | engine:test | engine:coverage | engine:budget
`make help` lists them; the allowlist is the header of the Makefile.'
fi

# The branch ruleset requires signatures; disabling signing produces a commit
# that passes locally and meets mergeStateStatus BLOCKED hours later.
#
# The flag must belong to a GIT invocation. Testing the whole command string
# for it denies any command that merely MENTIONS the flag — a heredoc
# documenting this very rule, a grep for it, a cat of this file — which is the
# same over-match `dry_run_after_make` exists to avoid one rule above, and the
# same command-position discipline the attribution rule below already applies.
# It fired twice in one session on prose, once while writing up the trap — and,
# once `git` was required at a command position but the flag was still looked
# for anywhere, again on prose that merely sat beside a git call. It reads the
# git invocation's own options and arguments now (`GITSCAN`).
if [ "${git_verdict#* }" = 1 ]; then
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
# Decided from the push invocation's own refspecs and flags (`GITSCAN`), never
# from words elsewhere in the command. Testing the whole command string meant
# ordinary prose fired both of these — documenting the rule, or grepping the
# docs for it, was refused; anchoring only the `git` verb then still refused a
# command that pushed nothing but named `push`, `-f` and `main` somewhere else.
case ${git_verdict% *} in
force)
	decide deny 'main takes no force pushes (repository ruleset). History there accumulates
through PRs. Force-push your own feature branch instead.'
	;;
direct)
	decide deny 'main is ruleset-protected: it takes no direct pushes, docs-only changes
included. Open a PR from a branch.'
	;;
esac

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
