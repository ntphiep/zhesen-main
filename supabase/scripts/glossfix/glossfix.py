#!/usr/bin/env python3
"""Model review of the machine-translated Vietnamese glosses of English and Spanish senses.

A sense is in scope while its gloss is a machine translation no model has reviewed: gloss_vi_is_mt,
and provenance gloss_vi_source 'mt:google' or no 'ai' key, and no learner fix and no earlier review
by this job. A model of learner.Pool (never Claude, never one the learner batch reserves for the site
assistant) gets up to CALL_SENSES senses per call, each with headword, part of speech, English
definition, one example and the current Vietnamese, and returns a concise gloss and a verdict per sense. Checked
replies are appended to STATE/results.jsonl; every LOAD_SENSES senses or LOAD_SECONDS they are loaded
in one short transaction after the old rows are backed up to S3, and the site cache is dropped.

usage:
  glossfix.py probe --models a,b
  glossfix.py gate --models a,b [--writers N] [--workers N] [--sample NAME] [--blank]
  glossfix.py run [--models a,b] [--workers N] [--phases A,B,C,D,E,F] [--limit N] [--dry-run] [--guard]
  glossfix.py undo --batches 1,2 | --all [--check]
env: AI_BASE_URL, AI_API_KEY, OMNI_BASE_URL, OMNI_API_KEY (from /opt/zhesen/learner/env.sh)
"""
import argparse, gzip, json, os, random, re, secrets, subprocess, sys, threading, time, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'learner'))
try:
    import learner  # Pool: model calls, refusal handling, the Claude and RESERVED filters
except ImportError:  # read by the local gate scoring, which needs only the text helpers
    learner = None

STATE = os.environ.get('GLOSSFIX_STATE', '/opt/zhesen/glossfix/state')
S3 = 's3://zhesen-db-backups-014498663963/data-loads/glossfix-20261004/'
CALL_SENSES = 20
LOAD_SENSES = 1500
LOAD_SECONDS = 900
LANG = {'en': 'English', 'es': 'Spanish'}
# Web-session providers revoke a login under parallel calls.
learner and learner.PROVIDER_LIMIT.update({'omni:zw': 1, 'omni:zai-web': 1, 'omni:gweb': 1, 'omni:gemini-web': 1})
LOCK = threading.Lock()

TARGET = """s.gloss_vi is not null and s.gloss_vi_is_mt
  and (s.provenance->>'gloss_vi_source' = 'mt:google' or not s.provenance ? 'ai')
  and not s.provenance ?| array['learner_fix', 'gloss_vi_review']
  and s.gloss_en is not null and length(s.gloss_en) between 1 and 500"""

# Phase: (language, entry condition); each phase excludes the earlier ones.
PHASES = {
    'A': ('en', 'e.frequency_rank <= 20000'),
    'B': ('es', 'e.frequency_rank <= 10000'),
    'C': ('en', 'coalesce(e.frequency_rank, 2147483647) > 20000 and (e.level is not null or e.frequency_rank <= 50000)'),
    'D': ('es', 'coalesce(e.frequency_rank, 2147483647) > 10000 and (e.level is not null or e.frequency_rank <= 50000)'),
    'E': ('en', 'e.level is null and coalesce(e.frequency_rank, 2147483647) > 50000'),
    'F': ('es', 'e.level is null and coalesce(e.frequency_rank, 2147483647) > 50000'),
}

