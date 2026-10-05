"""Vietnamese enrichment of levelled entries through the 9router model router.

Per call: fix or fill machine-translated sense glosses, translate the examples the word page
shows, propose collocations for the lower levels, and a CEFR guess for estimated levels.
Runs on the database host. State lives in STATE_DIR so a restart resumes.

Usage: enrich.py [--lang en|es|zh] [--limit N] [--entries id,id] [--workers N] [--dry-run]
"""
import argparse, json, os, random, re, secrets, subprocess, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

STATE_DIR = os.environ.get('ENRICH_STATE', '/opt/zhesen/enrich')
ROUTER = 'http://127.0.0.1:20128/v1/chat/completions'
# OmniRoute beside 9router; a model named 'omni:<id>' goes there.
OMNI = 'http://127.0.0.1:20130/v1/chat/completions'
# In order of preference; each one cools down on its own after a quota or server error.
# ENRICH_MODELS replaces the list, to compare one model on a dry run.
# Only accounts the production assistant does not use: its zhesen combos hold ag/antigravity,
# DeepSeek web, orca and kiro, and a batch on the same account spends the learners' quota.
MODELS = os.environ['ENRICH_MODELS'].split(',') if os.environ.get('ENRICH_MODELS') else [
          'gemini/gemini-3.8-flash', 'gemini/gemini-3-flash-preview', 'or/deepseek/deepseek-v4.1-flash',
          'or/qwen/qwen3.8-flash', 'gemini/gemini-3.5-flash-lite',
          'gemini/gemini-3.6-flash', 'gemini/gemini-3.7-flash', 'gemini/gemini-3.1-flash-lite-preview',
          'gemini/gemma-4-31b-it']
MAX_SENSES, MAX_EXAMPLES, MAX_ENTRIES = 36, 30, 8
LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
LOCK = threading.Lock()
# With --redo-models, only the senses those models wrote are rewritten, and no entry is
# asked for collocations or a level.
REDO = []

# Per language: level order, the levels that get collocations, the CEFR reference (None
# when the levels are not CEFR), and the shape a collocation may take.
LANGS = {
    'en': {'name': 'English', 'levels': LEVELS, 'col': LEVELS[:4], 'cefr': 'the English Vocabulary Profile',
           'col_rule': 'lowercase, no "to" for verbs unless fixed, "sb"/"sth" not allowed, use "someone"/"something"',
           'col_eg': 'for "decision": "make a decision", "final decision"', 'phrase': r"[a-z][a-z' -]{1,60}[a-z]", 'space': True},
    'es': {'name': 'Spanish', 'levels': LEVELS, 'col': LEVELS[:4], 'cefr': 'the Plan Curricular del Instituto Cervantes',
           'col_rule': 'lowercase, verbs in the infinitive, use "alguien"/"algo" for open slots',
           'col_eg': 'for "decisión": "tomar una decisión", "decisión final"',
           'phrase': r"[a-záéíóúüñ][a-záéíóúüñ' -]{1,60}[a-záéíóúüñ]", 'space': True},
    'zh': {'name': 'Mandarin Chinese', 'levels': ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9'],
           'col': ['HSK1', 'HSK2', 'HSK3', 'HSK4'], 'cefr': None,
           'col_rule': 'simplified characters only, no spaces or punctuation, plus "py": its Hanyu Pinyin with tone marks, syllables separated by spaces (e.g. "zuò jué dìng")',
           'col_eg': 'for "决定": "做决定", "最后决定"', 'phrase': r"[\u4e00-\u9fff]{2,8}", 'space': False},
}
L = LANGS['en']
LANG = 'en'


def log(*a):
    with LOCK:
        print(datetime.now(timezone.utc).strftime('%H:%M:%S'), *a, flush=True)


def ssm(name):
    return subprocess.check_output(['aws', 'ssm', 'get-parameter', '--region', 'ap-northeast-2', '--name', name,
                                    '--with-decryption', '--query', 'Parameter.Value', '--output', 'text'], text=True).strip()


