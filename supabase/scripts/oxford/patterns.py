#!/usr/bin/env python3
"""Vietnamese for the Oxford Learner's sentence patterns of each English word, loaded into lex.entry_patterns.

Follows oxford.jsonl (crawl_oxford.py) as it grows. Per word: the patterns of its own entries (no phrasal verb
page, no entry of another headword, no bare "+ adv./prep."), somebody and something shortened to sb and sth,
deduplicated, at most MAX_PATTERNS, each with its first usable example. A model of learner.Pool (never Claude,
never one the learner batch reserves for the site assistant) gets up to CALL_WORDS words per call and returns
the Vietnamese of every pattern and example; a pattern whose answer fails check() is asked again of a model of
another family, up to ATTEMPTS times. Each word is upserted into lex.entry_patterns once all its patterns are
answered, or after ATTEMPTS with the ones that were. Entries already in the table are skipped, so a restart
resumes. The site cache is flushed every REVALIDATE_EVERY written entries and whenever the file stops growing.
Exits once crawl.log says the crawler finished and every word is done.

usage:
  patterns.py [--src FILE] [--workers N]              follow the file and write
  patterns.py --dry [--words a,b | --limit N]         print what would be written, write nothing
env: AI_BASE_URL, OMNI_BASE_URL, SITE_URL, REVALIDATE_SECRET (from /opt/zhesen/learner/env.sh),
     BATCH_AI_API_KEY, BATCH_OMNI_API_KEY (from /opt/zhesen/batch.env)
"""
import argparse, json, os, re, secrets, subprocess, sys, threading, time, unicodedata
from collections import Counter, deque
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(D, '..', 'learner'))
import learner  # noqa: E402  Pool: model calls, refusal handling, the Claude and RESERVED filters

SOURCE = 'oxford-learners'
MAX_PATTERNS = 12
CALL_WORDS, CALL_PATTERNS = 12, 60
ATTEMPTS = 3
REVALIDATE_EVERY = 300
POLL = 30
READ_AHEAD = 100
# Web-session providers revoke a login under parallel calls; omni:ds-web stays at learner's 0.
learner.PROVIDER_LIMIT.update({'ds-web': 2, 'omni:zw': 1, 'omni:zai-web': 1, 'omni:gweb': 1, 'omni:gemini-web': 1})
LOCK = threading.Lock()

SYSTEM = """You are a senior English-Vietnamese lexicographer writing a learner's dictionary for Vietnamese speakers.
Each line below is one sentence pattern of an English headword, as JSON: "n" its number, "word" the headword, "pos" its part of speech, "def" the English definition of the sense the pattern belongs to, "p" the pattern, in which sb means somebody and sth means something, and "ex" an example of the pattern when there is one.

For every pattern write "vi", the Vietnamese a good printed English-Vietnamese learner's dictionary would print beside the pattern:
- Render the pattern itself in this sense, keeping its slots: sb becomes "ai", sb's becomes "của ai", sth becomes "gì", "cái gì" or "điều gì" for a thing and "việc gì" for an act or a matter, doing sth and to do sth become "làm gì" or "việc làm gì", "…" stays "…". Keep the English slashes and brackets as slashes and brackets: "rely on/upon sb/sth" is "dựa vào ai/cái gì", "(for sth)" is "(về việc gì)".
- Put the slots where Vietnamese puts them, not in the English order: "lend sb sth" and "lend sth to sb" are both "cho ai mượn cái gì". Pick the Vietnamese verb that fits this sense and takes these slots naturally: "devote sth to sb/sth" is "dành cái gì cho ai/cái gì", never "cho cái gì cho ai/cái gì".
- Examples of the house style: "blame sb for sth" is "đổ lỗi cho ai về việc gì"; "be blamed for sth" is "bị đổ lỗi về việc gì"; "interested in doing sth" is "muốn làm gì, quan tâm đến việc làm gì"; "seem as if…" is "có vẻ như…"; "afraid of sb/sth" is "sợ ai/cái gì".
- Short and natural, the wording a Vietnamese speaker would use, never a word-by-word rendering and never an explanation. One rendering, or two separated by ", " when one Vietnamese wording does not cover the English, as with "interested in doing sth". At most 50 characters.
- No Vietnamese word twice where once is enough: "cho cái gì cho ai" and "cho ai/cái gì cái gì" are word-by-word renderings; find the verb Vietnamese uses for this sense ("chấm", "dành", "trả").
- Lowercase, no final period, no quotation marks. English grammar markers such as "+ adj.", "+ noun", "+ adv./prep." stay unchanged.

When "ex" is given, also write "exVi", a natural Vietnamese translation of the example as a learner's dictionary prints it: the whole example, same meaning and register, names kept, said the way a Vietnamese speaker would say it rather than following the pattern's wording ("He blamed his brother for the accident." is "Anh ấy đổ lỗi cho em trai về vụ tai nạn."). When the example lists alternatives with "/", keep them with "/".

Reply with JSON only: {"r":[{"n":1,"vi":"...","exVi":"..."}]}, one item for every pattern, in order; leave "exVi" out when there is no "ex"."""


