#!/usr/bin/env python3
"""Sample gate for the learner layer: acceptance sampling per lot of (writer model, language, ISO week
in which the layers were loaded), https://www.itl.nist.gov/div898/handbook/pmc/section2/pmc21.htm.

A lot not judged yet gets up to SAMPLE_SIZE layers, drawn by md5 so a rerun draws the same ones. A panel of
three judges, of three families and vendors disjoint from each other and from the layer's writer and
reviewer, reads each sampled layer beside its raw entry; a layer two judges reject is a defect
(https://arxiv.org/abs/2404.18796). A lot whose defect rate exceeds DEFECT_THRESHOLD is hidden through
admin.learner_set_status, after its rows are backed up to S3. Each lot writes a report to
GATE_DIR/<lang>_<week>_<writer>.json, which also names HUMAN_SAMPLE layers for a person to read.

usage:
  gate.py run [--lang en,es,zh] [--weeks 2026-W40,...] [--workers N] [--dry-run]
  gate.py hide --entries id,id [--reason TEXT]     back up, then hide these layers
  gate.py backup --entries id,id --tag NAME        back up these layers and their senses only
Without --weeks, a run judges every lot whose week has ended. Runs on the instance: the database is
reached through `docker exec supabase-db psql`, the models through learner.Pool.
"""
import argparse, gzip, hashlib, json, os, secrets, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import learner as L  # noqa: E402
from prompts import PANEL  # noqa: E402

SAMPLE_SIZE = 50
HUMAN_SAMPLE = 10
PANEL_SIZE = 3
# The owner sets the acceptable quality level; until then a lot with more than a tenth of its sample
# defective is hidden. The audit's sample of 45 found 17 (38%).
DEFECT_THRESHOLD = 0.10
GATE_DIR = os.path.join(L.CACHE_DIR, 'gate')
S3 = 's3://zhesen-db-backups-014498663963/data-loads/learner-gate/'
LOCK = threading.Lock()


# ---------------------------------------------------------------- pure parts

def week_of(created_at):
    """ISO week of a timestamptz as PostgREST returns it: 2026-10-05T09:19:48.12+00:00 is 2026-W41."""
    y, w, _ = datetime.fromisoformat(created_at).isocalendar()
    return f'{y}-W{w:02d}'


def lots(rows, weeks=None, now=None):
    """{(writer, lang, week): [entry id]} of the published layers; without `weeks`, only weeks that ended."""
    current = week_of((now or datetime.now(timezone.utc)).isoformat())
    out = {}
    for r in rows:
        if r['status'] != 'published':
            continue
        week = week_of(r['created_at'])
        if (weeks and week not in weeks) or (not weeks and week >= current):
            continue
        out.setdefault((r['model'], r['entry_id'].split(':', 1)[0], week), []).append(r['entry_id'])
    return out


def sample(ids, n, salt):
    return sorted(ids, key=lambda i: hashlib.md5(f'{i}|{salt}'.encode()).hexdigest())[:n]


def defect(votes):
    """A layer is a defect when at least two of its judges reject it."""
    return sum(1 for v in votes if v.get('verdict') == 'reject') >= 2


def decide(n_sampled, n_defects):
    rate = n_defects / n_sampled if n_sampled else 0.0
    return rate, rate > DEFECT_THRESHOLD


def report_name(key):
    writer, lang, week = key
    return f'{lang}_{week}_{writer.replace("/", "_").replace(":", "_")}.json'


# ---------------------------------------------------------------- database

def psql(sql, timeout=600):
    r = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres',
                        '-At', '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:500])
    return r.stdout


def lit(obj):
    """A jsonb literal that its own content cannot close."""
    tag = 'j' + secrets.token_hex(6)
    return f'${tag}${json.dumps(obj, ensure_ascii=False)}${tag}$::jsonb'


def backup(entry_ids, tag):
    """Every learner row of these entries and their lex.senses rows, gzipped JSON lines, kept in GATE_DIR and
    copied to S3. Returns the S3 path."""
    ids = lit(sorted(entry_ids))
    tables = ['learner_entries', 'learner_senses', 'learner_examples', 'learner_links', 'sense_labels', 'senses']
    sql = '\nunion all\n'.join(
        f"select json_build_object('table', '{t}', 'row', to_jsonb(x))::text from lex.{t} x "
        f"where x.entry_id in (select jsonb_array_elements_text({ids}))" for t in tables) + ';'
    out = psql(sql)
    name = f'{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}-{tag}.jsonl.gz'
    os.makedirs(os.path.join(GATE_DIR, 'backup'), exist_ok=True)
    path = os.path.join(GATE_DIR, 'backup', name)
    with gzip.open(path, 'wt') as fh:
        fh.write(out)
    subprocess.run(['aws', 's3', 'cp', '--only-show-errors', '--region', 'ap-northeast-2', path, S3 + name],
                   check=True, timeout=300)
    L.log(f'backup {len(entry_ids)} entries, {out.count(chr(10))} rows: {S3 + name}')
    return S3 + name


