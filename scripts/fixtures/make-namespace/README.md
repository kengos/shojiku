# make-namespace fixture — known-bad on purpose

Read by `scripts/check-make-namespace.sh` BEFORE it scans the real tree. It
seeds exactly ONE violation per rule, plus one WAIVED line that must not be
counted, so a detector that silently stops detecting reds the gate instead of
printing its success line forever.

Do not "fix" anything in this directory. If you add a rule to the gate, add a
case for it here and raise the expected count in the script.

Rule 4 case (a doc naming a target that does not exist):

    `make engine:nosuchjob`

Rule 4, interpolated form — a CI-matrix name no target can match. This is
the shape that reds half a build matrix while every literal lookup reads
clean:

    `make gui-${{ matrix.lang }}`

Waived case — the same shape, exempted on this line, and the reason the
expected count is 5 rather than 6:

    `make engine:alsomissing`  make-namespace-exempt: proves the hatch is wired

## The shapes that must NOT count

One case per exclusion class. Each is a make occurrence the gate must
walk past in silence, and each names only targets THIS fixture defines;
if any of them starts counting, the total moves and the self-test says so.

- flags, and a flag that takes an argument: `make -C /somewhere engine:good`
- a variable assignment: `make engine:good V=1`
- a SHELL-interpolated name, which stays unresolvable: `make sdk:${LANG}:verify`
- a GitHub-interpolated name that some target DOES match, checked as a
  pattern rather than skipped: `make engine:${{ matrix.job }}`
- a DOC placeholder that some target matches, checked the same way:
  `make engine:<job>`
- prose in a COMMENT line that ALSO carries a real backticked command — see
  this fixture's `Makefile` header. The backticks are why the line is read at
  all; the words outside them are not commands
- a backtick span naming no target at all: `make`
- a trailing comment: `make engine:good   # not engine:nosuchjob`