def log(*a):
    with LOCK:
        print(datetime.now(timezone.utc).strftime('%m-%d %H:%M:%S'), *a, flush=True)


# ---------------------------------------------------------------- patterns

SHORT = [(r"\b(?:somebody|someone)(?=['’]s\b)", 'sb'), (r'\b(?:somebody|someone)\b', 'sb'), (r'\bsomething\b', 'sth')]
PLACEHOLDER = re.compile(r'\b(?:somebody|someone|something)\b', re.I)


def shorten(cf):
    for a, b in SHORT:
        cf = re.sub(a, b, cf)
    return re.sub(r'\s+', ' ', cf).strip()


def example(xs):
    """The first example that is a real sentence or phrase, without "(= …)" glosses; one without "/" first."""
    ok = [re.sub(r'\s*\(=[^)]*\)', '', x).strip() for x in xs if not PLACEHOLDER.search(x)]
    ok = [x for x in ok if 8 <= len(x) <= 200]
    return next((x for x in ok if '/' not in x), ok[0] if ok else None)


def same(p):
    """The dedupe key of a pattern: "look for sth/sb" is "look for sb/sth"."""
    return re.sub(r'\S+(?:/\S+)+', lambda m: '/'.join(sorted(m.group(0).split('/'))), p)


def select(row):
    """[{p, pos, def, ex}] of the row's own word in dictionary order, deduplicated by p, at most MAX_PATTERNS."""
    if row.get('status') != 'ok':
        return []
    head, out, seen = row['headword'].casefold(), [], set()
    for e in row.get('entries') or []:
        if e.get('phrasal') or e.get('hw', '').casefold() != head:
            continue
        for s in e['senses']:
            if s.get('pv'):
                continue
            for pat in s['patterns']:
                p = shorten(pat['cf'])
                if not p or p.lstrip('(').startswith('+') or same(p) in seen:
                    continue
                seen.add(same(p))
                out.append({'p': p, 'pos': e.get('pos', ''), 'def': s.get('def', ''), 'ex': example(pat['examples'])})
                if len(out) == MAX_PATTERNS:
                    return out
    return out


# ---------------------------------------------------------------- answers

VI_MARK = re.compile(r'[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]', re.I)
CJK = re.compile(r'[぀-ヿ㐀-鿿]')
ENGLISH_SLOT = re.compile(r'\b(?:sb|sth|somebody|someone|something|doing)\b', re.I)
GRAMMAR = {'adj', 'adv', 'prep', 'noun', 'speech', 'verb', 'sb', 'sth', 'doing'}
MAX_VI = 60


def clean(text):
    if not isinstance(text, str):
        return ''
    text = unicodedata.normalize('NFC', re.sub(r'\s+', ' ', text)).strip().strip('"“”\'`')
    return text.rstrip(' .;')


def english_left(vi, p):
    """True when vi keeps an English slot word or a word of the pattern itself (the English copied back)."""
    if ENGLISH_SLOT.search(vi):
        return True
    words = {w for w in re.findall(r'[a-z]{3,}', p.lower()) if w not in GRAMMAR}
    return any(w in words for w in re.findall(r'[a-z]+', vi.lower()))


def slots_kept(vi, p):
    """True when vi keeps the pattern's open slots: sb as "ai", sth and doing as "gì", "…" as "…"."""
    return ((not re.search(r'\bsb\b', p) or re.search(r'\bai\b', vi))
            and (not re.search(r'\b(?:sth|doing)\b', p) or re.search(r'\bgì\b', vi))
            and ('…' not in p or '…' in vi or '...' in vi))


def check(items, answer):
    """{n: (vi, exVi or None)} for every item whose answer passes; items are the (pattern) dicts sent, in order."""
    got = answer.get('r') if isinstance(answer, dict) else None
    out = {}
    for it in got if isinstance(got, list) else []:
        if not isinstance(it, dict) or not isinstance(it.get('n'), int) or not 1 <= it['n'] <= len(items):
            continue
        pat = items[it['n'] - 1]
        vi = clean(it.get('vi'))
        if pat['p'].endswith('.') and re.search(r'\+ [a-z./]+$', vi) and not vi.endswith('.'):
            vi += '.'  # clean() took the period of "+ adj." off
        if (not vi or len(vi) > MAX_VI or not VI_MARK.search(vi) or CJK.search(vi) or english_left(vi, pat['p'])
                or not slots_kept(vi, pat['p'])):
            continue
        ex_vi = None
        if pat.get('ex'):
            ex_vi = clean(it.get('exVi'))
            if (not ex_vi or not VI_MARK.search(ex_vi) or CJK.search(ex_vi) or len(ex_vi) > 2 * len(pat['ex']) + 40
                    or ex_vi.casefold() == pat['ex'].casefold()):
                continue
            if pat['ex'][-1] in '.!?' and ex_vi[-1] not in '.!?…':
                ex_vi += pat['ex'][-1]
        out[it['n']] = (vi, ex_vi)
    return out