SYSTEM = """You are a senior {lang}-Vietnamese lexicographer reviewing a learner's dictionary for Vietnamese speakers.
Each line below is one sense of a {lang} headword, as JSON: "n" its number, "word" the headword, "pos" its part of speech, "en" the English definition of this one sense, "ex" an example when there is one, "lemma" the word an inflected headword is a form of, and "vi" the current Vietnamese gloss, empty when there is none. "vi" is an unreviewed machine translation of "en": often a whole translated sentence, sometimes wrong, reversed, or about another sense.

For every sense write the Vietnamese gloss a good printed {lang}-Vietnamese dictionary would give for exactly this sense:
- One to four Vietnamese equivalents separated by ", ", the most usual first, at most 60 characters in all. No final period, no quotation marks, no brackets, no slash, no semicolon.
- Lowercase, except proper nouns.
- The meaning of this sense in this part of speech, not the headword's commonest meaning: a verb sense gets a verb, an adjective sense an adjective, a noun sense a noun.
- Natural, standard Vietnamese as used in Vietnam today. Prefer the everyday word to Sino-Vietnamese jargon unless the sense is technical. Keep the register: slang stays informal, legal terms stay legal. An old, regional or specialist sense gets the established term of its field, never a word-by-word rendering.
- No explanation. Only when Vietnamese has no word for the sense (a species, a dish, a place, a person, a cultural or technical concept) write a short descriptive phrase of at most 80 characters that does not start with "một".
- A name says what it is and keeps the facts that identify it, without repeating the headword: "họ", "tên nam", "tên nữ", "thị trấn ở quận DeKalb, Alabama, Mỹ", "sông ở Manitoba, Canada". Use the usual Vietnamese name of a place when there is one.
- A definition that only points to another word keeps that word unchanged and follows these patterns: "số nhiều của X", "quá khứ của X", "phân từ quá khứ của X", "quá khứ và phân từ quá khứ của X", "phân từ hiện tại của X", "ngôi thứ ba số ít hiện tại của X", "dạng khác của X", "cách viết khác của X", "viết tắt của X", "giống cái của X". Other inflections name person, number, tense and mood the same way: "ngôi thứ nhất số ít hiện tại giả định của X", "mệnh lệnh ngôi thứ hai số ít của X". When the definition does not name X, X is the "lemma".
- When the current "vi" already follows every rule above, return it unchanged and set "v" to "kept"; otherwise set "v" to "corrected".

Reply with JSON only: {{"r":[{{"n":1,"vi":"...","v":"kept"}}]}}, one item for every sense, in order."""

# A change of wording goes to a second model that sees both glosses unlabelled, because on the gate the
# reviewer broke a right gloss about as often as it fixed a wrong one (sảy thóc became sấy thóc). A judge of
# the writer's own family picked the writer 54 times in 59, so without another family the writer is asked
# twice instead (see review).
JUDGE = """You check a {lang}-Vietnamese learner's dictionary for Vietnamese speakers. Each line below is one sense of a {lang} headword, as JSON: "n" its number, "word" the headword, "pos" its part of speech, "en" the English definition of this one sense, "ex" an example when there is one, and two candidate Vietnamese glosses "A" and "B".

For every sense pick the gloss a careful lexicographer would print for exactly this sense. Meaning decides first: a gloss loses when it translates another sense of the word, has the wrong part of speech, uses a wrong or misspelled Vietnamese word, or is a clumsy word-by-word rendering. Only when both are right in meaning, prefer the more natural and concise one.
Then write the picked gloss in dictionary form without changing its words: lowercase except proper nouns, no leading "một", no final period.

Reply with JSON only: {{"r":[{{"n":1,"pick":"A","vi":"..."}}]}}, one item for every sense, in order."""


def log(*a):
    with LOCK:
        print(datetime.now(timezone.utc).strftime('%m-%d %H:%M:%S'), *a, flush=True)


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


def rows(sql):
    return json.loads(psql(f"select coalesce(json_agg(t), '[]') from ({sql}) t;").strip() or '[]')


def senses_of(entry_ids, extra=''):
    return rows(f"""
      select s.id, s.entry_id, e.lang, e.headword as word, s.pos, s.gloss_en as en, s.gloss_vi as vi,
             e.level, e.frequency_rank as rank, e.form_of as lemma,
             (select x.text from lex.examples x where x.sense_id = s.id and length(x.text) between 8 and 200
              order by x.translation_vi is null, length(x.text), x.id limit 1) as ex
      from lex.senses s join lex.entries e on e.id = s.entry_id
      where s.entry_id in (select jsonb_array_elements_text({lit(entry_ids)})) and {TARGET} {extra}
      order by (e.level is null), coalesce(e.frequency_rank, 2147483647), e.id, s.sense_order, s.id""")


