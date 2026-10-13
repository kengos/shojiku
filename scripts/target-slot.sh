#!/bin/sh
# A small POOL of cargo target volumes, shared by every worktree of this user.
#
# Each worktree used to build its own `engine/target` on the bind mount — debug,
# llvm-cov-target, release, wasm32 and the cross targets, 13-18 GB a tree — and
# five or six parallel sessions filled the disk. Instead, every engine container
# mounts one of N named volumes (`shojiku-target-<k>`) OVER /repo/engine/target.
# Every path inside the container stays exactly what it was, so no recipe, no
# baked CARGO_MANIFEST_DIR (always /repo/engine/...) and no `cp target/... /repo/
# dist` changes; what the host reads (engine/lcov.info, dist/, engine/wasm/pkg)
# is outside target/ and still lands on the bind mount.
#
#   scripts/target-slot.sh docker run <args...>   lease a slot, then run docker
#                                                 with it mounted over the target
#   scripts/target-slot.sh release <lockdir>      give the lease back (gate-lock.sh)
#   scripts/target-slot.sh status                 who holds which slot
#   scripts/target-slot.sh clean [k]              drop free slot volumes
#
# THE LEASE. A slot is leased lazily, at a gate's first engine container, and
# held until the OUTERMOST gate-lock.sh exits — so `make quiet T=verify` keeps
# one slot for the whole run, and a gui-only gate takes one only to build a
# missing engine/wasm/pkg. The lease is
# recorded in the gate's own lock dir (SHOJIKU_GATE_LOCK_DIR), which is how a
# later container in the same run finds it. Outside a gate lock this script
# leases nothing and runs docker unchanged.
#
# A slot is free when nobody holds its lease (or the holder's pid is dead) AND
# no running container mounts the volume — the second half covers a gate whose
# make was killed (an agent harness's foreground timeout) while its container
# carries on compiling. Allocation prefers the slot this tree used last (warm),
# then one never used, then the least recently used. None free: wait, naming
# the holders.
#
# THE SCRUB — load-bearing, not tidiness. Cargo decides a path crate is fresh by
# MTIME, so a target shared by two trees serves one tree's binary to the other
# whenever the second tree's differing source is older than the first tree's
# build (measured: tree b's `cargo run` printed tree a's output). When a slot
# changes tree, every workspace crate's fingerprint (`.fingerprint/shojiku-*`)
# is deleted first, so they rebuild; registry dependencies are immutable per
# version and stay warm, which is most of the build.
#
# SHOJIKU_TARGET_SLOTS=0 (CI's default — GitHub sets CI=true) disables the pool:
# docker runs unchanged and the target stays on the bind mount, as it always was.
set -eu

slots=${SHOJIKU_TARGET_SLOTS:-0}
prefix=${SHOJIKU_TARGET_VOLUME_PREFIX:-shojiku-target-}
# Lease state is per USER (under $HOME) while the volumes are per Docker daemon:
# right on Docker Desktop, where the daemon is per user too. Two users sharing
# one Linux daemon would share slots without sharing leases — give each its own
# SHOJIKU_TARGET_VOLUME_PREFIX there.
pool_dir=${SHOJIKU_TARGET_POOL_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/shojiku/target-pool}
image=${SHOJIKU_TARGET_IMAGE:-}

say() { echo "target pool: $*" >&2; }
# Only a plain positive pid: `kill -0 -1` / `kill -0 0` succeed (process-group
# semantics), so a corrupted owner file would otherwise wedge a slot forever.
alive() {
  case $1 in ''|*[!0-9]*|0) return 1 ;; esac
  kill -0 "$1" 2>/dev/null
}
in_use() { [ -n "$(docker ps -q --filter "volume=$prefix$1")" ]; }
field() { sed -n "s/^$2 *: //p" "$1" 2>/dev/null | head -1; }

# A slot is takeable when no live holder and no container is using it.
takeable() {
  lease="$pool_dir/$1/lease"
  if [ -d "$lease" ] && alive "$(field "$lease/owner" pid)"; then
    return 1
  fi
  ! in_use "$1"
}