def revalidate():
    """Drop the site's cached dictionary reads so the new rows show."""
    try:
        req = urllib.request.Request('https://zhesen-main.vercel.app/api/revalidate', data=b'', method='POST',
                                     headers={'x-revalidate-secret': ssm('/zhesen/prod/revalidate_secret')})
        with urllib.request.urlopen(req, timeout=30) as r:
            log('revalidate', r.status)
    except Exception as e:
        log('revalidate failed', type(e).__name__, str(e)[:120])


def psql(sql):
    r = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres',
                        '-At', '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:500])
    return r.stdout


def lit(obj):
    """A jsonb literal that cannot be closed by its own content."""
    s = json.dumps(obj, ensure_ascii=False)
    tag = 'j' + secrets.token_hex(6)
    return f'${tag}${s}${tag}$::jsonb'


def rows(sql):
    out = psql(f'select coalesce(json_agg(t), \'[]\') from ({sql}) t;').strip()
    return json.loads(out or '[]')


# ---------------------------------------------------------------- work list

def entry_queue(targets=False):
    """Levelled entries, lowest level first, then by frequency. With `targets`, the
    collocation targets that still have no Vietnamese sense."""
    if targets:
        return rows(f"""
          select e.id, e.headword, e.entry_type, e.level, false as est, e.form_of
          from lex.entries e where e.lang = '{LANG}' and e.id in (
            select related_entry_id from lex.lex_relations where relation_type = 'collocation')
            and not exists (select 1 from lex.senses s where s.entry_id = e.id and s.gloss_vi is not null)
          order by e.id""")
    if REDO:
        return rows(f"""
          select e.id, e.headword, e.entry_type, e.level, false as est, e.form_of
          from lex.entries e where e.lang = '{LANG}' and exists (
            select 1 from lex.senses s where s.entry_id = e.id and s.provenance->>'ai' = any ({arr_lit(REDO)}))
          order by e.frequency_rank nulls last, e.id""")
    order = ','.join(f"'{v}'" for v in L['levels'])
    # An inflected form takes its level and its collocations from its lemma.
    return rows(f"""
      select id, headword, entry_type, level, form_of,
             level_is_estimated and form_of is null and {'true' if L['cefr'] else 'false'} as est
      from lex.entries where lang = '{LANG}' and level is not null
      order by array_position(array[{order}], level), frequency_rank nulls last, id""")


def arr_lit(items):
    return 'array[' + ','.join("'" + i.replace("'", "''") + "'" for i in items) + ']::text[]'


def fix_expr():
    if REDO:
        return f"(s.gloss_vi is null or s.provenance->>'ai' = any ({arr_lit(REDO)}))"
    return '(s.gloss_vi is null or s.gloss_vi_is_mt)'


def load_material(ids):
    arr = lit(ids)
    senses = rows(f"""
      select s.id, s.entry_id, s.pos, s.sense_order, s.gloss_en, s.gloss_vi,
             {fix_expr()} as fix
      from lex.senses s where s.entry_id in (select jsonb_array_elements_text({arr}))
        and s.gloss_en is not null and length(s.gloss_en) between 2 and 400 and s.gloss_en !~ '^CL:'
      order by s.entry_id, s.sense_order""")
    # The page shows per sense the first two by (translation first, id), and the unlinked
    # rows translated first; translating these puts a translation on screen.
    examples = rows(f"""
      with x as (
        select x.id, x.entry_id, x.sense_id, x.text, x.translation_vi,
               row_number() over (partition by x.entry_id, x.sense_id
                                  order by x.translation_vi nulls last,
                                           case when x.sense_id is null then length(x.text) end, x.id) as rn
        from lex.examples x where x.entry_id in (select jsonb_array_elements_text({arr}))
          and length(x.text) between 8 and 300)
      select id, entry_id, sense_id, text from x
      where translation_vi is null and rn <= case when sense_id is null then 6 else 2 end
      order by entry_id, sense_id nulls last, id""")
    return senses, examples