def entry_pages(phases, page=150):
    """Entries with senses in scope, phase by phase, levelled first and then by frequency rank."""
    for p in phases:
        lang, cond = PHASES[p]
        after = "(false, -1, '')"
        while True:
            got = rows(f"""
              select e.id, (e.level is null) as unl, coalesce(e.frequency_rank, 2147483647) as rk
              from lex.entries e
              where e.lang = '{lang}' and {cond}
                and ((e.level is null), coalesce(e.frequency_rank, 2147483647), e.id) > {after}
                and exists (select 1 from lex.senses s where s.entry_id = e.id and {TARGET})
              order by 2, 3, 1 limit {page}""")
            if not got:
                break
            last = got[-1]
            after = f"({str(last['unl']).lower()}, {last['rk']}, '{last['id'].replace(chr(39), chr(39) * 2)}')"
            yield p, [g['id'] for g in got]


# ---------------------------------------------------------------- model

def calls_of(senses):
    """Calls of at most CALL_SENSES senses of one language, an entry's senses kept together when they fit."""
    calls, cur = [], []
    for s in senses:
        if cur and (len(cur) >= CALL_SENSES or cur[-1]['lang'] != s['lang']):
            calls.append(cur)
            cur = []
        cur.append(s)
    if cur:
        calls.append(cur)
    return calls


def user_text(call):
    lines = []
    for n, s in enumerate(call, 1):
        item = {'n': n, 'word': s['word'], 'pos': s['pos'] or '', 'en': (s['en'] or '')[:400]}
        if s.get('ex'):
            item['ex'] = s['ex']
        if s.get('lemma'):
            item['lemma'] = s['lemma']
        item['vi'] = s['vi']
        lines.append(json.dumps(item, ensure_ascii=False))
    return '\n'.join(lines)


def clean(vi):
    """The reply as lex.gloss_terms reads a gloss: commas between terms, no brackets, no final period."""
    if not isinstance(vi, str):
        return None
    vi = unicodedata.normalize('NFC', re.sub(r'\s+', ' ', vi)).strip().strip('"“”\'`')
    vi = re.sub(r'\s*\([^()]*\)', '', vi).strip()
    vi = re.sub(r'\s*[;/]\s*', ', ', vi)
    vi = re.sub(r'(,\s*)+', ', ', vi).strip(' ,.;:')
    return vi


VI_LETTER = re.compile(r'[a-zà-ỹđ]', re.I)
CJK = re.compile(r'[぀-ヿ㐀-鿿]')


def house_case(vi):
    """Sentence case to lowercase, term by term: "Thuốc lá" becomes "thuốc lá". A term whose first two
    syllables are both capitalised is a proper noun ("Ai Cập"), a one-word term may be one ("Mỹ"), and a
    religion, a feast or a title keeps its capital ("Phật giáo", "Tết Nguyên đán", "Đức giáo hoàng")."""
    out = []
    for term in vi.split(', '):
        w = term.split(' ')
        if (len(w) > 1 and w[0][:1].isupper() and w[0][1:].islower() and w[1][:1].islower()
                and not re.match(r'(Phật|Hồi giáo|Công giáo|Tết|Đảng|Chúa|Thánh|Đức|Trời|Thiên Chúa)\b', term)):
            term = w[0][0].lower() + term[1:]
        out.append(term)
    return ', '.join(out)


def check(call, answer):
    """{sense id: (gloss, verdict, the model's own verdict)} for every item that passes; others stay in scope."""
    items = answer.get('r') if isinstance(answer, dict) else None
    out = {}
    if not isinstance(items, list):
        return out
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get('n'), int) or not 1 <= it['n'] <= len(call):
            continue
        s = call[it['n'] - 1]
        vi = clean(it.get('vi'))
        vi = vi and house_case(vi)
        # "Một họ có nguồn gốc từ Scotland" is the translated sentence "A surname of Scottish origin".
        if vi and re.match(r'một \S+ \S', vi, re.I) and re.match(r'an? ', s['en'] or '', re.I):
            vi = vi[4:]
        if not vi or len(vi) > 80 or not VI_LETTER.search(vi) or CJK.search(vi) or '(' in vi or ')' in vi:
            continue
        verdict = 'kept' if vi == (s['vi'] or '').strip() else 'corrected'
        out[s['id']] = (vi, verdict, it.get('v') if it.get('v') in ('kept', 'corrected') else None)
    return out


