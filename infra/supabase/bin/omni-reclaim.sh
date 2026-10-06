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
