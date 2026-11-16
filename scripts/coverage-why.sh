#!/usr/bin/env bash
# Point at the lines that failed the 100% coverage gate.
#
# Reads the lcov.info `make engine:coverage` already wrote — it does NOT re-run the
# gate, so this is instant. `cargo llvm-cov` is invoked with --lcov, which
# writes the machine-readable report to a file and prints no per-file table, so
# a failing run otherwise says only "below the threshold" with no file named.
#
# Coverage counts each crate TWICE (its own unit-test binary + the copy linked
# into dependents' test binaries). The current cargo llvm-cov writes ONE SF
# block per file (checked: 431 SF records, none repeated), whose DA: records are
# already the union of the copies, so the COVERED IN ONE COPY ONLY section below
# cannot fire on it; it is kept for a report that holds several SF blocks per
# file. There, a line covered in one copy and not the other is the trap
# CLAUDE.md warns about, and it reads very differently from a line no test
# reaches at all.
#
# A third kind hides from the DA: records altogether: a multi-line closure that
# never runs, opening on a line whose outer expression did
# (`x.unwrap_or_else(|| {` with its body below). DA: gives the opening line the
# outer expression's hits, so it reads as covered, while llvm-cov's own line
# total counts it short. (A closure written on ONE line leaves no FN: record
# and costs no line at all.) The FN:/FNDA: records still name it, so
# those are read too. They are keyed by file and START LINE, not by symbol: the
# same function's mangled name differs between the test binaries it is linked
# into. The price is that functions starting on one line count together — one
# that runs hides one that does not — so each SF block's own LF:/LH: is checked
# against its DA: as the backstop.
#
# A fourth kind does not appear in lcov.info at all: llvm-cov totals each
# FUNCTION's lines per copy of it (a copy = the crate's own unit-test build, the
# non-test build linked into a dependent's test binary, a generic instance —
# each has its own mangled name) and merges the copies by taking the largest
# line count and the largest covered-line count separately, not by taking the
# union of covered lines, which is what lcov's DA: records are. When every copy
# of a function has the same set of lines (true for the copies of one source
# function in practice; checked on every file of a real report, 431 of 431
# files agreed), that equals "the best copy's zero lines". A function whose own
# tests take one branch and whose dependent's tests take the other therefore
# leaves the file one line short with no DA:0 and no FNDA:0 anywhere. Only the
# per-region engine/coverage.json (`cargo llvm-cov report --json`, written by
# `make engine:coverage` only when it fails and lcov.info exists) can name it,
# so it is read with jq when it exists: the code regions of each function
# record (file id 0) give that copy's
# zero lines by llvm-cov's own line rule — a line counts as run when the
# largest count among regions STARTING on it, or the count of the innermost
# region that started earlier and still encloses it, is above zero. Region kinds
# 0 (code) and 1 (expansion) count as starts and as enclosing regions, and kind
# 3 (gap) as an enclosing region only, as in LLVM. In the JSON of a real run
# every region of file 0 was kind 0 (220,854 regions; none of kind 1, 2 or 3),
# so the kind 1 and kind 3 handling is not exercised by the data seen so far.
# Copies are grouped by file and the line:column where the earliest-starting
# code region begins, because llvm-cov groups the instantiations of a function
# by the line:column of their first region (normally the same region). A group
# is named when the fewest zero lines of any copy is more than the lines that
# are zero in every copy (those are DA:0, so UNCOVERED already). Per file, the named groups explain
# (fewest zero lines - lines zero in every copy) of the shortfall, and what is
# still short is LINE TOTAL SHORT. Only files that appear in lcov.info are
# named: the JSON also holds files the gate does not count (tests/, crates
# from the registry).
set -euo pipefail

LCOV="${1:-engine/lcov.info}"
COVJSON="${2:-engine/coverage.json}"

