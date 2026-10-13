#!/bin/sh
# One gate at a time, per working tree.
#
# Two gates running in ONE tree corrupt each other: they share `engine/target`,
# and the tell is a cargo error blaming a test rather than your code ("the
# binary the runner was about to execute was deleted underneath it"). That is
# easy to hit from an agent harness, where a "quick" second command lands while
# a long gate is still going in the background.
#
# The lock is keyed by WORKING TREE, not by machine: separate worktrees may run
# gates in parallel, which is the whole point of isolating a parallel session
# in a worktree. Their cargo targets do not collide either: each engine
# container leases one of a small pool of target volumes for the duration of
# the outermost hold (scripts/target-slot.sh), and this script gives the lease
# back when the hold ends.
#
#   scripts/gate-lock.sh <command> [args...]
#
# Re-entrant: a nested gate (`make quiet T=verify` invoking `make verify`)
# inherits the hold through SHOJIKU_GATE_HELD and does not deadlock.
#
# SHOJIKU_GATE_DIR puts the marker somewhere shared, so `ls` shows every
# running gate across every worktree at once. It defaults to a path inside
# this tree, which needs no configuration and still locks correctly.
set -eu

if [ "${SHOJIKU_GATE_HELD:-}" = "1" ]; then
  exec "$@"
fi

tree_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# A stable, filesystem-safe id for this working tree.
tree_id=$(printf '%s' "$tree_root" | tr '/ ' '__' | sed 's/^_*//')
gate_dir="${SHOJIKU_GATE_DIR:-$tree_root/.make-logs/gates}"
lock="$gate_dir/$tree_id.running"

mkdir -p "$gate_dir"

# mkdir is atomic on POSIX filesystems: exactly one racer creates it.
if ! mkdir "$lock" 2>/dev/null; then
  echo "another gate is already running in this working tree:" >&2
  if [ -f "$lock/owner" ]; then
    sed 's/^/  /' "$lock/owner" >&2
  else
    echo "  (no owner recorded — the holder may have died mid-write)" >&2
  fi
  echo >&2
  echo "  Wait for it, or if you are certain nothing is running:" >&2
  echo "    rm -rf '$lock'" >&2
  exit 1
fi

{
  echo "command : $*"
  echo "pid     : $$"
  echo "started : $(date '+%Y-%m-%d %H:%M:%S')"
  echo "tree    : $tree_root"
} > "$lock/owner"

# The nested commands find this hold through these: target-slot.sh records the
# slot it leases in the lock dir, and names this pid as the lease's holder.
SHOJIKU_GATE_HELD=1
SHOJIKU_GATE_LOCK_DIR=$lock
SHOJIKU_GATE_PID=$$
export SHOJIKU_GATE_HELD SHOJIKU_GATE_LOCK_DIR SHOJIKU_GATE_PID

# Release on every exit path, including SIGINT/SIGTERM — a Ctrl-C'd gate that
# left its lock behind would block the tree until someone read this file. The
# target-pool lease goes first: it lives in the lock dir.
release() {
  "$(dirname "$0")/target-slot.sh" release "$lock" || true
  rm -rf "$lock"
}
trap 'release' EXIT
trap 'release; exit 130' INT
trap 'release; exit 143' TERM

"$@"