def record(word):
    """The lex.entry_patterns array of a word: answered patterns in dictionary order, ex and exVi together."""
    out = []
    for i, pat in enumerate(word['pats']):
        if i in word['got']:
            vi, ex_vi = word['got'][i]
            r = {'p': pat['p'], 'vi': vi}
            if pat['ex'] and ex_vi:
                r.update(ex=pat['ex'], exVi=ex_vi)
            out.append(r)
    return out


# ---------------------------------------------------------------- model

class Pool(learner.Pool):
    """learner.Pool with replies capped at 8,000 tokens; a retry asked to avoid a family takes any model when
    none of another family is ready, as glossfix.Pool does."""

    def __init__(self, models=None):
        super().__init__(models)
        for m in self.models:
            self.cap[m] = 8000

    def pick(self, prefer, avoid, ceiling=None):
        return super().pick(prefer, avoid, ceiling) or (super().pick(prefer, set()) if avoid else None)


def todo(words):
    return [(w, i) for w in words for i in range(len(w['pats'])) if i not in w['got']]


def user_text(items):
    lines = []
    for n, (w, i) in enumerate(items, 1):
        pat = w['pats'][i]
        item = {'n': n, 'word': w['word'], 'pos': pat['pos'], 'def': pat['def'][:300], 'p': pat['p']}
        if pat['ex']:
            item['ex'] = pat['ex']
        lines.append(json.dumps(item, ensure_ascii=False))
    return '\n'.join(lines)


def translate(pool, words):
    """Asks one model for every unanswered pattern of `words` and stores the passing answers in each word."""
    items = todo(words)
    avoid = set().union(*(w['models'] for w in words))
    model, answer, secs = pool.ask(SYSTEM, user_text(items), avoid=avoid, wait=3600)
    got = check([w['pats'][i] for w, i in items], answer)
    for n, (w, i) in enumerate(items, 1):
        if n in got:
            w['got'][i] = got[n]
    for w in words:
        w['models'].add(model)
    return model, len(got), len(items), secs


def calls_of(queue):
    """Pops words off the queue into one call: at most CALL_WORDS words and CALL_PATTERNS patterns."""
    call, n = [], 0
    while queue and len(call) < CALL_WORDS and (not call or n + len(todo([queue[0]])) <= CALL_PATTERNS):
        w = queue.popleft()
        call.append(w)
        n += len(todo([w]))
    return call


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


def written():
    return set(psql('select entry_id from lex.entry_patterns;').split('\n')) - {''}


def write(recs):
    """Upserts {entry_id, patterns} rows whose entry exists; returns how many were written."""
    if not recs:
        return 0
    out = psql(f"""with i as (
        insert into lex.entry_patterns (entry_id, patterns, source_id)
        select p.entry_id, p.patterns, '{SOURCE}' from jsonb_to_recordset({lit(recs)}) p(entry_id text, patterns jsonb)
        where exists (select 1 from lex.entries e where e.id = p.entry_id)
        on conflict (entry_id) do update set patterns = excluded.patterns, source_id = excluded.source_id
        returning 1)
      select count(*) from i;""")
    return int(out.strip().splitlines()[-1])


# ---------------------------------------------------------------- file

class Follow:
    """Complete lines of a file that another process appends to, from where the last read stopped."""

    def __init__(self, path):
        self.path, self.pos = path, 0

    def read(self, limit=500):
        rows = []
        if not os.path.exists(self.path):
            return rows
        with open(self.path, 'rb') as fh:
            fh.seek(self.pos)
            for line in fh:
                if not line.endswith(b'\n'):
                    break
                self.pos += len(line)
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
                if len(rows) >= limit:
                    break
        return rows


def crawler_finished(path):
    try:
        with open(path, 'rb') as fh:
            fh.seek(0, 2)
            fh.seek(max(0, fh.tell() - 300))
            return fh.read().decode('utf-8', 'replace').rstrip().endswith('finished')
    except OSError:
        return False


def word_of(row, pats):
    return {'entry_id': row['entry_id'], 'word': row['headword'], 'pats': pats, 'got': {}, 'tries': 0,
            'models': set()}


# ---------------------------------------------------------------- commands