# `make engine:coverage` deletes the report before it runs, so "absent" here is
# informative rather than an inconvenience: the gate got far enough to try, and
# produced nothing. That is what a test that DOES NOT COMPILE looks like, and
# it is the case this message exists for — the alternative was reading a stale
# report and naming lines that a compile error means nothing ever reached.
if [ ! -f "$LCOV" ]; then
	cat >&2 <<-MSG
		coverage-why: no $LCOV — the run wrote no report.

		  If 'make engine:coverage' just failed, it failed BEFORE measuring anything.
		  The usual cause is a test that does not compile, and the real message
		  is the rustc error in the gate log:

		    grep -n 'error\[' .make-logs/engine_coverage.log

		  If you have not run the gate yet, run 'make engine:coverage' — it writes the
		  report this script reads.
	MSG
	exit 2
fi

# Whether the per-region JSON can be read decides what LINE TOTAL SHORT may say;
# the state is passed to awk as jsonstate. Absent is normal after a green run
# (the gate does not write it when it passes) and after a failure that happened
# before anything was measured. A jq failure (truncated or unexpected JSON) must
# not end the script under `set -e`, or the lcov sections would be lost too.
named=""
if ! command -v jq >/dev/null 2>&1; then
	jsonstate=nojq
elif [ ! -f "$COVJSON" ]; then
	jsonstate=nojson