# The allocation step is short, so one pool-wide mutex keeps two racers from
# both reclaiming the same stale lease. Its own staleness is checked by pid.
# A holder killed between the mkdir and writing its pid leaves a pid-less mutex;
# after ~10s of seeing one, it is treated as dead too.
mutex_take() {
  spins=0
  while ! mkdir "$pool_dir/.alloc" 2>/dev/null; do
    holder=$(cat "$pool_dir/.alloc/pid" 2>/dev/null || true)
    spins=$((spins + 1))
    if { [ -n "$holder" ] && ! alive "$holder"; } || { [ -z "$holder" ] && [ "$spins" -gt 50 ]; }; then
      rm -rf "$pool_dir/.alloc"
      spins=0
      continue
    fi
    if [ "$spins" -eq 25 ]; then say "waiting for the allocation mutex $pool_dir/.alloc (pid ${holder:-none})"; fi
    sleep 0.2
  done
  echo $$ > "$pool_dir/.alloc/pid"
}
mutex_drop() { rm -rf "$pool_dir/.alloc"; }

# Candidate order, one slot per line: affinity, never used, then LRU.
candidates() {
  k=1
  while [ "$k" -le "$slots" ]; do
    last=$(cat "$pool_dir/$k/last-tree" 2>/dev/null || true)
    used=$(cat "$pool_dir/$k/last-used" 2>/dev/null || echo 0)
    if [ "$last" = "$1" ]; then rank=0; elif [ -z "$last" ]; then rank=1; else rank=2; fi
    echo "$rank $used $k"
    k=$((k + 1))
  done | sort -n -k1,1 -k2,2 | cut -d' ' -f3
}

holders() {
  k=1
  while [ "$k" -le "$slots" ]; do
    owner="$pool_dir/$k/lease/owner"
    if [ -f "$owner" ]; then
      pid=$(field "$owner" pid)
      if alive "$pid"; then note=""; else note=", DEAD — its container is still running"; fi
      printf '  slot %s: %s (pid %s%s, since %s)\n' "$k" "$(field "$owner" tree)" \
        "$pid" "$note" "$(field "$owner" started)" >&2
    elif in_use "$k"; then
      printf '  slot %s: no lease, but a running container still mounts %s%s\n' \
        "$k" "$prefix" "$k" >&2
    fi
    k=$((k + 1))
  done
}

