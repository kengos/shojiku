#!/usr/bin/env sh
# Shared by generate-sbom.sh (which PRESERVES) and check-sbom.sh (which
# COMPARES). It holds the single definition of "these two inventories say
# the same thing".
#
# WHY THE TWO SCRIPTS MUST SHARE IT. syft is deterministic for a given
# lockfile and version: two runs over the same input differ in exactly
# `timestamp` and `serialNumber` and are byte-identical everywhere else,
# bom-refs included. Both scripts need that fact, for opposite purposes —
# the generator decides whether to leave a committed inventory alone, the
# checker decides whether that inventory still describes its lockfile — and
# if they ever disagreed, the generator would preserve something the
# checker would have called drift, or worse, the reverse: real drift
# preserved into the tree and then certified green forever. One definition
# makes that class impossible rather than unlikely.
#
# Sourced, not executed. Callers are `sh -eu`.

# The two volatile values, and the ONLY place they are named.
SBOM_MASK='s/"timestamp":"[^"]*"/"timestamp":"MASKED"/g; s/"serialNumber":"[^"]*"/"serialNumber":"MASKED"/g'

# True (0) when <a> and <b> differ in nothing but the volatile fields.
#
# The arity assertion is why this is a function and not two `sed` calls at
# each site. The mask is a GLOBAL substitution on keys nothing guarantees
# are unique: today each occurs exactly once per file, but if syft ever
# emitted a component property spelled `"timestamp":`, the mask would start
# swallowing real differences — silently, and in the generator that means
# writing drift into the committed tree. Assert the arity instead of
# assuming it, for both callers.
sbom_same_ignoring_volatile() { # <label> <a> <b>
	_lbl="$1"
	for _f in "$2" "$3"; do
		for _key in timestamp serialNumber; do
			_n=$(grep -o "\"$_key\":" "$_f" | wc -l | tr -d ' ')
			[ "$_n" -eq 1 ] || {
				echo "FAIL: $_lbl: \"$_key\" occurs $_n times in $_f, not once — the mask would hide real differences" >&2
				exit 1
			}
		done
	done
	_a=$(mktemp)
	_b=$(mktemp)
	sed -E "$SBOM_MASK" "$2" >"$_a"
	sed -E "$SBOM_MASK" "$3" >"$_b"
	if cmp -s "$_a" "$_b"; then
		rm -f "$_a" "$_b"
		return 0
	fi
	rm -f "$_a" "$_b"
	return 1
}

# Put <fresh> at <dest>, EXCEPT when an inventory is already there that says
# the same thing — then keep <dest>'s existing bytes and drop <fresh>.
# Prints `preserved` or `written`.
#
# This is what makes `make sbom:generate` IDEMPOTENT. Without it every run rewrites
# every inventory with a new timestamp and serialNumber, so a change to one
# ecosystem's lockfile dirties all of them and the real one-file delta is
# buried in churn. That used to be a hand step in the release checklist
# ("diff the arrays and commit only the file whose CONTENT moved; revert the
# rest") — a procedure someone has to remember, rather than a property the
# command has. It is also the precondition for any automation that commits
# the result: a bot cannot eyeball which of three files actually moved.
sbom_place() { # <fresh> <dest>
	if [ -s "$2" ] && sbom_same_ignoring_volatile "place/$(basename "$2")" "$2" "$1"; then
		rm -f "$1"
		echo preserved
		return 0
	fi
	mv "$1" "$2"
	echo written
}
