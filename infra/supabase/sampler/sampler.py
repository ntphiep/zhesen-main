"""One row of host and container counters into admin.host_samples every 5 seconds.

Every counter is cumulative; lib/admin/host.ts turns two consecutive rows into rates.
Standard library only, so the stock python image runs it as mounted.
"""
import http.client
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request

INTERVAL = 5
PROC = '/host/proc'
HOSTFS = '/hostfs'
DOCKER_SOCK = '/var/run/docker.sock'
RPC = 'http://rest:3000/rpc/put_host_sample'
# Bridges and veth pairs carry the uplink's bytes a second and third time.
VIRTUAL = ('lo', 'veth', 'docker', 'br-')


def log(msg):
    print(f'sampler: {msg}', file=sys.stderr)


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('docker', timeout=10)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(DOCKER_SOCK)


def docker(path):
    conn = DockerConnection()
    try:
        conn.request('GET', path)
        res = conn.getresponse()
        body = res.read()
        if res.status != 200:
            raise RuntimeError(f'GET {path}: HTTP {res.status}')
        return json.loads(body)
    finally:
        conn.close()


def read(path):
    with open(path) as f:
        return f.read()


def parse_stat(text):
    """Busy and total jiffies from the aggregate cpu line, and the count of cpuN lines."""
    busy = total = cpus = 0
    for line in text.splitlines():
        if line.startswith('cpu '):
            # user nice system idle iowait irq softirq steal; guest time is already in user.
            v = [int(x) for x in line.split()[1:9]]
            total = sum(v)
            busy = total - v[3] - v[4]
        elif line.startswith('cpu'):
            cpus += 1
    return busy, total, cpus


def parse_meminfo(text):
    kb = {}
    for line in text.splitlines():
        key, _, rest = line.partition(':')
        if key in ('MemTotal', 'MemAvailable'):
            kb[key] = int(rest.split()[0]) * 1024
    return kb['MemTotal'], kb['MemAvailable']


def parse_net_dev(text):
    rx = tx = 0
    for line in text.splitlines()[2:]:
        name, _, rest = line.partition(':')
        if name.strip().startswith(VIRTUAL):
            continue
        v = rest.split()
        rx += int(v[0])
        tx += int(v[8])
    return rx, tx


def host():
    busy, total, cpus = parse_stat(read(f'{PROC}/stat'))
    mem_total, mem_available = parse_meminfo(read(f'{PROC}/meminfo'))
    # PID 1 is in the host's network namespace; /host/proc/net would be this container's.
    rx, tx = parse_net_dev(read(f'{PROC}/1/net/dev'))
    fs = os.statvfs(HOSTFS)
    return {
        'cpu_busy': busy, 'cpu_total': total, 'cpus': cpus,
        'mem_total': mem_total, 'mem_available': mem_available,
        'disk_size': fs.f_blocks * fs.f_frsize,
        'disk_used': (fs.f_blocks - fs.f_bfree) * fs.f_frsize,
        'disk_available': fs.f_bavail * fs.f_frsize,
        'load': [float(x) for x in read(f'{PROC}/loadavg').split()[:3]],
        'uptime': float(read(f'{PROC}/uptime').split()[0]),
        'net_rx': rx, 'net_tx': tx,
    }


def stats(s):
    cpu = s['cpu_stats']
    mem = s.get('memory_stats') or {}
    ms = mem.get('stats') or {}
    # cgroup v2 reports inactive_file, v1 total_inactive_file; docker stats subtracts either.
    inactive = ms.get('inactive_file', ms.get('total_inactive_file', 0))
    nets = (s.get('networks') or {}).values()
    blk = (s.get('blkio_stats') or {}).get('io_service_bytes_recursive') or []
    return {
        'cpu_usage': cpu['cpu_usage']['total_usage'],
        'cpu_system': cpu.get('system_cpu_usage'),
        'online_cpus': cpu.get('online_cpus'),
        'mem_usage': mem.get('usage'),
        'mem_inactive': inactive,
        'mem_limit': mem.get('limit'),
        'net_rx': sum(n['rx_bytes'] for n in nets),
        'net_tx': sum(n['tx_bytes'] for n in nets),
        'blk_read': sum(b['value'] for b in blk if b['op'].lower() == 'read'),
        'blk_write': sum(b['value'] for b in blk if b['op'].lower() == 'write'),
        'pids': (s.get('pids_stats') or {}).get('current'),
    }


def container(cid):
    info = docker(f'/containers/{cid}/json')
    state = info['State']
    health = state.get('Health') or {}
    last = (health.get('Log') or [None])[-1]
    ports = []
    for port, binds in sorted((info['NetworkSettings'].get('Ports') or {}).items()):
        ports += [f"{port} -> {b['HostIp']}:{b['HostPort']}" for b in binds or []] or [port]
    row = {
        'name': info['Name'].lstrip('/'),
        'image': info['Config']['Image'],
        'service': (info['Config'].get('Labels') or {}).get('com.docker.compose.service'),
        'status': state['Status'],
        'started_at': state['StartedAt'],
        'restarts': info['RestartCount'],
        'health': health.get('Status'),
        'health_log': {'exit_code': last['ExitCode'], 'output': last['Output'].strip()[:300], 'at': last['End']}
        if last else None,
        'ports': ports,
        'mounts': [{'type': m['Type'], 'source': m['Source'], 'destination': m['Destination'], 'rw': m['RW']}
                   for m in info['Mounts']],
        'nano_cpus': info['HostConfig'].get('NanoCpus') or 0,
    }
    if state['Status'] == 'running':
        # one-shot skips the second read Docker otherwise waits a second for; the rate comes from two rows.
        row.update(stats(docker(f'/containers/{cid}/stats?stream=false&one-shot=true')))
    return row


def sample():
    containers = []
    for c in docker('/containers/json?all=1'):
        try:
            containers.append(container(c['Id']))
        except Exception as e:
            log(f"container {c.get('Names')}: {e!r}")
    return {'p_host': host(), 'p_containers': containers}


def post(key, body):
    req = urllib.request.Request(RPC, data=json.dumps(body).encode(), method='POST', headers={
        'Content-Type': 'application/json',
        'Content-Profile': 'admin',
        'apikey': key,
        'Authorization': f'Bearer {key}',
    })
    with urllib.request.urlopen(req, timeout=10) as res:
        res.read()


def main():
    key = os.environ['SERVICE_ROLE_KEY']
    while True:
        started = time.monotonic()
        try:
            post(key, sample())
        except urllib.error.HTTPError as e:
            log(f'POST {RPC}: HTTP {e.code} {e.read()[:300]!r}')
        except Exception as e:
            log(repr(e))
        time.sleep(max(0.0, INTERVAL - (time.monotonic() - started)))


if __name__ == '__main__':
    main()
