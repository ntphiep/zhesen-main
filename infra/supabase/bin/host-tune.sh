#!/usr/bin/env bash
# Memory and disk settings for the 4 GB host. Idempotent: cloud-init's bootstrap runs it before
# the first `docker compose up`, and a sync on the running instance runs it again.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# zswap: a zstd-compressed pool in RAM in front of the swap file. A swapped page read again
# comes back in microseconds instead of from EBS, and once the pool is full its least recently
# stored pages go on to the file, so memory never read again stops costing RAM. Over 120 s the
# pool's 767 MB of router memory had 1.1 MB read back, so 2% of RAM holds what is reused.
# zram, tried first, kept every swapped page in RAM: 720 MB of cold memory still took 178 MB.
cat > /etc/tmpfiles.d/zhesen-zswap.conf <<'EOF'
w /sys/module/zswap/parameters/compressor - - - - zstd
w /sys/module/zswap/parameters/max_pool_percent - - - - 2
w /sys/module/zswap/parameters/shrinker_enabled - - - - Y
w /sys/module/zswap/parameters/enabled - - - - Y
EOF
systemd-tmpfiles --create /etc/tmpfiles.d/zhesen-zswap.conf

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

# A swapped page lands in zswap first, so swapping costs less than dropping the page cache
# Postgres reads through: a swappiness above the default 60.
echo 'vm.swappiness=100' > /etc/sysctl.d/99-zhesen.conf
sysctl -q -p /etc/sysctl.d/99-zhesen.conf

# Postgres maps shared_buffers on 2 MB huge pages: they are never swapped, and each backend
# needs one page-table entry per 2 MB instead of 512. 155 is shared_memory_size_in_huge_pages
# at shared_buffers=256MB. Postgres takes all of them or none, and a partial reservation sits
# idle, so the count applies at boot, before memory fragments; a running host got 169 of 300.
echo 'vm.nr_hugepages=155' > /etc/sysctl.d/99-zhesen-hugepages.conf
if [ "$(docker inspect -f '{{.State.Running}}' supabase-db 2>/dev/null)" != true ]; then
  sysctl -q -p /etc/sysctl.d/99-zhesen-hugepages.conf
fi

# Daemons a headless EC2 host never uses: modems, removable disks, multipath SAN, firmware updates.
systemctl disable --now ModemManager.service udisks2.service multipathd.socket multipathd.service \
  fwupd-refresh.timer 2>/dev/null || true
systemctl mask --now fwupd.service 2>/dev/null || true
# networkd-dispatcher only runs hook scripts on link changes, and this host has none.
if [ -z "$(find /etc/networkd-dispatcher /usr/lib/networkd-dispatcher -type f 2>/dev/null)" ]; then
  systemctl disable --now networkd-dispatcher.service 2>/dev/null || true
fi

mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=64M\n' > /etc/systemd/journald.conf.d/zhesen.conf
systemctl restart systemd-journald

# Snap keeps three revisions of every snap by default; two is the minimum it allows.
snap set system refresh.retain=2
apt-get clean