LEAD = {'sự', 'việc', 'cái', 'con', 'chiếc', 'điều', 'cuộc', 'nỗi', 'niềm', 'tính', 'lòng', 'những', 'các', 'một',
        'được', 'bị', 'đã'}


def terms(text):
    """A gloss's terms as word lists, a leading classifier dropped."""
    text = re.sub(r'\([^()]*\)', '', unicodedata.normalize('NFC', (text or '').lower()))
    out = []
    for part in re.split(r'[,;/]', text):
        w = re.sub(r'[^\w\s-]', ' ', part).split()
        while len(w) > 1 and w[0] in LEAD:
            w = w[1:]
        if w:
            out.append(w)
    return out


def match(a, b):
    """Equal, or one inside the other as whole syllables with the shorter at least two long."""
    if a == b:
        return True
    s, l = (a, b) if len(a) <= len(b) else (b, a)
    return len(s) >= 2 and any(l[i:i + len(s)] == s for i in range(len(l) - len(s) + 1))


def norm(t):
    t = re.sub(r'[^\w\s]', ' ', unicodedata.normalize('NFC', (t or '').lower()))
    return ' '.join(re.sub(r'^\s*một\s+', '', t).split())


def kind(old, new):
    """kept; format (same words once case, punctuation and a leading "một" are dropped); overlap (a shared
    term); new (no shared term)."""
    if new == (old or '').strip():
        return 'kept'
    if norm(new) == norm(old):
        return 'format'
    if any(match(a, b) for a in terms(old) for b in terms(new)):
        return 'overlap'
    return 'new'


def judge_text(items):
    lines = []
    for n, (s, a, b) in enumerate(items, 1):
        item = {'n': n, 'word': s['word'], 'pos': s['pos'] or '', 'en': (s['en'] or '')[:400]}
        if s.get('ex'):
            item['ex'] = s['ex']
        item.update(A=a, B=b)
        lines.append(json.dumps(item, ensure_ascii=False))
    return '\n'.join(lines)


LEARNER_LOG = '/opt/zhesen/learner/run.log'
# The learner loaded 7 to 51 entries an hour, 24.5 on average, from 2026-10-04 to 10-05; below half
# of that the job yields.
LEARNER_MIN_PER_HOUR = 12
PAUSE = {'until': 0.0}


def learner_running():
    for pid in os.listdir('/proc'):
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read().split(b'\0')
        except OSError:
            continue
        if any(c.endswith(b'learner.py') for c in cmd) and b'run' in cmd:
            return True
    return False


def learner_loaded():
    """How many entries the learner batch finished in the last 60 minutes, from its log, whose lines
    start HH:MM:SS in UTC. Both jobs draw on the whole pool, so a refusal of one model in that log
    says nothing about this job: one model refused in every 10 minutes, and the guard paused 54
    times in a row on it."""
    try:
        with open(LEARNER_LOG, 'rb') as fh:
            fh.seek(0, 2)
            fh.seek(max(0, fh.tell() - 2_000_000))
            lines = fh.read().decode('utf-8', 'replace').splitlines()[1:]
    except OSError:
        return LEARNER_MIN_PER_HOUR
    now = datetime.now(timezone.utc)
    now_s = now.hour * 3600 + now.minute * 60 + now.second
    loaded = 0
    for line in reversed(lines):
        m = re.match(r'(\d\d):(\d\d):(\d\d) ', line)
        if not m:
            continue
        if (now_s - (int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]))) % 86400 >= 3600:
            break
        loaded += bool(re.match(r'\d\d:\d\d:\d\d \d+/\d+ loaded ', line))
    return loaded


def guard():
    """Holds the calling worker for 15 minutes at a time while the learner batch runs and finished
    fewer than LEARNER_MIN_PER_HOUR entries in the last hour."""
    while True:
        with LOCK:
            now = time.time()
            if now >= PAUSE['until']:
                if not learner_running():
                    return
                loaded = learner_loaded()
                if loaded >= LEARNER_MIN_PER_HOUR:
                    return
                PAUSE['until'] = now + 900
                print(datetime.now(timezone.utc).strftime('%m-%d %H:%M:%S'), 'pausing 15 minutes: learner',
                      f'loaded {loaded} entries in the last hour', flush=True)
            wait = PAUSE['until'] - now
        time.sleep(wait)


