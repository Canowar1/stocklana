#!/usr/bin/env bash
# Supervises the price mirror.
#
# `mirror.sh --watch` in a terminal is not supervision: when it dies, devnet
# prices freeze silently and the only symptom is a staleness number climbing on
# a screen nobody is watching. This restarts it with backoff and writes what it
# is doing to a log that outlives the terminal.
#
# The relayer also records a heartbeat on-chain now (MirrorFeed.lastPushedAt),
# so a stopped mirror is visible in the interface rather than only here.
set -uo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

LOG="${MIRROR_LOG:-/tmp/stocklana-mirror.log}"
MIN_BACKOFF=5
MAX_BACKOFF=300
backoff=$MIN_BACKOFF

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

trap 'log "supervisor stopping"; exit 0' INT TERM

log "supervisor starting, logging to $LOG"

while true; do
  started=$(date +%s)
  log "starting relayer"

  if ./scripts/mirror.sh --watch >>"$LOG" 2>&1; then
    log "relayer exited cleanly"
  else
    log "relayer exited with status $?"
  fi

  ran=$(( $(date +%s) - started ))
  # A run that lasted a while was healthy, so the next failure starts from a
  # short delay again. Only repeated fast failures are worth backing away from.
  if [ "$ran" -ge 120 ]; then
    backoff=$MIN_BACKOFF
  else
    backoff=$(( backoff * 2 ))
    [ "$backoff" -gt "$MAX_BACKOFF" ] && backoff=$MAX_BACKOFF
  fi

  log "restarting in ${backoff}s (last run lasted ${ran}s)"
  sleep "$backoff"
done
