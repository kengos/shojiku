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
#   scripts/target-slot.sh busy                   exit 0 while any slot is held
#   scripts/target-slot.sh clean [k]              drop free slot volumes, one
#                                                 `removed`/`kept` line each on
#                                                 stdout (scripts/docker-clean.sh)
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
# then one never used, then the least recently used among the slots whose
# recorded toolchain image equals SHOJIKU_TARGET_IMAGE (taking such a slot
# rebuilds only the workspace crates, after the scrub), then the least recently
# used of the rest. None free: wait, naming the holders.
#
# THE SCRUB — load-bearing, not tidiness. Cargo decides a path crate is fresh by
# MTIME, so a target shared by two trees serves one tree's binary to the other
# whenever the second tree's differing source is older than the first tree's
# build (measured: tree b's `cargo run` printed tree a's output). When a slot
# changes tree, every workspace crate's fingerprint (`.fingerprint/shojiku-*`)
# is deleted first, so they rebuild; registry dependencies are immutable per
# version and stay warm, which is most of the build.
#
# THE WIPE. Cargo puts a hash into the file name of each compiled artifact
# under `deps/`, and the rustc version is part of that hash. A target directory
# built by one toolchain and then reused with another therefore holds the
# artifacts of both toolchains side by side. cargo llvm-cov reads every test
# binary it finds in the target directory, including the binaries of the
# earlier toolchain, so the coverage report includes binaries that the current
# run did not build (measured: after a rustc upgrade, the 100% line gate failed
# on thousands of lines). Therefore the contents of a slot volume are deleted
# whenever the toolchain image recorded for the slot differs from the toolchain
# image of the current run.
#
# The compared value is the image reference in SHOJIKU_TARGET_IMAGE. Every
# engine container started through TARGET_DOCKER runs RUST_IMAGE, and the
# Makefile exports the same value as SHOJIKU_TARGET_IMAGE, so the recorded
# image is the image that built the slot's contents. The reference is pinned
# by digest, so it changes whenever the toolchain image is rebuilt; the
# contents of the slot volume are therefore also deleted when only a tool other
# than rustc changed. Rebuilds of the toolchain image that leave rustc
# unchanged are rare, and comparing the digest needs no container, unlike
# reading `rustc -vV`.
#
# The record is the file `toolchain` in the slot's pool state, next to
# `last-tree`. acquire removes the record, while it holds the allocation mutex,
# when the record differs from SHOJIKU_TARGET_IMAGE; the record is written back
# only after the deletion of the slot volume's contents succeeds. A deletion that fails or is interrupted
# therefore leaves no record, and the next run that leases the slot deletes the
# contents again. A slot without a record (one created before this check
# existed, or one whose pool state `clean` removed) is treated as recording a
# different toolchain image, so the contents of its volume are deleted.
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

# Candidate order, one slot per line: this tree's slot, never used, LRU among
# the slots whose recorded toolchain image equals SHOJIKU_TARGET_IMAGE, then
# LRU among the rest.
candidates() {
  k=1
  while [ "$k" -le "$slots" ]; do
    last=$(cat "$pool_dir/$k/last-tree" 2>/dev/null || true)
    used=$(cat "$pool_dir/$k/last-used" 2>/dev/null || echo 0)
    toolchain=$(cat "$pool_dir/$k/toolchain" 2>/dev/null || true)
    if [ "$last" = "$1" ]; then rank=0
    elif [ -z "$last" ]; then rank=1
    elif [ "$toolchain" = "$image" ]; then rank=2
    else rank=3; fi
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
        # Whether a scrub is still needed is kept in POOL state, not only in the
        # lock dir: last-tree is removed while the allocation mutex is held and is
        # written back only after a scrub SUCCEEDS, so a scrub that fails or is
        # interrupted is repeated by the next run that leases this slot —
        # including a run from this tree.
        last=$(cat "$pool_dir/$k/last-tree" 2>/dev/null || true)
        if [ "$last" != "$tree" ]; then
          rm -f "$pool_dir/$k/last-tree"
          echo "$k" > "$lockdir/scrub"
        fi
        # Like last-tree, the toolchain record is removed while the allocation
        # mutex is held and is written back by the `docker)` case below only
        # after the wipe succeeds, so a wipe that fails or is interrupted is repeated by
        # the next run that leases this slot.
        stamp=$(cat "$pool_dir/$k/toolchain" 2>/dev/null || true)
        if [ "$stamp" != "$image" ]; then
          rm -f "$pool_dir/$k/toolchain"
          echo "$k" > "$lockdir/wipe"
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
  # If the volume does not exist, the later `docker run` creates it empty, so
  # there are no fingerprints to delete.
  docker volume inspect "$vol" >/dev/null 2>&1 || return 0
  say "slot $1 was last used by another tree — dropping workspace fingerprints in $vol"
  docker run --rm -v "$vol:/t" "$image" sh -euc '
    find /t -maxdepth 5 -type d -name .fingerprint | while read -r d; do
      rm -rf "$d"/shojiku-*
    done'
}