def plan_calls(entries, senses, examples):
    """Group entries into calls within the sense, example and entry budgets."""
    by_e = {e['id']: {'entry': e, 'senses': [], 'examples': []} for e in entries}
    for s in senses:
        by_e[s['entry_id']]['senses'].append(s)
    sense_entry = {s['id']: s['entry_id'] for s in senses}
    for x in examples:
        by_e[x['entry_id']]['examples'].append(x)
    units = []
    for eid, d in by_e.items():
        ss, xs = d['senses'], d['examples']
        wants_col = d['entry']['entry_type'] == 'word' and d['entry']['level'] in L['col']
        if not ss and not xs and not wants_col and not d['entry']['est']:
            continue
        # Long entries split into chunks of senses; each chunk carries its own examples.
        chunks = [ss[i:i + MAX_SENSES] for i in range(0, len(ss), MAX_SENSES)] or [[]]
        for ci, chunk in enumerate(chunks):
            ids = {s['id'] for s in chunk}
            cx = [x for x in xs if x['sense_id'] in ids or (ci == 0 and x['sense_id'] not in sense_entry)]
            for j in range(0, max(len(cx), 1), MAX_EXAMPLES):
                units.append({'entry': d['entry'], 'senses': chunk if j == 0 else [],
                              'examples': cx[j:j + MAX_EXAMPLES], 'head': ci == 0 and j == 0})
    calls, cur = [], []
    for u in units:
        ns = sum(len(v['senses']) for v in cur) + len(u['senses'])
        nx = sum(len(v['examples']) for v in cur) + len(u['examples'])
        if cur and (ns > MAX_SENSES or nx > MAX_EXAMPLES or len(cur) >= MAX_ENTRIES):
            calls.append(cur)
            cur = []
        cur.append(u)
    if cur:
        calls.append(cur)
    return calls


# ---------------------------------------------------------------- prompt

RULES = """You are a senior {name}-Vietnamese lexicographer writing a learner's dictionary for Vietnamese speakers.
The senses are defined in English; the examples are in {name}.
Return one JSON object and nothing else:
{{"s":[{{"n":<sense number>,"vi":"..."}}], "x":[{{"n":<example number>,"vi":"..."}}],
 "w":[{{"n":<entry number>,"col":[{{"en":"...","vi":"..."}}],"cefr":"A1|A2|B1|B2|C1|C2"}}]}}

Sense glosses ("s"): one item for every sense marked FIX.
- Give the Vietnamese equivalent a bilingual dictionary would print, not a definition: 1 to 5 words, up to 3 alternatives separated by ", ", at most 60 characters, no final period.
- Match the part of speech and the exact sense described by the English definition, not the word's most common meaning. A verb sense gets a verb, an adjective sense an adjective.
- Use natural, standard Vietnamese as used in Vietnam today. Prefer common words over Sino-Vietnamese jargon unless the sense is technical. Keep register (slang stays informal, law terms stay legal).
- If the current Vietnamese ("now:") is correct and natural, return it unchanged. Fix it when it is wrong, literal, awkward, too long, or describes another sense.
- Names of people and places: say in Vietnamese what the name is ("tên nam", "họ", "thành phố ở Bắc Dakota, Mỹ"), using the usual Vietnamese name when one exists; never return the bare name alone. Species and chemical names: the usual Vietnamese name.
- A gloss that only points to another word ("plural of X", "alternative form of X", "ellipsis of X", "second-person singular imperative of X") gets the Vietnamese grammar label with X kept as written ("số nhiều của X", "dạng khác của X", "dạng rút gọn của X", "mệnh lệnh ngôi thứ hai số ít của X"); never translate X's meaning into it.
- An old, regional or specialist sense (mining, hairstyle, sewing, sailing, law) gets the established Vietnamese term of that field, never a word-by-word rendering. No English words in the Vietnamese unless Vietnamese uses them as the normal term.
Examples ("x"): one item for every example. Translate the whole {name} sentence into natural Vietnamese, faithfully and in the sense given; keep names, numbers and tone. No notes, no quotes around it.
Entries ("w"): exactly one item for every entry whose heading is marked COL or CEFR; never omit one. Entries without a mark get no item.
- COL: up to 6 collocations or fixed phrases containing the headword that an intermediate learner needs most, most frequent first ({col_eg}). Each "en" is the {name} phrase in dictionary form ({col_rule}), each "vi" its Vietnamese equivalent in 1 to 6 words. Every phrase contains the headword itself, unchanged, as a whole word. Skip anything rare or trivially literal: a degree adverb, a negation, an article or a bare preposition plus the word (very happy, not like, en lisboa, 很喜欢, 不喜欢) is not a collocation, and neither is a full name or a sentence.
- CEFR: the CEFR level at which learners typically meet this word in its main sense, following {cefr}."""