def other_family_ready(pool, model):
    now = time.time()
    return any(learner.family(m) != learner.family(model) and pool.cool[m] <= now for m in pool.models)


class Pool(learner.Pool if learner else object):
    """learner.Pool, except that a call asked to avoid a family takes that family when no other model is
    ready, so a judge falls back to the writer's family instead of waiting for a dead provider."""

    def __init__(self, models):
        super().__init__(models)
        for m in self.models:
            self.cap[m] = 8000

    def pick(self, prefer, avoid):
        return super().pick(prefer, avoid) or (super().pick(prefer, set()) if avoid else None)


def review(pool, call, rnd=random):
    """{sense id: record} for the senses that got a checked gloss. A proposal that changes the wording goes
    to a judge when a model of another family is ready, and the judge's pick stands, written in house form.
    Otherwise the same senses are asked again in a second call: the change stands when both answers
    change the wording and share a term, the second answer stands when it only fixes the form, and a sense
    on which the two answers part stays unreviewed."""
    lang = LANG[call[0]['lang']]
    writer, answer, secs = pool.ask(SYSTEM.format(lang=lang), user_text(call))
    out, disputed, got = {}, [], check(call, answer)
    for s in call:
        if s['id'] not in got:
            continue
        vi, verdict, own = got[s['id']]
        k = kind(s['vi'], vi)
        out[s['id']] = {'vi': vi, 'verdict': verdict, 'own': own, 'kind': k, 'model': writer, 'secs': secs}
        if k in ('overlap', 'new'):
            flip = rnd.random() < 0.5
            disputed.append((s, flip))
    judge, verdicts = None, None
    if disputed and other_family_ready(pool, writer):
        items = [(s, out[s['id']]['vi'], s['vi']) if flip else (s, s['vi'], out[s['id']]['vi']) for s, flip in disputed]
        judge, verdicts, _ = pool.ask(JUDGE.format(lang=lang), judge_text(items), avoid={writer})
    # Pool.pick falls back to the writer's family when the other one rests; such a judge is not trusted.
    if judge and learner.family(judge) != learner.family(writer):
        picks = {}
        for it in (verdicts.get('r') if isinstance(verdicts, dict) else None) or []:
            if isinstance(it, dict) and isinstance(it.get('n'), int) and 1 <= it['n'] <= len(items) and it.get('pick') in ('A', 'B'):
                picks[it['n']] = it
        for n, (s, flip) in enumerate(disputed, 1):
            rec = out[s['id']]
            it = picks.get(n)
            if not it:
                del out[s['id']]
                continue
            new_won = (it['pick'] == 'A') == flip
            chosen = rec['vi'] if new_won else s['vi']
            final = clean(it.get('vi'))
            if not final or norm(final) != norm(chosen) or len(final) > 80:
                final = clean(chosen)
            rec.update(vi=final, judge=judge, pick='new' if new_won else 'old',
                       verdict='kept' if final == (s['vi'] or '').strip() else 'corrected')
    elif disputed:
        again = [s for s, _ in disputed]
        second, answer2, _ = pool.ask(SYSTEM.format(lang=lang), user_text(again))
        got2 = check(again, answer2)
        for s in again:
            rec, g2 = out[s['id']], got2.get(s['id'])
            if not g2:
                del out[s['id']]
            elif kind(s['vi'], g2[0]) in ('kept', 'format'):
                rec.update(vi=g2[0], verdict=g2[1], judge=second, pick='old')
            elif any(match(a, b) for a in terms(rec['vi']) for b in terms(g2[0])):
                rec.update(judge=second, pick='agree')
            else:
                del out[s['id']]
    return writer, out


# ---------------------------------------------------------------- loading