wipe() {
  vol=$prefix$1
  # If the volume does not exist, the later `docker run` creates it empty, so
  # there is nothing to delete.
  docker volume inspect "$vol" >/dev/null 2>&1 || return 0
  say "slot $1 has no toolchain record or records a different toolchain image — deleting the contents of $vol"
  # Delete the contents, not the volume: a stopped container that still mounts
  # the volume would make `docker volume rm` fail.
  docker run --rm -v "$vol:/t" "$image" find /t -mindepth 1 -delete
}

case "${1:-}" in
  docker)
    lockdir=${SHOJIKU_GATE_LOCK_DIR:-}
    if [ "$slots" -le 0 ] || [ -z "$lockdir" ] || [ "${2:-}" != run ]; then
      exec "$@"
    fi
    # scrub and wipe start a container from SHOJIKU_TARGET_IMAGE, and acquire
    # compares each slot's toolchain record with it. If SHOJIKU_TARGET_IMAGE
    # were empty, a slot without a record would read as an empty record equal
    # to it, and the contents of its volume, built by an unknown toolchain,
    # would not be deleted.
    if [ -z "$image" ]; then
      say "SHOJIKU_TARGET_IMAGE is unset — set it to the toolchain image the gates run (make exports RUST_IMAGE)"; exit 1
    fi
    tree=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    k=$(acquire "$lockdir" "$tree")
    if [ -f "$lockdir/wipe" ]; then
      wipe "$k"
      echo "$image" > "$pool_dir/$k/toolchain"
      rm -f "$lockdir/wipe"
    fi
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
  busy)
    # Exit 0, naming the holder, when any slot is leased by a live gate. The
    # lease spans the whole outermost gate, not one container, so it is how
    # scripts/docker-clean.sh tells a running engine gate from an idle daemon.
    for owner in "$pool_dir"/*/lease/owner; do
      [ -f "$owner" ] || continue
      if alive "$(field "$owner" pid)"; then
        echo "pid $(field "$owner" pid) holds slot $(basename "$(dirname "$(dirname "$owner")")")"
        exit 0
      fi
    done
    exit 1
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
        echo "kept     volume $vol — slot in use (make investigate:gates)"
        continue
      fi
      if docker volume inspect "$vol" >/dev/null 2>&1; then
        # A STOPPED container still pins the volume (a Ctrl-C before a --rm
        # container started leaves one). Only ours reference these volumes.
        stopped=$(docker ps -aq --filter "volume=$vol" --filter status=created --filter status=exited)
        if [ -n "$stopped" ]; then docker rm $stopped >/dev/null || true; fi
        if ! docker volume rm "$vol" >/dev/null; then
          echo "kept     volume $vol — could not remove (docker ps -a --filter volume=$vol)"
          continue
        fi
        echo "removed  volume $vol"
      fi
      rm -rf "${pool_dir:?}/$k"
    done
    ;;
  *)
    echo "usage: target-slot.sh docker run <args...> | release <lockdir> | status | busy | clean [k]" >&2
    exit 2
    ;;
esac