def rules():
    return RULES.format(name=L['name'], col_eg=L['col_eg'], col_rule=L['col_rule'], cefr=L['cefr'] or '-')


def prompt(call):
    lines, smap, xmap, emap, n_s, n_x = [], {}, {}, {}, 0, 0
    for n_e, u in enumerate(call, 1):
        e = u['entry']
        if u['head']:
            emap[n_e] = e
        flags = []
        # A name has no collocations: asked for some, the models return full names and sentences.
        if (u['head'] and e['entry_type'] == 'word' and e['level'] in L['col'] and not REDO
                and not e.get('form_of') and any(s['pos'] != 'name' for s in u['senses'])):
            flags.append('COL')
        if u['head'] and e['est']:
            flags.append('CEFR')
        lines.append(f"\n## E{n_e} \"{e['headword']}\" ({e['entry_type']}) {' '.join(flags)}".rstrip())
        local = {}
        for s in u['senses']:
            n_s += 1
            smap[n_s] = s
            local[s['id']] = n_s
            now = f" | now: {s['gloss_vi']}" if s['gloss_vi'] else ''
            mark = 'FIX' if s['fix'] else 'ok'
            lines.append(f"S{n_s} [{mark}] ({s['pos'] or '-'}) {s['gloss_en']}{now}")
        for x in u['examples']:
            n_x += 1
            xmap[n_x] = x
            ref = f" (sense S{local[x['sense_id']]})" if x['sense_id'] in local else ''
            lines.append(f"X{n_x}{ref}: {x['text']}")
    text = rules() + '\n\nNumbers: entries E1.., senses S1.., examples X1.. (put the number only in "n").\n' + '\n'.join(lines)
    return text, smap, xmap, emap


# ---------------------------------------------------------------- model