def revalidate():
    try:
        secret = subprocess.check_output(['aws', 'ssm', 'get-parameter', '--region', 'ap-northeast-2', '--name',
                                          '/zhesen/prod/revalidate_secret', '--with-decryption', '--query',
                                          'Parameter.Value', '--output', 'text'], text=True).strip()
        req = urllib.request.Request('https://zhesen-main.vercel.app/api/revalidate', data=b'', method='POST',
                                     headers={'x-revalidate-secret': secret})
        with urllib.request.urlopen(req, timeout=30) as r:
            log('revalidate', r.status)
    except Exception as e:
        log('revalidate failed', type(e).__name__, str(e)[:120])


def next_batch():
    path = os.path.join(STATE, 'loads.jsonl')
    n = 0
    if os.path.exists(path):
        for line in open(path):
            n = max(n, json.loads(line)['batch'])
    return n + 1


def load(items):
    """Back the rows up to S3, then write them in one transaction. A row whose gloss changed since it
    was read, or that is no longer a machine translation, is left alone."""
    if not items:
        return 0
    batch = next_batch()
    ids = [i['id'] for i in items]
    old = rows(f"""select id, entry_id, gloss_vi, gloss_vi_is_mt, provenance from lex.senses
                   where id in (select jsonb_array_elements_text({lit(ids)}))""")
    bdir = os.path.join(STATE, 'backup')
    os.makedirs(bdir, exist_ok=True)
    name = f'batch-{batch:05d}.jsonl.gz'
    with gzip.open(os.path.join(bdir, name), 'wt') as fh:
        for r in old:
            fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    subprocess.run(['aws', 's3', 'cp', '--only-show-errors', '--region', 'ap-northeast-2',
                    os.path.join(bdir, name), S3 + name], check=True, timeout=300)
    today = datetime.now(timezone.utc).date().isoformat()
    payload = [{'id': i['id'], 'old': i['old'], 'vi': i['vi'], 'verdict': i['verdict'], 'model': i['model'],
                'judge': i.get('judge')} for i in items]
    out = psql(f"""begin;
      set local lock_timeout = '10s';
      set local statement_timeout = '300s';
      with u as (
        update lex.senses s set gloss_vi = p.vi,
          provenance = s.provenance
            || jsonb_build_object('ai', p.model, 'ai_at', '{today}', 'gloss_vi_review', p.verdict)
            || case when p.judge is null then '{{}}'::jsonb else jsonb_build_object('ai_judge', p.judge) end
            || case when p.vi is distinct from s.gloss_vi
                    then jsonb_build_object('gloss_vi_before', coalesce(s.provenance->'gloss_vi_before', to_jsonb(s.gloss_vi)))
                    else '{{}}'::jsonb end
        from jsonb_to_recordset({lit(payload)}) p(id text, old text, vi text, verdict text, model text, judge text)
        where s.id = p.id and s.gloss_vi_is_mt and s.gloss_vi = p.old and not s.provenance ? 'gloss_vi_review'
        returning s.id)
      select count(*) from u;
      commit;""")
    updated = int(out.strip().splitlines()[-1])
    with open(os.path.join(STATE, 'loads.jsonl'), 'a') as fh:
        fh.write(json.dumps({'batch': batch, 'sent': len(items), 'updated': updated, 'backup': S3 + name,
                             'at': datetime.now(timezone.utc).isoformat(timespec='seconds')}) + '\n')
    with open(os.path.join(STATE, 'loaded_ids.txt'), 'a') as fh:
        fh.write(''.join(f'{batch}\t{i}\n' for i in ids))
    log(f'batch {batch}: {updated} of {len(items)} senses written, backup {S3 + name}')
    return updated


# ---------------------------------------------------------------- commands

