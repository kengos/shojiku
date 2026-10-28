#!/usr/bin/env bash
# Point at the lines that failed the 100% coverage gate.
#
# Reads the lcov.info `make engine:coverage` already wrote — it does NOT re-run the
# gate, so this is instant. `cargo llvm-cov` is invoked with --lcov, which
# writes the machine-readable report to a file and prints no per-file table, so
# a failing run otherwise says only "below the threshold" with no file named.
#
# Coverage counts each crate TWICE (its own unit-test binary + the copy linked
# into dependents' test binaries), so lcov holds several SF blocks per file.
# That split is reported separately: a line covered in one copy and not the
# other is the trap CLAUDE.md warns about, and it reads very differently from a
# line no test reaches at all.
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
# against its DA: as the backstop, and a file whose total comes up short with
# nothing else naming it is reported by itself.
set -euo pipefail

LCOV="${1:-engine/lcov.info}"

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

awk '
function ascending(list,    n, v, i, j, t, out) {
	n = split(list, v, " ")
	for (i = 2; i <= n; i++)
		for (j = i; j > 1 && v[j - 1] + 0 > v[j] + 0; j--) { t = v[j]; v[j] = v[j - 1]; v[j - 1] = t }
	out = ""
	for (i = 1; i <= n; i++) out = out " " v[i]
	return substr(out, 2)
}
/^SF:/ {
	file = substr($0, 4)
	sub(/^\/repo\//, "", file)
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
	nshort = 0
	for (f in short) if (short[f] > hidden[f]) nshort++
	if (ndead == 0 && nsplit == 0 && nfn == 0 && nshort == 0) {
		print "coverage-why: every line is covered in every instantiation."
		exit 0
	}
	if (ndead > 0) {
		printf "UNCOVERED — no test reaches these (%d lines):\n", ndead
		for (f in dead) printf "  %s:%s\n", f, ascending(dead[f])
	}
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
	if (nshort > 0) {
		if (ndead > 0 || nsplit > 0 || nfn > 0) print ""
		printf "LINE TOTAL SHORT — llvm-cov counts more lines uncovered than any record above names (%d files):\n", nshort
		printf "  (look for a closure that never runs, starting on the same line as code\n"
		printf "   that does: they share an FN: line, so the call counts above add up)\n"
		for (f in short) if (short[f] > hidden[f]) printf "  %s (%d line(s) unnamed)\n", f, short[f] - hidden[f]
	}
}
' "$LCOV"