class Router:
    def __init__(self, key):
        self.key = key
        self.omni_key = ssm('/zhesen/prod/omniroute_api_key') if any(m.startswith('omni:') for m in MODELS) else None
        self.cool = {m: 0.0 for m in MODELS}
        self.fails = {m: 0 for m in MODELS}

    def rest(self, model, wait, cap=1800):
        # Twelve workers re-trip a window that reopens in seconds, so repeated failures back off,
        # to 2 minutes past a stated reset and to 30 minutes past an exhausted daily quota.
        with LOCK:
            self.fails[model] += 1
            self.cool[model] = time.time() + max(wait, min(cap, 15 * 2 ** self.fails[model]))

    def ask(self, text):
        # The Gemini API daily quota reopens at midnight Pacific, so a call waits up to 16 hours;
        # a call that gave up marked its entries failed, and the last pass never retries them.
        last, deadline = None, time.time() + 16 * 3600
        while time.time() < deadline:
            now = time.time()
            ready = [m for m in MODELS if self.cool[m] <= now]
            if not ready:
                time.sleep(min(self.cool.values()) - now + 1)
                continue
            model = ready[0]
            # OpenRouter refuses a request whose max_tokens the remaining credit cannot cover.
            cap = 3500 if model.startswith('or/') else 8000
            omni = model.startswith('omni:')
            body = json.dumps({'model': model[5:] if omni else model, 'max_tokens': cap, 'stream': False,
                               'temperature': 0.2, 'messages': [{'role': 'user', 'content': text}]}).encode()
            req = urllib.request.Request(OMNI if omni else ROUTER, body,
                                         {'Authorization': f'Bearer {self.omni_key if omni else self.key}',
                                          'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, timeout=240) as r:
                    d = json.load(r)
                self.fails[model] = 0
                return model, d['choices'][0]['message']['content']
            except urllib.error.HTTPError as e:
                body = e.read()[:300]
                last = f'{model} HTTP {e.code} {body[:160]!r}'
                quota = e.code in (402, 403, 429) or any(k in body for k in (b'429', b'403', b'402', b'quota', b'credits'))
                # The router says when a window reopens: "reset after 1m 18s".
                m = re.search(rb'reset after (?:(\d+)m ?)?(\d+)s', body)
                wait = int(m.group(1) or 0) * 60 + int(m.group(2)) + 2 if m else (300 if quota else 60)
                self.rest(model, wait, 120 if m else 1800)
            except Exception as e:
                last = f'{model} {type(e).__name__} {e}'
                self.rest(model, 30)
            log('retry', last)
        raise RuntimeError(last)


def parse(text):
    t = text.strip()
    t = re.sub(r'^```(?:json)?\s*|\s*```$', '', t)
    i, j = t.find('{'), t.rfind('}')
    # DeepSeek's web replies can carry a raw newline or tab inside a string.
    return json.loads(t[i:j + 1], strict=False)


def clean(s, cap, quotes=True):
    """`quotes=False` keeps the quotation marks of a sentence that is itself dialogue."""
    if not isinstance(s, str):
        return None
    s = re.sub(r'\s+', ' ', s).strip()
    if quotes:
        s = s.strip('"“”')
    s = s.rstrip('.') if cap <= 80 else s
    return s if 0 < len(s) <= cap else None


def norm_phrase(s):
    s = re.sub(r'\s+', ' ' if L['space'] else '', s.strip().lower())
    return s if re.fullmatch(L['phrase'], s) and (' ' in s or not L['space']) else None


PINYIN = re.compile(r"[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+( [a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+)*")


# ---------------------------------------------------------------- write

def has_word(phrase, head):
    """The headword as a whole word: "deber de" is not a collocation of debe."""
    if not L['space']:
        return head in phrase
    return re.search(rf'(?<!\w){re.escape(head)}(?!\w)', phrase) is not None


def write(call, model, out, smap, xmap, emap, dry):
    s_rows, x_rows, c_rows, lv_rows = [], [], [], []
    for it in out.get('s') or []:
        s = smap.get(it.get('n')) if isinstance(it, dict) else None
        vi = clean(it.get('vi'), 60) if s else None
        if s and s['fix'] and vi and vi.lower() != (s['gloss_vi'] or '').lower():
            s_rows.append({'id': s['id'], 'vi': vi})
    for it in out.get('x') or []:
        x = xmap.get(it.get('n')) if isinstance(it, dict) else None
        vi = clean(it.get('vi'), 900, quotes=not x['text'].lstrip().startswith(('"', '“', '«', '—'))) if x else None
        if x and vi and len(vi) <= 3 * len(x['text']) + 40:
            x_rows.append({'id': x['id'], 'vi': vi})
    for w in out.get('w') or []:
        e = emap.get(w.get('n')) if isinstance(w, dict) else None
        if not e:
            continue
        if e['entry_type'] == 'word' and e['level'] in L['col']:
            for c in (w.get('col') or [])[:6]:
                en = norm_phrase(c.get('en', '')) if isinstance(c, dict) else None
                vi = clean(c.get('vi'), 60) if en else None
                py = re.sub(r'\s+', ' ', str(c.get('py') or '').strip().lower()) if en else ''
                if LANG == 'zh' and not PINYIN.fullmatch(py):
                    continue
                if en and vi and has_word(en, e['headword'].lower()) and en != e['headword'].lower():
                    c_rows.append({'entry_id': e['id'], 'text': en, 'vi': vi, 'py': py or None})
        if e['est'] and w.get('cefr') in LEVELS:
            lv_rows.append({'id': e['id'], 'level': w['cefr']})
    counts = {'senses': len(s_rows), 'examples': len(x_rows), 'collocations': len(c_rows), 'levels': len(lv_rows)}
    if dry:
        return counts, {'s': s_rows, 'x': x_rows, 'c': c_rows, 'l': lv_rows, 'w_raw': out.get('w'),
                        'heads': [(e['id'], e['level'], e['entry_type'], e['est']) for e in emap.values()]}
    prov = lit({'ai': model, 'ai_at': datetime.now(timezone.utc).date().isoformat()})
    sql = ['begin;']
    if s_rows:
        sql.append(f"""update lex.senses s set gloss_vi = p.vi, gloss_vi_is_mt = true,
          provenance = s.provenance || {prov}
            || jsonb_build_object('gloss_vi_before', coalesce(s.provenance->'gloss_vi_before', to_jsonb(s.gloss_vi)))
          from jsonb_to_recordset({lit(s_rows)}) p(id text, vi text)
          where s.id = p.id and (s.gloss_vi is null or s.gloss_vi_is_mt) and lower(coalesce(s.gloss_vi, '')) <> lower(p.vi);""")
    if x_rows:
        sql.append(f"""update lex.examples x set translation_vi = p.vi
          from jsonb_to_recordset({lit(x_rows)}) p(id bigint, vi text)
          where x.id = p.id and x.translation_vi is null;""")
    if lv_rows:
        sql.append(f"""update lex.entries e set provenance = e.provenance || jsonb_build_object('ai_level', p.level) || {prov}
          from jsonb_to_recordset({lit(lv_rows)}) p(id text, level text) where e.id = p.id;""")
    if c_rows:
        sql.append(f"""
          create temp table col on commit drop as
            select p.entry_id, p.text, p.vi,
                   coalesce((select t.id from lex.entries t where t.lang = '{LANG}' and t.headword_normalized = p.text
                             order by (t.entry_type = 'name'), t.frequency_rank nulls last, t.id limit 1), '{LANG}:' || p.text) as target,
                   p.py
            from jsonb_to_recordset({lit(c_rows)}) p(entry_id text, text text, vi text, py text);
          insert into lex.entries (id, lang, entry_type, headword, headword_normalized, source_id, provenance)
            select distinct on (target) target, '{LANG}', 'collocation', text, text, 'zhesen-ai', {prov} from col
            on conflict (id) do nothing;
          insert into lex.pronunciations (entry_id, accent, ipa, source_id)
            select distinct on (c.target) c.target, 'zh-pinyin', c.py, 'zhesen-ai' from col c
            where c.py is not null and not exists (select 1 from lex.pronunciations p where p.entry_id = c.target);
          insert into lex.senses (id, entry_id, sense_order, gloss_vi, gloss_vi_is_mt, source_id, provenance)
            select distinct on (c.target) c.target || '#ai1', c.target, 1, c.vi, true, 'zhesen-ai', {prov}
            from col c where not exists (select 1 from lex.senses s where s.entry_id = c.target)
            on conflict (id) do nothing;
          update lex.senses s set gloss_vi = c.vi, gloss_vi_is_mt = true, provenance = s.provenance || {prov}
            from (select distinct on (c.target) c.target, c.vi, (select id from lex.senses f where f.entry_id = c.target
                    order by f.sense_order, f.id limit 1) as first_id from col c) c
            where s.id = c.first_id and s.gloss_vi is null
              and not exists (select 1 from lex.senses v where v.entry_id = c.target and v.gloss_vi is not null);
          insert into lex.lex_relations (entry_id, related_entry_id, related_text, relation_type, source_id)
            select distinct c.entry_id, c.target, c.text, 'collocation', 'zhesen-ai' from col c
            where not exists (select 1 from lex.lex_relations r where r.entry_id = c.entry_id
                              and r.relation_type = 'collocation' and lower(r.related_text) = c.text);""")
    sql.append('commit;')
    psql('\n'.join(sql))
    return counts, None


# ---------------------------------------------------------------- main

def main():
    global L, LANG, MAX_SENSES, MAX_EXAMPLES, REDO
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--entries', default='')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--chunk', type=int, default=200)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--collocation-targets', action='store_true')
    ap.add_argument('--redo-models', default='', help='comma-separated models whose senses to rewrite')
    ap.add_argument('--lang', choices=sorted(LANGS), default='en')
    ap.add_argument('--max-senses', type=int, default=MAX_SENSES)
    ap.add_argument('--max-examples', type=int, default=MAX_EXAMPLES)
    a = ap.parse_args()
    L, LANG, MAX_SENSES, MAX_EXAMPLES = LANGS[a.lang], a.lang, a.max_senses, a.max_examples
    REDO = [m for m in a.redo_models.split(',') if m]
    os.makedirs(STATE_DIR, exist_ok=True)
    done_path = os.path.join(STATE_DIR, 'done.txt')
    done = set(open(done_path).read().split('\n')) if os.path.exists(done_path) else set()
    if not a.dry_run:
      psql("""insert into lex.sources (id, name, url, license, tier, notes) values ('zhesen-ai',
      'zhesen AI enrichment', null, 'machine output',  'open',
      'Collocations and Vietnamese glosses written by a language model through the 9router router (Gemini and GPT-OSS). Needs a human pass before it is treated as authoritative.')
      on conflict (id) do nothing;""")
    router = Router(ssm('/zhesen/prod/ai_api_key'))
    q = entry_queue(a.collocation_targets)
    if a.entries:
        want = set(a.entries.split(','))
        q = [e for e in q if e['id'] in want]
    q = [e for e in q if e['id'] not in done]
    if a.limit:
        q = q[:a.limit]
    log(f'{len(q)} entries to do, {len(done)} done before')
    total = {'senses': 0, 'examples': 0, 'collocations': 0, 'levels': 0, 'calls': 0, 'failed': 0}
    for i in range(0, len(q), a.chunk):
        block = q[i:i + a.chunk]
        senses, examples = load_material([e['id'] for e in block])
        calls = plan_calls(block, senses, examples)

        def ask_once(call):
            text, smap, xmap, emap = prompt(call)
            for attempt in range(3):
                model, reply = router.ask(text)
                try:
                    return model, write(call, model, parse(reply), smap, xmap, emap, a.dry_run)
                except (ValueError, KeyError, TypeError) as e:
                    log('bad json', model, str(e)[:80], reply[:120].replace('\n', ' '))
            raise RuntimeError('no parseable reply')

        def run(call):
            try:
                return ask_once(call)
            except RuntimeError:
                if not any(u['examples'] for u in call):
                    raise
            # A model refuses a whole call over one offensive example sentence (a Wiktionary
            # quotation under en:good). Redo the call without examples, then each example
            # alone, and leave the refused ones untranslated.
            model, (counts, detail) = ask_once([dict(u, examples=[]) for u in call])
            for u in call:
                for x in u['examples']:
                    try:
                        _, (c, _) = ask_once([dict(u, senses=[], examples=[x], head=False)])
                        counts['examples'] += c['examples']
                    except RuntimeError:
                        log('skipped example', x['id'])
            return model, (counts, detail)

        failed_ids = set()
        with ThreadPoolExecutor(a.workers) as ex:
            futs = {ex.submit(run, c): c for c in calls}
            for f in as_completed(futs):
                c = futs[f]
                ids = sorted({u['entry']['id'] for u in c})
                try:
                    model, (counts, detail) = f.result()
                except Exception as e:
                    total['failed'] += 1
                    failed_ids.update(ids)
                    log('FAILED', ids[:3], str(e)[:200])
                    continue
                total['calls'] += 1
                for k, v in counts.items():
                    total[k] += v
                if detail is not None:
                    print(json.dumps({'model': model, 'ids': ids, **detail}, ensure_ascii=False), flush=True)
        if not a.dry_run:
            # An entry counts as done once every call touching it was attempted; failed ones rerun.
            with open(done_path, 'a') as fh:
                for e in block:
                    if e['id'] not in failed_ids:
                        fh.write(e['id'] + '\n')
        log(f'progress {min(i + a.chunk, len(q))}/{len(q)}', json.dumps(total))
        if not a.dry_run and (i // a.chunk) % 10 == 9:
            revalidate()
    if not a.dry_run:
        revalidate()
    log('finished', json.dumps(total))


if __name__ == '__main__':
    main()