def read_jsonl(path):
    if not os.path.exists(path):
        return []
    out = []
    for line in open(path):
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def cmd_run(a):
    os.makedirs(STATE, exist_ok=True)
    pool = Pool(a.models.split(',') if a.models else None)
    log(f'models {pool.models}')
    res_path = os.path.join(STATE, 'results.jsonl')
    done = {r['id'] for r in read_jsonl(res_path)}
    loaded = set()
    if os.path.exists(os.path.join(STATE, 'loaded_ids.txt')):
        loaded = {line.split('\t')[1].strip() for line in open(os.path.join(STATE, 'loaded_ids.txt'))}
    pending = [r for r in read_jsonl(res_path) if r['id'] not in loaded]
    totals = {'calls': 0, 'senses': 0, 'kept': 0, 'corrected': 0, 'skipped': 0, 'failed_calls': 0, 'written': 0}
    last_load = time.time()

    def flush(force=False):
        nonlocal pending, last_load
        if not pending or a.dry_run or not (force or len(pending) >= LOAD_SENSES or time.time() - last_load > LOAD_SECONDS):
            return
        for i in range(0, len(pending), 5000):
            totals['written'] += load(pending[i:i + 5000])
        pending, last_load = [], time.time()
        revalidate()

    if pending and not a.dry_run:
        log(f'{len(pending)} reviewed senses from an earlier run not loaded yet')
        flush(force=True)
    seen = 0

    def one(call):
        if a.guard:
            guard()
        return (call, *review(pool, call))

    with ThreadPoolExecutor(a.workers) as ex:
        current = None
        for phase, ids in entry_pages(a.phases.split(',')):
            if phase != current:
                # Every band is loaded before the next one starts, so a finished band is final in the database.
                if current:
                    flush(force=True)
                    log(f'phase {current} loaded', json.dumps(totals))
                current = phase
            senses = [s for s in senses_of(ids) if s['id'] not in done]
            if a.limit and seen >= a.limit:
                break
            if a.limit:
                senses = senses[:a.limit - seen]
            seen += len(senses)
            futs = [ex.submit(one, c) for c in calls_of(senses)]
            for f in as_completed(futs):
                try:
                    call, model, got = f.result()
                except Exception as e:
                    totals['failed_calls'] += 1
                    log('call failed', type(e).__name__, str(e)[:200])
                    continue
                totals['calls'] += 1
                recs = []
                for s in call:
                    if s['id'] not in got:
                        totals['skipped'] += 1
                        continue
                    g = got[s['id']]
                    totals['senses'] += 1
                    totals[g['verdict']] += 1
                    recs.append({'id': s['id'], 'entry_id': s['entry_id'], 'lang': s['lang'], 'rank': s['rank'],
                                 'level': s['level'], 'phase': phase, 'old': s['vi'], **g})
                with LOCK:
                    with open(res_path, 'a') as fh:
                        fh.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in recs))
                    done.update(r['id'] for r in recs)
                    pending.extend(recs)
            log(f'phase {phase} through {ids[-1]}', json.dumps(totals))
            flush()
    flush(force=True)
    if current:
        log(f'phase {current} loaded', json.dumps(totals))
    log('finished', json.dumps(totals))


def cmd_probe(a):
    pool = Pool(a.models.split(','))
    call = [{'lang': 'en', 'word': 'bumble', 'pos': 'verb', 'en': 'To act or move clumsily; to stumble, falter.',
             'vi': 'Hành động hoặc di chuyển vụng về; vấp ngã, chùn bước.', 'id': 'p1'},
            {'lang': 'en', 'word': 'takeout', 'pos': 'noun', 'en': 'Food bought at a restaurant to be eaten elsewhere.',
             'vi': 'Thức ăn mang đến nhà hàng', 'id': 'p2'},
            {'lang': 'en', 'word': 'necks', 'pos': 'noun', 'en': 'plural of neck', 'vi': 'cổ', 'id': 'p3'}]
    text = SYSTEM.format(lang='English') + '\n\n' + user_text(call)

    def one(m):
        t, out = time.time(), ''
        try:
            out, finish, served = pool.post(m, text)
            ans = learner.parse(out)
            return m, 'ok', round(time.time() - t, 1), served, {k: v[0] for k, v in check(call, ans).items()}
        except Exception as e:
            body = e.read()[:160].decode('utf-8', 'replace') if hasattr(e, 'read') else str(e)[:160]
            return m, 'fail', round(time.time() - t, 1), None, f'{type(e).__name__} {body} {out[:300]!r}'

    with ThreadPoolExecutor(a.workers) as ex:
        for f in as_completed([ex.submit(one, m) for m in pool.models]):
            print(json.dumps(f.result(), ensure_ascii=False), flush=True)