def run(a, pool):
    done = written()
    log(f'{len(done)} entries already in lex.entry_patterns; models {len(pool.models)}')
    src, queue, live = Follow(a.src), deque(), {}
    totals = Counter()
    models = Counter()
    since_flush, idle_flushed = 0, True
    with ThreadPoolExecutor(a.workers) as ex:
        while True:
            grew = False
            while len(queue) < READ_AHEAD:
                rows = src.read()
                if not rows:
                    break
                grew = True
                for row in rows:
                    if row.get('entry_id') in done:
                        continue
                    pats = select(row)
                    if pats:
                        done.add(row['entry_id'])
                        queue.append(word_of(row, pats))
            while len(live) < a.workers and queue:
                call = calls_of(queue)
                live[ex.submit(translate, pool, call)] = call
            if grew:
                idle_flushed = False
            if not live:
                if since_flush and not idle_flushed:
                    learner.revalidate()
                    since_flush, idle_flushed = 0, True
                if not queue and crawler_finished(os.path.join(os.path.dirname(a.src), 'crawl.log')):
                    break
                time.sleep(POLL)
                continue
            finished, _ = wait(live, timeout=POLL, return_when=FIRST_COMPLETED)
            for f in finished:
                call = live.pop(f)
                try:
                    model, ok, asked, secs = f.result()
                    totals['calls'] += 1
                    models[model] += 1
                    log(f'call {model} {ok}/{asked} patterns, {len(call)} words, {secs}s')
                except Exception as e:
                    totals['failed_calls'] += 1
                    log('call failed', type(e).__name__, str(e)[:200])
                    if type(e) is RuntimeError:
                        # No model answered within the hour: the words go back unchanged and wait for one.
                        queue.extendleft(reversed(call))
                        continue
                recs, again = [], []
                for w in call:
                    w['tries'] += 1
                    if todo([w]) and w['tries'] < ATTEMPTS:
                        again.append(w)
                        continue
                    totals['partial' if todo([w]) else 'complete'] += 1
                    r = record(w)
                    if r:
                        recs.append({'entry_id': w['entry_id'], 'patterns': r})
                        totals['patterns'] += len(r)
                    totals['missing_patterns'] += len(todo([w]))
                if again:
                    live[ex.submit(translate, pool, again)] = again
                try:
                    n = write(recs)
                except Exception as e:
                    log('write failed', type(e).__name__, str(e)[:200])
                    n = 0
                totals['written'] += n
                since_flush += n
                if since_flush >= REVALIDATE_EVERY:
                    learner.revalidate()
                    since_flush = 0
                if (totals['calls'] + totals['failed_calls']) % 20 == 0:
                    log('totals', json.dumps(totals), 'models', json.dumps(models.most_common()))
    if since_flush:
        learner.revalidate()
    log('finished', json.dumps(totals), 'models', json.dumps(models.most_common()))


def dry(a, pool):
    wanted = [w.strip() for w in a.words.split(',') if w.strip()] if a.words else None
    words, src = [], Follow(a.src)
    while len(words) < (len(wanted) if wanted else a.limit):
        rows = src.read()
        if not rows:
            break
        for row in rows:
            pats = select(row) if not wanted or row.get('headword') in wanted else None
            if pats and row['entry_id'] not in {w['entry_id'] for w in words}:
                words.append(word_of(row, pats))
    queue, calls = deque(words if wanted else words[:a.limit]), []
    words = list(queue)
    while queue:
        calls.append(calls_of(queue))
    with ThreadPoolExecutor(a.workers) as ex:
        for _ in range(ATTEMPTS):
            calls = [c for c in calls if todo(c)]
            for call, f in [(c, ex.submit(translate, pool, c)) for c in calls]:
                try:
                    model, ok, asked, secs = f.result()
                    print(f'# {model}: {ok}/{asked} patterns in {secs}s', flush=True)
                except Exception as e:
                    print('# call failed', type(e).__name__, str(e)[:200], flush=True)
    for w in words:
        print(w['entry_id'], json.dumps(record(w), ensure_ascii=False))
        for r in record(w):
            print(f"  {r['p']} — {r['vi']}" + (f"\n      {r['ex']}  |  {r['exVi']}" if 'ex' in r else ''))
        for i in todo([w]):
            print(f"  {w['pats'][i]['p']} — (no valid answer)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.join(D, 'oxford.jsonl'))
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--dry', action='store_true', help='print what would be written and write nothing')
    ap.add_argument('--words', default='', help='with --dry: these headwords')
    ap.add_argument('--limit', type=int, default=10, help='with --dry: the first N words with patterns')
    ap.add_argument('--models', default='', help='only these models, instead of every usable one')
    a = ap.parse_args()
    pool = Pool(a.models.split(',') if a.models else None)
    (dry if a.dry else run)(a, pool)


if __name__ == '__main__':
    main()
