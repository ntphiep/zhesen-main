#!/bin/sh
# OmniRoute answers every call 503 once its cgroup passes 92% of the memory limit, and the
# cgroup counts page cache: on 2026-10-06 it sat at 93% with 554 MB of file cache beside 779 MB
# of anon memory, and reclaiming the cache brought it to 55%. Run by zhesen-omni-reclaim.timer.
set -eu
id=$(docker inspect zhesen-omniroute --format '{{.Id}}')
cg=/sys/fs/cgroup/system.slice/docker-$id.scope
cur=$(cat "$cg/memory.current")
max=$(cat "$cg/memory.max")
[ "$max" = max ] && exit 0
if [ $((cur * 100 / max)) -ge 60 ]; then
  # The write fails with EAGAIN when less than asked could be reclaimed; what was freed stays freed.
  echo 500M > "$cg/memory.reclaim" 2>/dev/null || true
  echo "reclaimed $((cur >> 20)) MB to $(($(cat "$cg/memory.current") >> 20)) MB of $((max >> 20)) MB"
fi
# SQLite never shrinks a WAL file by itself: on 2026-10-06 it held 424 MB beside a 455 MB
# database, and a TRUNCATE checkpoint returned it to 0. A busy reader makes it wait a minute.
wal=/opt/zhesen/omniroute/data/storage.sqlite-wal
if [ "$(stat -c %s "$wal" 2>/dev/null || echo 0)" -gt 67108864 ]; then
  docker exec zhesen-omniroute node -e '
    const db = require("/app/node_modules/better-sqlite3")("/app/data/storage.sqlite", { fileMustExist: true, timeout: 10000 });
    console.log("wal checkpoint", JSON.stringify(db.pragma("wal_checkpoint(TRUNCATE)")[0]));
    db.close();' || echo "wal checkpoint failed"
fi
# Cold memory out of RAM, after Meta's TMO (Weiner et al., ASPLOS 2022): while a cgroup shows
# almost no memory pressure, take 2% of its memory each minute. A page still in use faults back
# from zswap in microseconds and raises that pressure, which stops the next round. OmniRoute
# holds about 1.1 GB from start-up, most of it never read again.
[ "$(cat /sys/module/zswap/parameters/enabled)" = Y ] || exit 0
# $1 cgroup directory, $2 bytes to take, $3 extra memory.reclaim keys.
offload() {
  [ -r "$1/memory.pressure" ] || return 0
  if awk '/^some/ { split($2, a, "="); exit !(a[2] < 0.10) }' "$1/memory.pressure"; then
    echo "$2${3:+ $3}" > "$1/memory.reclaim" 2>/dev/null || true
  fi
}
for c in zhesen-omniroute zhesen-9router; do
  cg=/sys/fs/cgroup/system.slice/docker-$(docker inspect -f '{{.Id}}' "$c").scope
  [ -r "$cg/memory.current" ] && offload "$cg" $(($(cat "$cg/memory.current") / 50))
done
# Host daemons that mostly sleep between polls. Anonymous memory only: their page cache is the
# binaries they run.
for s in docker containerd amazon-cloudwatch-agent snapd snap.amazon-ssm-agent.amazon-ssm-agent \
  unattended-upgrades; do
  cg=/sys/fs/cgroup/system.slice/$s.service
  [ -r "$cg/memory.stat" ] && offload "$cg" $(($(awk '/^anon /{print $2}' "$cg/memory.stat") / 50)) swappiness=max
done