def cmd_gate(a):
    sample = json.load(open(os.path.join(STATE, 'gate', a.sample + '.json')))
    if a.blank:
        sample = [dict(s, vi='') for s in sample]
    out_dir = os.path.join(STATE, 'gate', a.sample + ('-blank' if a.blank else ''))
    os.makedirs(out_dir, exist_ok=True)
    pool = Pool(a.models.split(','))
    calls = calls_of(sample)

    def one(model, call):
        # The writer under test is asked first; the other models serve as judge.
        solo = Pool([model] + [m for m in pool.models if m != model])
        err = None
        for attempt in range(3):
            try:
                solo.cool = {m: (0 if m == model else solo.cool[m]) for m in solo.models}
                writer, got = review(solo, call)
                if writer != model:
                    raise LookupError(f'written by {writer}')
                return model, call, got, None
            except Exception as e:
                err = f'{type(e).__name__} {e}'[:200]
                time.sleep(20 * (attempt + 1))
        return model, call, {}, err

    with ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(one, m, c) for m in pool.models[:a.writers] for c in calls]
        for f in as_completed(futs):
            model, call, got, err = f.result()
            with LOCK, open(os.path.join(out_dir, model.replace('/', '_') + '.jsonl'), 'a') as fh:
                for s in call:
                    fh.write(json.dumps({'id': s['id'], 'model': model, 'err': err, **(got.get(s['id']) or {'vi': None})},
                                        ensure_ascii=False) + '\n')
            log(model, len(got), 'of', len(call), err or '')


def cmd_undo(a):
    """Restore the backed-up rows of the given batches where the gloss is still the one this job wrote.
    With --check the restore runs inside a transaction that is rolled back, and only the count is printed."""
    loads = read_jsonl(os.path.join(STATE, 'loads.jsonl'))
    batches = [l['batch'] for l in loads] if a.all else [int(b) for b in a.batches.split(',')]
    results = {r['id']: r['vi'] for r in read_jsonl(os.path.join(STATE, 'results.jsonl'))}
    for b in batches:
        path = os.path.join(STATE, 'backup', f'batch-{b:05d}.jsonl.gz')
        old = [json.loads(line) for line in gzip.open(path, 'rt')]
        payload = [{'id': r['id'], 'gloss_vi': r['gloss_vi'], 'provenance': r['provenance'], 'ours': results.get(r['id'])}
                   for r in old]
        for i in range(0, len(payload), 5000):
            out = psql(f"""begin; set local lock_timeout = '10s';
              with u as (update lex.senses s set gloss_vi = p.gloss_vi, provenance = p.provenance
                from jsonb_to_recordset({lit(payload[i:i + 5000])}) p(id text, gloss_vi text, provenance jsonb, ours text)
                where s.id = p.id and s.gloss_vi is not distinct from p.ours and s.provenance ? 'gloss_vi_review'
                returning s.id)
              select count(*) from u; {'rollback' if a.check else 'commit'};""")
            log(f'undo batch {b}: {out.strip().splitlines()[-1]} rows {"would be restored" if a.check else "restored"}')
    if not a.check:
        revalidate()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('probe')
    p.add_argument('--models', required=True)
    p.add_argument('--workers', type=int, default=16)
    g = sub.add_parser('gate')
    g.add_argument('--models', required=True)
    g.add_argument('--workers', type=int, default=8)
    g.add_argument('--sample', default='sample')
    g.add_argument('--blank', action='store_true', help='send every sense without its current gloss')
    g.add_argument('--writers', type=int, default=1, help='how many of --models write; every model may judge')
    r = sub.add_parser('run')
    r.add_argument('--models', default='', help='only these models, instead of every usable one')
    r.add_argument('--workers', type=int, default=6)
    r.add_argument('--phases', default='A,B,C,D,E,F')
    r.add_argument('--limit', type=int, default=0)
    r.add_argument('--dry-run', action='store_true')
    r.add_argument('--guard', action='store_true',
                   help='pause while the learner batch loads too slowly')
    u = sub.add_parser('undo')
    u.add_argument('--batches', default='')
    u.add_argument('--all', action='store_true')
    u.add_argument('--check', action='store_true', help='roll back and only count')
    a = ap.parse_args()
    {'probe': cmd_probe, 'gate': cmd_gate, 'run': cmd_run, 'undo': cmd_undo}[a.cmd](a)


if __name__ == '__main__':
    main()