def hide(entry_ids, reason):
    """Back up, then hide through admin.learner_set_status, acting as the site's admin so the console's
    audit log records each change."""
    where = backup(entry_ids, 'hide')
    out = psql(f"""begin;
      select set_config('request.jwt.claims', json_build_object('sub',
        (select id from public.profiles where role = 'admin' order by id limit 1), 'role', 'authenticated')::text, true);
      select count(*) from (select admin.learner_set_status(e, 'hidden')
                            from jsonb_array_elements_text({lit(sorted(entry_ids))}) e) t;
      commit;""")
    n = int(out.strip().splitlines()[-1])
    L.log(f'hid {n} layers ({reason}); backup {where}')
    return n, where


# ---------------------------------------------------------------- models

def cached(entry_id, version):
    """The cache record learner.py wrote when it built the layer, or None."""
    lang, _, head = entry_id.partition(':')
    path = os.path.join(L.CACHE_DIR, version, f'{lang}_{head.replace("/", "_")}.json')
    try:
        rec = json.load(open(path))
    except (OSError, ValueError):
        return None
    return rec if rec.get('layer') else None


def judge(pool, rec):
    """Votes of PANEL_SIZE judges, each of a family and vendor no earlier judge, writer or reviewer has."""
    report = rec['report']
    avoid = {m for m in (report.get('model') or report.get('writer'), report.get('reviewer')) if m}
    text = (f'Raw entry:\n{json.dumps(rec["raw"], ensure_ascii=False)}\n\n'
            f'Learner layer:\n{json.dumps(rec["layer"], ensure_ascii=False)}')
    votes = []
    for _ in range(PANEL_SIZE):
        model, answer, _ = pool.ask(PANEL, text, avoid=avoid)
        avoid.add(model)
        problems = [p for p in answer.get('problems') or [] if isinstance(p, dict)]
        serious = any(p.get('severity') in ('high', 'medium') for p in problems)
        votes.append({'judge': model, 'verdict': answer.get('verdict') if answer.get('verdict') in ('accept', 'reject')
                      else 'reject' if serious else 'accept', 'problems': problems[:8]})
    return votes


def cmd_run(a):
    rows = L.rest_all('learner_entries?select=entry_id,model,reviewer,created_at,status,prompt_version&order=entry_id')
    version = {r['entry_id']: r['prompt_version'] for r in rows}
    langs = set(a.lang.split(','))
    todo = {k: v for k, v in lots(rows, set(a.weeks.split(',')) if a.weeks else None).items() if k[1] in langs}
    os.makedirs(GATE_DIR, exist_ok=True)
    todo = {k: v for k, v in todo.items() if not os.path.exists(os.path.join(GATE_DIR, report_name(k)))}
    L.log(f'{len(todo)} lots to judge')
    pool = L.Pool(a.models.split(',') if a.models else None)
    for key, ids in sorted(todo.items(), key=lambda kv: -len(kv[1])):
        picked = sample(ids, SAMPLE_SIZE, '|'.join(key))
        recs = {i: cached(i, version[i]) for i in picked}
        missing = sorted(i for i, r in recs.items() if not r)
        judged = {}
        with ThreadPoolExecutor(a.workers) as ex:
            futs = {ex.submit(judge, pool, r): i for i, r in recs.items() if r}
            for f in as_completed(futs):
                try:
                    judged[futs[f]] = f.result()
                except Exception as e:
                    L.log('judge failed', futs[f], type(e).__name__, str(e)[:160])
        defects = sorted(i for i, v in judged.items() if defect(v))
        rate, fail = decide(len(judged), len(defects))
        decision = 'pass' if not fail else 'dry run: would hide' if a.dry_run else 'hidden'
        out = {'lot': {'writer': key[0], 'lang': key[1], 'week': key[2]}, 'size': len(ids), 'sampled': len(judged),
               'no_cache_record': missing, 'defects': defects, 'defect_rate': round(rate, 3),
               'threshold': DEFECT_THRESHOLD, 'decision': decision, 'human_sample': picked[:HUMAN_SAMPLE],
               'votes': judged, 'judged_at': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        if fail and not a.dry_run:
            out['hidden'], out['backup'] = hide(ids, f'gate {"/".join(key)}: {len(defects)} of {len(judged)} defective')
        if judged:
            with open(os.path.join(GATE_DIR, report_name(key)), 'w') as fh:
                json.dump(out, fh, ensure_ascii=False, indent=1)
        L.log('lot', '/'.join(key), f'{len(defects)}/{len(judged)} defective', decision)
    if not a.dry_run:
        L.revalidate()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('--lang', default='en,es,zh')
    r.add_argument('--weeks', default='')
    r.add_argument('--workers', type=int, default=6)
    r.add_argument('--models', default='', help='only these models as judges')
    r.add_argument('--dry-run', action='store_true')
    h = sub.add_parser('hide')
    h.add_argument('--entries', required=True)
    h.add_argument('--reason', default='by hand')
    b = sub.add_parser('backup')
    b.add_argument('--entries', required=True)
    b.add_argument('--tag', required=True)
    a = ap.parse_args()
    if a.cmd == 'run':
        cmd_run(a)
    elif a.cmd == 'hide':
        hide(a.entries.split(','), a.reason)
        L.revalidate()
    else:
        backup(a.entries.split(','), a.tag)


if __name__ == '__main__':
    main()