# Prints the leased slot number; records it in the gate's lock dir.
acquire() {
  lockdir=$1 tree=$2
  if [ -f "$lockdir/slot" ]; then cat "$lockdir/slot"; return; fi
  mkdir -p "$pool_dir"
  waited=0
  while :; do
    mutex_take
    for k in $(candidates "$tree"); do
      if takeable "$k"; then
        mkdir -p "$pool_dir/$k"
        rm -rf "$pool_dir/$k/lease"
        mkdir "$pool_dir/$k/lease"
        {
          echo "tree    : $tree"
          echo "pid     : ${SHOJIKU_GATE_PID:-$PPID}"
          echo "started : $(date '+%Y-%m-%d %H:%M:%S')"
        } > "$pool_dir/$k/lease/owner"
        # The scrub debt lives in POOL state, not in the lock dir: last-tree is
        # removed now and written back only after a scrub SUCCEEDS, so a scrub
        # that is interrupted or fails leaves the slot owing one to whoever
        # takes it next — including this tree.
        last=$(cat "$pool_dir/$k/last-tree" 2>/dev/null || true)
        if [ "$last" != "$tree" ]; then
          rm -f "$pool_dir/$k/last-tree"
          echo "$k" > "$lockdir/scrub"
        fi
        date +%s > "$pool_dir/$k/last-used"
        mutex_drop
        echo "$k" > "$lockdir/slot"
        echo "$k"
        return
      fi
    done
    mutex_drop
    if [ $((waited % 60)) -eq 0 ]; then
      say "all $slots slots are busy — waiting (${waited}s). Holders:"
      holders
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

scrub() {
  vol=$prefix$1
  # A volume that does not exist yet is created empty by the run: nothing to drop.
  docker volume inspect "$vol" >/dev/null 2>&1 || return 0
  if [ -z "$image" ]; then
    say "slot $1 changed tree but SHOJIKU_TARGET_IMAGE is unset — cannot scrub"; exit 1
  fi
  say "slot $1 was last used by another tree — dropping workspace fingerprints in $vol"
  docker run --rm -v "$vol:/t" "$image" sh -euc '
    find /t -maxdepth 5 -type d -name .fingerprint | while read -r d; do
      rm -rf "$d"/shojiku-*
    done'
}

case "${1:-}" in
  docker)
    lockdir=${SHOJIKU_GATE_LOCK_DIR:-}
    if [ "$slots" -le 0 ] || [ -z "$lockdir" ] || [ "${2:-}" != run ]; then
      exec "$@"
    fi
    tree=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    k=$(acquire "$lockdir" "$tree")
    if [ -f "$lockdir/scrub" ]; then
      scrub "$k"
      echo "$tree" > "$pool_dir/$k/last-tree"
      rm -f "$lockdir/scrub"
    fi
    say "slot $k ($prefix$k) mounted at /repo/engine/target"
    shift 2
    exec docker run -v "$prefix$k:/repo/engine/target" "$@"
    ;;
  release)
    lockdir=${2:?usage: target-slot.sh release <lockdir>}
    [ -f "$lockdir/slot" ] || exit 0
    k=$(cat "$lockdir/slot")
    if [ "$(field "$pool_dir/$k/lease/owner" pid)" = "${SHOJIKU_GATE_PID:-}" ]; then
      date +%s > "$pool_dir/$k/last-used"
      rm -rf "$pool_dir/$k/lease"
    fi
    rm -f "$lockdir/slot"
    ;;
  status)
    if [ "$slots" -le 0 ]; then echo "target pool: off (SHOJIKU_TARGET_SLOTS=0) — engine/target is on the bind mount"; exit 0; fi
    echo "target pool: $slots slots, state in $pool_dir"
    k=1
    while [ "$k" -le "$slots" ]; do
      owner="$pool_dir/$k/lease/owner"
      state=free
      if [ -f "$owner" ] && alive "$(field "$owner" pid)"; then
        state="HELD by pid $(field "$owner" pid) since $(field "$owner" started)"
      elif [ -f "$owner" ]; then
        state="stale lease (pid $(field "$owner" pid) is dead)"
      fi
      if in_use "$k"; then state="$state, container running"; fi
      printf '  %s%s  %s  last tree: %s\n' "$prefix" "$k" "$state" \
        "$(cat "$pool_dir/$k/last-tree" 2>/dev/null || echo '(never used)')"
      k=$((k + 1))
    done
    ;;
  clean)
    mkdir -p "$pool_dir"
    mutex_take
    trap mutex_drop EXIT
    if [ -n "${2:-}" ]; then
      # k becomes a path component below (rm -rf), so only a slot number passes.
      case $2 in *[!0-9]*|0*) echo "clean: slot must be a number from 1, got '$2'" >&2; exit 2 ;; esac
      vols=$prefix$2
    else
      vols=$(docker volume ls -q --filter "name=^$prefix[0-9]+\$")
    fi
    for vol in $vols; do
      k=${vol#"$prefix"}
      if ! takeable "$k"; then
        say "slot $k is in use — kept (see: scripts/target-slot.sh status)"
        continue
      fi
      if docker volume inspect "$vol" >/dev/null 2>&1; then
        # A STOPPED container still pins the volume (a Ctrl-C before a --rm
        # container started leaves one). Only ours reference these volumes.
        stopped=$(docker ps -aq --filter "volume=$vol" --filter status=created --filter status=exited)
        if [ -n "$stopped" ]; then docker rm $stopped >/dev/null || true; fi
        if ! docker volume rm "$vol" >/dev/null; then
          say "could not remove $vol — kept (docker ps -a --filter volume=$vol)"
          continue
        fi
        say "removed $vol"
      fi
      rm -rf "${pool_dir:?}/$k"
    done
    ;;
  *)
    echo "usage: target-slot.sh docker run <args...> | release <lockdir> | status | clean [k]" >&2
    exit 2
    ;;
esac