else
	jsonstate=ok
	# One `GRP<TAB>file<TAB>line:col<TAB>explained<TAB>copies<TAB>common` line
	# per named function: `explained` = fewest zero lines of any copy minus the
	# lines zero in every copy, `copies` = each distinct copy's zero lines with
	# ` | ` between copies, `common` = the lines zero in every copy (may be
	# empty). The records are appended to the lcov stream below and told apart
	# by that prefix. Regions of another file id are ignored: the file of the
	# function is file 0.
	if ! named="$(jq -r '
		def zeros:
			. as $f
			| [ $f.regions[] | select(.[5] == 0) ] as $all
			| [ $all[] | select(.[7] == 0 or .[7] == 1) ] as $code
			| if ($code | length) == 0 then empty else
				($code | map(.[0]) | min) as $lo
				| ($code | map(.[2]) | max) as $hi
				| ($code | sort_by([.[0], .[1]]) | .[0]) as $first
				| { file: ($f.filenames[0] | ltrimstr("/repo/")),
				    key: "\($first[0]):\($first[1])",
				    zeros: [ range($lo; $hi + 1) as $l
					| ([ $code[] | select(.[0] == $l) | .[4] ] | if length > 0 then max else null end) as $start
					| ([ $all[] | select((.[7] == 0 or .[7] == 1 or .[7] == 3) and .[0] < $l and .[2] >= $l) ]
						| sort_by([.[0], .[1]]) | last | if . == null then null else .[4] end) as $wrap
					| if $start == null and $wrap == null then empty
					  elif ($start // 0) == 0 and ($wrap // 0) == 0 then $l
					  else empty end ] }
			end;
		[ .data[0].functions[] | zeros ]
		| group_by([.file, .key])[]
		| (map(.zeros) | unique) as $copies
		| ($copies[0] | map(select(. as $l | $copies | all(.[]; any(.[]; . == $l))))) as $common
		| ($copies | map(length) | min) as $fewest
		| select($fewest > ($common | length))
		| ["GRP", .[0].file, .[0].key, ($fewest - ($common | length)),
		   ($copies | map(map(tostring) | join(",")) | join(" | ")),
		   ($common | map(tostring) | join(","))]
		| @tsv' "$COVJSON")"; then
		jsonstate=badjson
		named=""
	fi
fi

{
cat "$LCOV"
# lcov.info has no newline after its last line, so the first record would
# otherwise be glued onto it.
[ -z "$named" ] || printf '\n%s\n' "$named"
} | awk -v jsonstate="$jsonstate" '
function ascending(list,    n, v, i, j, t, out) {
	n = split(list, v, " ")
	for (i = 2; i <= n; i++)
		for (j = i; j > 1 && v[j - 1] + 0 > v[j] + 0; j--) { t = v[j]; v[j] = v[j - 1]; v[j - 1] = t }
	out = ""
	for (i = 1; i <= n; i++) out = out " " v[i]
	return substr(out, 2)
}
/^GRP/ {
	# Kept until END: a record for a file with no SF: record (tests/, registry
	# crates, which the gate does not count) is dropped there, after every SF:
	# record has been read.
	split($0, g, "\t")
	ngrpin++
	gfile[ngrpin] = g[2]; gat[ngrpin] = g[3]; gexp[ngrpin] = g[4]
	gcopies[ngrpin] = g[5]; gcommon[ngrpin] = g[6]
	next
}
/^SF:/ {
	file = substr($0, 4)
	sub(/^\/repo\//, "", file)
	counted[file] = 1
	blockzero = 0
	next
}
/^LF:/ { lf = substr($0, 4) + 0; next }
/^LH:/ {
	# The largest shortfall over the copies of a file, not the sum: one line
	# short in both copies is still one line.
	missing = lf - (substr($0, 4) + 0) - blockzero
	if (missing > short[file]) short[file] = missing
	next
}
/^FN:/ {
	# lcov 2 writes FN:<start>,<end>,<name>; strip every leading number.
	split(substr($0, 4), a, ",")
	name = substr($0, 4); sub(/^([0-9]+,)+/, "", name)
	fnline[file SUBSEP name] = a[1]
	next
}
/^FNDA:/ {
	split(substr($0, 6), a, ",")
	name = substr($0, 6); sub(/^[0-9]+,/, "", name)
	key = file SUBSEP fnline[file SUBSEP name]
	fnseen[key] = 1
	fncalls[key] += a[1]
	next
}
/^DA:/ {
	split(substr($0, 4), a, ",")
	line = a[1]; count = a[2]
	key = file SUBSEP line
	seen[key] = 1
	total[key] += count
	if (count == 0) { zero[key] += 1; blockzero++ } else nonzero[key] += 1
	files[file] = 1
	next
}
END {
	ndead = 0; nsplit = 0
	for (key in seen) {
		split(key, p, SUBSEP)
		f = p[1]; l = p[2]
		if (total[key] == 0) {
			dead[f] = dead[f] " " l; ndead++
		} else if (zero[key] > 0 && nonzero[key] > 0) {
			mixed[f] = mixed[f] " " l; nsplit++
		}
	}
	nfn = 0
	for (key in fnseen) {
		if (fncalls[key] > 0) continue
		split(key, p, SUBSEP)
		never[p[1]] = never[p[1]] " " p[2]; nfn++
		# Only a start line DA: shows as hit is one the LF:/LH: shortfall
		# can be about; a DA:0 one was already subtracted as UNCOVERED.
		if (total[key] > 0) hidden[p[1]]++
	}
	ngrp = 0
	for (i = 1; i <= ngrpin; i++) {
		if (!(gfile[i] in counted) || short[gfile[i]] <= 0) continue
		ngrp++
		grpfile[ngrp] = gfile[i]; grpat[ngrp] = gat[i]
		grpcopies[ngrp] = gcopies[i]; grpcommon[ngrp] = gcommon[i]
		explained[gfile[i]] += gexp[i]
	}
	# left = shortfall - hidden (NEVER CALLED functions whose start line DA:
	# reads as hit) - explained (the lines of NO SINGLE COPY RUNS EVERY LINE). It
	# can go negative when the line sets of two functions overlap, so only the
	# files with left > 0 are printed.
	nshort = 0
	for (f in short) {
		left[f] = short[f] - hidden[f] - explained[f]
		if (left[f] > 0) nshort++
	}
	if (ndead == 0 && nsplit == 0 && nfn == 0 && ngrp == 0 && nshort == 0) {
		print "coverage-why: every line is covered in every instantiation."
		exit 0
	}
	if (ndead > 0) {
		printf "UNCOVERED — no test reaches these (%d lines):\n", ndead
		for (f in dead) printf "  %s:%s\n", f, ascending(dead[f])
	}
	# Current cargo llvm-cov writes one SF block per file, so nsplit stays 0
	# on it; the section is kept for a report that holds several per file.
	if (nsplit > 0) {
		if (ndead > 0) print ""
		printf "COVERED IN ONE COPY ONLY — the double-count trap (%d lines):\n", nsplit
		printf "  (covered via a dependent'"'"'s suite but not the crate'"'"'s own tests,\n"
		printf "   or vice versa; cover it in the crate'"'"'s OWN unit tests)\n"
		for (f in mixed) printf "  %s:%s\n", f, ascending(mixed[f])
	}
	if (nfn > 0) {
		if (ndead > 0 || nsplit > 0) print ""
		printf "NEVER CALLED — a function or closure no test runs (%d):\n", nfn
		printf "  (the line itself may read as covered: a closure shares its line with\n"
		printf "   the expression around it, and DA: records only that expression)\n"
		for (f in never) printf "  %s:%s\n", f, ascending(never[f])
	}
	if (ngrp > 0) {
		if (ndead > 0 || nsplit > 0 || nfn > 0) print ""
		printf "NO SINGLE COPY RUNS EVERY LINE — each copy of these functions skips a line another copy runs (%d):\n", ngrp
		printf "  (llvm-cov merges the copies of a function by the largest line count\n"
		printf "   and the largest covered-line count, taken separately, not by the\n"
		printf "   union of covered lines, so a line another copy runs still counts as\n"
		printf "   uncovered here. Run every line of the function in ONE copy, usually the\n"
		printf "   crate'"'"'s own unit tests.\n"
		printf "   After each function: its zero lines per copy, copies separated by |;\n"
		printf "   copies with identical zero lines are shown once)\n"
		for (i = 1; i <= ngrp; i++) {
			printf "  %s:%s  zero lines: %s", grpfile[i], grpat[i], grpcopies[i]
			if (grpcommon[i] != "") printf "  (zero in every copy: %s)", grpcommon[i]
			printf "\n"
		}
	}
	if (nshort > 0) {
		if (ndead > 0 || nsplit > 0 || nfn > 0 || ngrp > 0) print ""
		printf "LINE TOTAL SHORT — llvm-cov counts more lines uncovered than any record above names (%d files):\n", nshort
		printf "  (llvm-cov merges the copies of a function by taking the largest line count\n"
		printf "   and the largest covered-line count, taken separately, not the union of\n"
		printf "   covered lines that lcov'"'"'s DA: records show. A closure that never runs, on a line whose outer\n"
		printf "   expression did, is one cause, not the only one.)\n"
		if (jsonstate == "nojson") {
			printf "  engine/coverage.json is missing, so functions that no single copy runs in\n"
			printf "  full cannot be named: re-run '"'"'make engine:coverage'"'"', which writes it when the\n"
			printf "  gate fails. If it is still missing, look for the '"'"'report --json'"'"' error in\n"
			printf "  .make-logs/engine_coverage.log.\n"
		} else if (jsonstate == "nojq") {
			printf "  jq is not installed, so engine/coverage.json cannot be read to name functions\n"
			printf "  that no single copy runs in full: install jq (brew install jq / apt install jq).\n"
		} else if (jsonstate == "badjson") {
			printf "  engine/coverage.json could not be read by jq (truncated or an unexpected\n"
			printf "  format), so functions that no single copy runs in full cannot be named.\n"
		} else {
			printf "  (these are the lines per file that engine/coverage.json does not explain.)\n"
		}
		for (f in left) if (left[f] > 0) printf "  %s (%d line(s) unnamed)\n", f, left[f]
	}
}
'
