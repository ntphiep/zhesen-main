"""Builds the learner layer of the dictionary (migration 0076) through the 9router and OmniRoute routers.

Per entry: one model writes the layer from the raw senses and examples, a script checks its
structure, a different model reviews it, the first corrects it, and `lex.learner_load` stores
it. Every model both routers serve takes part except Claude; see Pool. Every step's output
is cached under CACHE_DIR, so a rerun resumes where it stopped, and an entry already loaded
at one of DONE_VERSIONS is skipped.

usage:
  learner.py run [--lang en,es,zh] [--top 3000] [--entries id,id] [--limit N] [--workers N] [--models a,b] [--dry-run]
  learner.py load FILE...     load cached layer files, e.g. a pilot run
  learner.py reapply          re-run lex.learner_apply_fixes over every loaded entry
env: AI_BASE_URL, AI_API_KEY, OMNI_BASE_URL and OMNI_API_KEY (optional, for OmniRoute),
     SUPABASE_URL (the site's /rest/v1 host), SUPABASE_SERVICE_ROLE_KEY, SITE_URL and REVALIDATE_SECRET (optional, to flush the site cache after loading)
"""
import argparse, json, os, re, sys, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from prompts import DOMAINS as DOMAIN_LIST, FIX, LANG_NAME, REGISTERS as REGISTER_LIST, REVIEW, SCHEMA_HINT, SYSTEM, core_range

PROMPT_VERSION = 'v5'
# v5 only adds the certain flag to gloss fixes, so a layer loaded at v4 is not redone.
DONE_VERSIONS = ('v4', 'v5')
CACHE_DIR = os.path.expanduser(os.environ.get('LEARNER_CACHE', '~/.cache/zhesen/learner'))
MAX_EXAMPLES = 40
MAX_RELATIONS = 150
FLUSH_EVERY = 1800

DOMAINS, REGISTERS = set(DOMAIN_LIST), set(REGISTER_LIST)
CEFR = {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'}
LOCK = threading.Lock()


def log(*a):
    with LOCK:
        print(datetime.now(timezone.utc).strftime('%H:%M:%S'), *a, flush=True)


# ---------------------------------------------------------------- database, through PostgREST

def rest(path, body=None, method=None, headers=None):
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    h = {'apikey': key, 'Authorization': f'Bearer {key}', 'Accept-Profile': 'lex', 'Content-Profile': 'lex',
         'Content-Type': 'application/json', **(headers or {})}
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    url = os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1/' + path
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data, h, method=method), timeout=120) as r:
                raw = r.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read()[:400].decode('utf-8', 'replace')
            if e.code < 500 or attempt == 4:
                raise RuntimeError(f'{method or ("POST" if data else "GET")} {path[:80]}: {e.code} {detail}')
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 4:
                raise
        time.sleep(3 * (attempt + 1))


def rest_all(path, page=1000):
    out = []
    while True:
        rows = rest(f'{path}&limit={page}&offset={len(out)}')
        out += rows
        if len(rows) < page:
            return out


def q(v):
    return urllib.parse.quote(v, safe='')


def queue(langs, top):
    entries = []
    for lang in langs:
        entries += rest_all(f'entries?lang=eq.{lang}&frequency_rank=lte.{top}&select=id,frequency_rank'
                            f'&order=frequency_rank,id')
    done = {r['entry_id'] for r in rest_all(f'learner_entries?prompt_version=in.({",".join(DONE_VERSIONS)})'
                                            '&select=entry_id&order=entry_id')}
    # Interleaved by rank, so all three languages fill in from their most common words.
    entries.sort(key=lambda e: (e['frequency_rank'], e['id']))
    return [e['id'] for e in entries if e['id'] not in done]


def traditional_only():
    """Characters that appear in a traditional form and in no simplified headword: an
    example containing one is written in traditional characters."""
    rows = rest_all('entries?lang=eq.zh&select=id,headword,traditional&order=id')
    simplified = {c for r in rows for c in r['headword']}
    return {c for r in rows for c in (r['traditional'] or '') if c not in simplified}


def raw_entry(entry_id):
    """The entry as the model sees it: every sense, up to 40 examples and 150 relations."""
    rows = rest(f'entries?id=eq.{q(entry_id)}&select=id,lang,headword,level,frequency_rank,attributes')
    if not rows:
        raise LookupError(f'{entry_id}: no entry')
    e = rows[0]
    senses = rest(f'senses?entry_id=eq.{q(entry_id)}&select=id,pos,gloss_en,gloss_vi,gloss_vi_is_mt&order=sense_order,id')
    xs = rest(f'examples?entry_id=eq.{q(entry_id)}&select=id,sense_id,text,translation_vi&order=id&limit=600')
    rels = rest(f'lex_relations?entry_id=eq.{q(entry_id)}&select=relation_type,related_text'
                f'&related_text=not.is.null&limit={MAX_RELATIONS}')
    # Two per sense and six unlinked, translated ones first: the sentences the page shows.
    picked, per = [], {}
    for x in sorted(xs, key=lambda x: (x['translation_vi'] is None, len(x['text']), x['id'])):
        if not 8 <= len(x['text']) <= 300:
            continue
        k = x['sense_id']
        if per.get(k, 0) < (2 if k else 6):
            per[k] = per.get(k, 0) + 1
            picked.append(x)
    picked = sorted(picked, key=lambda x: x['id'])[:MAX_EXAMPLES]
    rel = {}
    for r in rels:
        rel.setdefault(r['relation_type'], []).append(r['related_text'])
    return {'id': e['id'], 'lang': e['lang'], 'headword': e['headword'], 'level': e['level'],
            'frequency_rank': e['frequency_rank'], 'pinyin': (e['attributes'] or {}).get('pinyin'),
            'senses': [{'id': s['id'], 'pos': s['pos'], 'gloss_en': (s['gloss_en'] or '')[:300],
                        'gloss_vi': s['gloss_vi'], 'gloss_vi_mt': bool(s['gloss_vi_is_mt'])} for s in senses],
            'examples': [{'id': f'x{i}', 'sense_id': x['sense_id'], 'text': x['text'],
                          'vi': x['translation_vi']} for i, x in enumerate(picked)],
            'relations': rel}


# ---------------------------------------------------------------- models

# Never asked: Claude under any of its names, on the owner's instruction; a name without a
# provider or an auto router, either of which may resolve to Claude; and models that do not
# write text. AI Horde lists image models (Deliberate, DucHaiten) beside its text ones.
CLAUDE = re.compile(r'claude|anthropic|opus|sonnet|haiku|fable', re.I)
EXCLUDE = re.compile(r'(^|[/:])auto(/|$)|combo|embed|image|tts|whisper|audio|lyria|rerank|safety|guard|moderation|ocr|'
                     r'ui-tars|aihorde|veo|video|sora|kling|suno|music|flux|imagen|dall-e|midjourney|stable-diffusion', re.I)
MIN_BILLIONS = 20
# Stronger first; a model matching none of these follows them, and a light variant comes last.
RANK = [re.compile(p) for p in (
    r'gemini-3(\.\d)?-pro|gemini-pro|gpt-6|gpt-5\.[5-9]|deepseek-v4(\.\d)?-pro|kimi-k3|glm-5|grok-4',
    r'gemini-3\.[5-9]-flash|deepseek-v4|qwen3\.[5-9]|nemotron-3-ultra|mimo|muse-spark',
    r'gemini-3(\.\d)?-flash|gemma-4-31b|nemotron-3-super|gpt-oss-120b|deepseek|qwen3|dots|ling|space-bunny',
)]
LIGHT = re.compile(r'(^|[-/_.])(lite|mini|nano|lightning|code)([-/_.:]|$)|(^|/)free$')
# A refusal that names a quota or an unconfigured provider; 9router wraps both in a 503.
QUOTA = re.compile(r'\[40[23]\]|\[429\]|quota|exhausted|credits|rate.?limit|high demand|reset after', re.I)
DEAD = re.compile(r'\[40[014]\]|no active credentials|not found|not supported|not configured|not installed|ENOENT|'
                  r'invalid token|token included in the request is invalid|authorization failed|egress IP|\[52[0-9]\]|'
                  r'must be an absolute path|Playwright is not', re.I)
# A refusal about the provider account rather than the model rests every model behind it: one
# rejected Kiro token answered for 15 models, 5 seconds each.
PROVIDER_DOWN = re.compile(r'no active credentials|invalid token|token included|authorization failed|ENOENT|not configured|'
                           r'not installed|egress IP|\[52[0-9]\]|CLI not found|must be an absolute path|Playwright is not', re.I)
# A 400 about this request, not the model: a long prompt, or a reply a safety filter stopped.
REQUEST_REFUSED = re.compile(r'context|too long|too many tokens|maximum|safety|blocked|content', re.I)
MAX_TOKENS = 16000
# OmniRoute's web-session providers revoke a token past about 6 calls at once.
PER_PROVIDER = 4


def usable(name):
    if '/' not in name or CLAUDE.search(name) or EXCLUDE.search(name):
        return False
    # Parameter counts in the name, skipping the active count of a mixture ("120b-a12b").
    sizes = [float(n) for n in re.findall(r'(?<![a-z])e?(\d+(?:\.\d+)?)b(?![a-z])', name.lower())]
    return not sizes or max(sizes) >= MIN_BILLIONS


def rank(name):
    tier = next((i for i, p in enumerate(RANK) if p.search(name)), len(RANK))
    return tier + (len(RANK) + 1 if LIGHT.search(name) else 0)


def provider(name):
    return name.split('/')[0]


def family(name):
    """The model behind a name, whichever router and provider serve it: ag/gemini-3-pro-low and
    gc/gemini-3-pro-preview are one model, so one of them never reviews the other."""
    base = name.rsplit('/', 1)[-1].lower()
    return re.sub(r'(:free|-(low|medium|high|xhigh|max|extra-low|preview|thinking|agentic|agent|\d{4}))+$', '', base)


def reset_after(body):
    """Seconds until the provider's quota window reopens, from the router's error text
    ("[antigravity/gemini-3.8-flash] [403]: HTTP 403 (reset after 2m)"), or None."""
    m = re.search(r'reset after (?:(\d+)m ?)?(\d+)s', body)
    if m:
        return int(m.group(1) or 0) * 60 + int(m.group(2))
    m = re.search(r'reset after (\d+)\s*(m|h)', body)
    return int(m.group(1)) * {'m': 60, 'h': 3600}[m.group(2)] if m else None


class Pool:
    """Every usable model on 9router and OmniRoute, strongest first, each resting on its own after
    a refusal. There is no up-front probe: one over all 1,137 took 3 minutes, and of the 17 models
    that answered it only 3 answered the next one, so a probe says little about the next call."""

    def __init__(self, only=None):
        self.routers = {'': (os.environ['AI_BASE_URL'], os.environ['AI_API_KEY'])}
        if os.environ.get('OMNI_API_KEY'):
            self.routers['omni:'] = (os.environ.get('OMNI_BASE_URL', 'http://127.0.0.1:20130/v1'),
                                     os.environ['OMNI_API_KEY'])
        self.models = [m for m in only or self.discover() if usable(m.removeprefix('omni:'))]
        self.cool = dict.fromkeys(self.models, 0.0)
        self.fails = dict.fromkeys(self.models, 0)
        self.cap = dict.fromkeys(self.models, MAX_TOKENS)
        self.temperature = dict.fromkeys(self.models, True)
        self.busy = dict.fromkeys(self.models, 0)

    def discover(self):
        out = []
        for prefix, (base, key) in self.routers.items():
            try:
                req = urllib.request.Request(base.rstrip('/') + '/models', headers={'Authorization': f'Bearer {key}'})
                with urllib.request.urlopen(req, timeout=30) as r:
                    out += [prefix + m['id'] for m in json.load(r)['data']]
            except Exception as e:
                log('model list failed', prefix or '9router', type(e).__name__, str(e)[:120])
        return sorted(out, key=rank)

    def post(self, model, text):
        """(text, finish reason, the model the provider says answered). Streamed, so a provider
        that never answers times out after 5 minutes of silence instead of holding a worker for as
        long as a real reply takes. Any call ends after 20 minutes, so keep-alive lines cannot
        hold a worker either. A router that answers with one JSON body is read as such."""
        prefix = 'omni:' if model.startswith('omni:') else ''
        deadline = time.time() + 1200
        base, key = self.routers[prefix]
        req_body = {'model': model[len(prefix):], 'max_tokens': self.cap[model], 'stream': True,
                    'messages': [{'role': 'user', 'content': text}]}
        if self.temperature[model]:
            req_body['temperature'] = 0.2
        req = urllib.request.Request(base.rstrip('/') + '/chat/completions', json.dumps(req_body).encode(),
                                     {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json',
                                      'Accept': 'text/event-stream'})
        parts, finish, served = [], None, None
        with urllib.request.urlopen(req, timeout=300) as r:
            if 'event-stream' not in (r.headers.get('Content-Type') or ''):
                d = json.load(r)
                if not d.get('choices'):
                    raise RuntimeError(f'no choices: {json.dumps(d.get("error"))[:200]}')
                c = d['choices'][0]
                return (c.get('message') or {}).get('content') or '', c.get('finish_reason'), d.get('model')
            for raw in r:
                if time.time() > deadline:
                    raise TimeoutError('no reply within 20 minutes')
                line = raw.decode('utf-8', 'replace').strip()
                if not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if data == '[DONE]':
                    break
                try:
                    ev = json.loads(data)
                except ValueError:
                    continue
                if ev.get('error'):
                    raise RuntimeError(f'error in stream: {json.dumps(ev["error"])[:200]}')
                served = ev.get('model') or served
                for choice in ev.get('choices') or []:
                    parts.append((choice.get('delta') or {}).get('content') or '')
                    finish = choice.get('finish_reason') or finish
        return ''.join(parts), finish, served

    def rest(self, model, wait, cap=1800):
        # Twelve workers re-trip a window that reopens in seconds, so repeated refusals back off.
        with LOCK:
            self.fails[model] += 1
            self.cool[model] = time.time() + max(wait, min(cap, 15 * 2 ** self.fails[model]))

    def rest_provider(self, model, wait, cap):
        for m in [m for m in self.models if provider(m) == provider(model)]:
            self.rest(m, wait, cap)

    def refused(self, model, e):
        """Rests the model, or its whole provider, by what the refusal says. An error sent inside
        the stream carries the same text as an HTTP one and is read the same way."""
        if isinstance(e, urllib.error.HTTPError):
            code, body = e.code, e.read()[:400].decode('utf-8', 'replace')
            e.close()
        else:
            code, body = None, f'{type(e).__name__} {e}'
        stream = isinstance(e, RuntimeError)
        if (code == 402 or '[402]' in body) and self.cap[model] > 4000 and re.search(r'max_tokens|afford', body):
            # OpenRouter refuses a max_tokens the remaining credit cannot cover.
            self.cap[model] //= 2
        elif code == 400 and 'temperature' in body and self.temperature[model]:
            # Reasoning models refuse a temperature.
            self.temperature[model] = False
        elif code == 400 and REQUEST_REFUSED.search(body):
            self.rest(model, 60, 60)
        elif code in (400, 401, 404, 422) or ((code or stream) and DEAD.search(body)):
            # Unconfigured or unknown: back in half an hour, then at most every 12 hours. 9router adds
            # "reset after 2m" even to a rejected token, so this comes before the quota case.
            wait = min(12 * 3600, 1800 * 2 ** min(self.fails[model], 5))
            if PROVIDER_DOWN.search(body):
                self.rest_provider(model, wait, 12 * 3600)
            else:
                self.rest(model, wait, 12 * 3600)
        elif code == 402 or re.search(r'\[402\]|credits', body):
            # Credit is the account's, so every model behind it waits.
            self.rest_provider(model, 3600, 6 * 3600)
        elif code in (403, 429) or ((code or 500) >= 500 and QUOTA.search(body)):
            wait = reset_after(body)
            self.rest(model, wait + 2 if wait is not None else 300, 120 if wait is not None else 1800)
        elif code is None and isinstance(e, (TimeoutError, urllib.error.URLError)):
            self.rest(model, 600, 3600)
        else:
            self.rest(model, 60, 900)
        return f'{model} {code or ""} {body[:160]}'

    def pick(self, prefer, avoid):
        """The preferred model when it is ready, else the strongest ready one no other worker is
        calling, so the workers spread over several models rather than trip one rate limit. A
        light model is taken only when no stronger one is ready, busy or not. No provider takes
        more than PER_PROVIDER calls at once, and no model of a family in `avoid` is taken."""
        now = time.time()
        with LOCK:
            load = {}
            for m, n in self.busy.items():
                load[provider(m)] = load.get(provider(m), 0) + n
            ready = [m for m in self.models if self.cool[m] <= now and family(m) not in avoid
                     and load.get(provider(m), 0) < PER_PROVIDER]
            free = [m for m in ready if not self.busy[m]]
            if free and ready and rank(free[0]) > len(RANK) >= rank(ready[0]):
                free = []
            model = prefer if prefer in ready else (free or ready or [None])[0]
            if model:
                self.busy[model] += 1
            return model

    def ask(self, system, user, prefer=None, avoid=()):
        """(model, parsed JSON, seconds) from `prefer` when it is ready, else the strongest ready
        model whose family is not in `avoid`. A reply cut at the token limit or without JSON rests
        that model and the call moves on. Waits up to 16 hours for a model, because a daily quota
        reopens at midnight Pacific."""
        text = system + '\n\n' + user
        avoid = {family(m) for m in avoid}
        last, deadline = None, time.time() + 16 * 3600
        while time.time() < deadline:
            model = self.pick(prefer, avoid)
            if not model:
                time.sleep(20)
                continue
            t, out = time.time(), ''
            try:
                out, finish, served = self.post(model, text)
                if served and CLAUDE.search(served):
                    # A router that falls back behind a name answered with Claude.
                    self.rest(model, 12 * 3600, 12 * 3600)
                    raise LookupError(f'answered by {served}')
                if finish == 'length':
                    raise ValueError('reply cut at the token limit')
                answer = parse(out)
            except (ValueError, LookupError) as e:
                last = f'{model}: {e}: {out[:80]!r}'
                if isinstance(e, ValueError):
                    self.rest(model, 600)
            except Exception as e:
                last = self.refused(model, e)
            else:
                with LOCK:
                    self.fails[model] = 0
                return model, answer, round(time.time() - t, 1)
            finally:
                with LOCK:
                    self.busy[model] -= 1
            log('rest', last[:200])
        raise RuntimeError(last or 'no model answered')


def parse(text):
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    text = (m.group(1) if m else text).strip()
    return json.loads(text[text.index('{'):text.rindex('}') + 1])


# ---------------------------------------------------------------- checks

TONE_MARKS = {'\u0300', '\u0301', '\u0304', '\u030c'}
INITIALS = ['zh', 'ch', 'sh', *'bpmfdtnlgkhjqxrzcsyw']
FINALS = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er', 'i', 'ia', 'ie', 'iao',
          'iu', 'ian', 'in', 'iang', 'ing', 'iong', 'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ue',
          'ü', 'üe', 'üan', 'ün', 'v', 've', 'van', 'vn']
SYLLABLES = {i + f for i in INITIALS for f in FINALS} | {'a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en',
                                                          'ang', 'eng', 'er'}


def han_count(text):
    return sum(1 for c in text or '' if '\u4e00' <= c <= '\u9fff')


def split_syllables(word):
    """Every way to cut one pinyin word into syllables; tone marks are ignored for the cut."""
    bare = ''.join(c for c in unicodedata.normalize('NFD', word.lower()) if c not in TONE_MARKS)
    bare = unicodedata.normalize('NFC', bare)
    if len(bare) != len(word):
        return []
    out = []

    def walk(i, parts):
        if i == len(bare):
            out.append([word[a:b] for a, b in parts])
            return
        if i and bare[i] in 'aoe':
            return  # a syllable starting with a, o or e inside a word needs an apostrophe
        for j in range(i + 1, min(i + 6, len(bare)) + 1):
            if bare[i:j] in SYLLABLES:
                walk(j, parts + [(i, j)])
    walk(0, [])
    return out


def sentence_syllables(reading, n):
    """The one cut of a sentence's pinyin into n (syllable, word number) pairs, or None when there is
    none or several."""
    words = re.findall(r"[^\W\d_]+", reading.replace("'", ' '))
    options = [[[(x, k) for x in cut] for cut in split_syllables(w)] for k, w in enumerate(words)]
    found = set()

    def walk(k, acc):
        if len(acc) > n or len(found) > 1:
            return
        if k == len(words):
            if len(acc) == n:
                found.add(tuple(acc))
            return
        for cut in options[k]:
            walk(k + 1, acc + cut)
    walk(0, [])
    return list(found.pop()) if len(found) == 1 else None


def is_sentence_reading(text, reading):
    """True when the pinyin carries sentence punctuation or more words than the text has characters;
    an ellipsis and a Latin letter (T恤: "T xù") are not a sentence."""
    bare = re.sub(r'\.\.\.|…', ' ', reading)
    units = han_count(text) + sum(1 for c in text or '' if c.isascii() and c.isalpha())
    words = [w for w in bare.split() if any(c.isalpha() for c in w)]
    return bool(re.search(r'[.?!,;:。，？！]', bare)) or len(words) > units


def collocation_readings(text, example, reading, example_reading):
    """(reading of the collocation, reading of its example). A model that put the example's pinyin in
    `reading` gets it moved, and the collocation's own syllables are cut out of it when the example
    contains the collocation and its pinyin aligns one syllable per character."""
    if not reading or not is_sentence_reading(text, reading):
        return reading, example_reading
    example_reading = example_reading or reading
    han = [c for c in example or '' if '\u4e00' <= c <= '\u9fff']
    at = ''.join(han).find(text)
    if at >= 0:
        spots = list(range(at, at + len(text)))
    else:  # 学习知识 in 我们要学习新知识: the characters in order, not side by side
        spots, i = [], 0
        for c in text:
            i = next((j for j in range(i, len(han)) if han[j] == c), -1)
            if i < 0:
                return None, example_reading
            spots.append(i)
            i += 1
    cut = sentence_syllables(example_reading, len(han))
    if not cut:
        return None, example_reading
    out = ''
    for n, spot in enumerate(spots):
        syllable, word = cut[spot]
        joined = n and spot == spots[n - 1] + 1 and cut[spots[n - 1]][1] == word
        out += (syllable if joined or not n else ' ' + syllable)
    return out, example_reading


def validate(layer, raw, trad):
    """Structural problems; an empty list means the layer can be loaded."""
    ids = {s['id'] for s in raw['senses']}
    ex_ids = {x['id'] for x in raw['examples']}
    lo, hi = core_range(len(ids))
    errs, covered = [], []
    core = layer.get('core_senses') or []
    if not lo <= len(core) <= hi:
        errs.append(f'core_senses has {len(core)} items, expected {lo} to {hi}')
    zh = raw['lang'] == 'zh'

    def chinese(where, text, reading):
        bad = sorted({c for c in text or '' if c in trad})
        if bad:
            errs.append(f'{where}: traditional characters {"".join(bad)}')
        if not reading:
            errs.append(f'{where}: no pinyin')

    pos_of = {s['id']: s.get('pos') for s in raw['senses']}
    for i, c in enumerate(core):
        if not c.get('source_sense_ids'):
            errs.append(f'core {i}: no source sense')
        kinds = {pos_of.get(sid) for sid in c.get('source_sense_ids') or []} - {None}
        if len(kinds) > 1:
            errs.append(f'core {i}: merges raw senses of different parts of speech {sorted(kinds)}')
        for lang_, terms in (c.get('equivalents') or {}).items():
            for t in terms if lang_ == 'zh' and isinstance(terms, list) else []:
                if isinstance(t, str) and (re.search(r'[()（）]', t) or (len(t) >= 3 and t.endswith('的'))):
                    errs.append(f'core {i}: Chinese equivalent {t!r} is not a headword; drop the 的 or the brackets')
        for sid in c.get('source_sense_ids') or []:
            if sid not in ids:
                errs.append(f'core {i}: unknown sense id {sid}')
            covered.append(sid)
        if c.get('domain') not in (None, *DOMAINS):
            errs.append(f'core {i}: domain {c.get("domain")}')
        if c.get('register') not in (None, *REGISTERS):
            errs.append(f'core {i}: register {c.get("register")}')
        if c.get('cefr') not in CEFR:
            errs.append(f'core {i}: cefr {c.get("cefr")}')
        if not 1 <= len(c.get('vi_terms') or []) <= 6:
            errs.append(f'core {i}: {len(c.get("vi_terms") or [])} vi_terms')
        if not c.get('vi_definition') or len(c['vi_definition']) > 200:
            errs.append(f'core {i}: vi_definition missing or over 200 characters')
        for j, x in enumerate(c.get('examples') or []):
            if x.get('source_example_id') not in (None, *ex_ids):
                errs.append(f'core {i}: unknown example id {x.get("source_example_id")}')
            if not x.get('vi') or not x.get('text'):
                errs.append(f'core {i}: example {j} without text or vi')
            if zh:
                chinese(f'core {i} example {j}', x.get('text'), x.get('reading'))
        for j, k in enumerate(c.get('collocations') or []):
            if not k.get('text') or not k.get('vi'):
                errs.append(f'core {i}: collocation {j} without text or vi')
            # Each collocation text becomes a headword, so "take a shower/bath" became a page title.
            if re.search(r'[/()+]|\.\.\.|…', k.get('text') or ''):
                errs.append(f'core {i} collocation {j}: {k.get("text")!r} is not one combination in dictionary form')
            if zh and k.get('example') and not k.get('example_reading'):
                errs.append(f'core {i} collocation {j}: no example_reading')
            if zh:
                chinese(f'core {i} collocation {j}', (k.get('text') or '') + (k.get('example') or ''), k.get('reading'))
                if k.get('reading') and k.get('example_reading') and is_sentence_reading(k.get('text'), k['reading']):
                    errs.append(f'core {i} collocation {j}: reading is a sentence, give the pinyin of the collocation')
    for o in layer.get('other_senses') or []:
        if o.get('source_sense_id') not in ids:
            errs.append(f'other: unknown sense id {o.get("source_sense_id")}')
        covered.append(o.get('source_sense_id'))
    for f in layer.get('gloss_fixes') or []:
        if f.get('source_sense_id') not in ids:
            errs.append(f'gloss_fix: unknown sense id {f.get("source_sense_id")}')
        if f.get('certain') not in (None, True, False):
            errs.append(f'gloss_fix {f.get("source_sense_id")}: certain is {f.get("certain")!r}, not true or false')
    missing = ids - set(covered)
    if missing:
        errs.append(f'{len(missing)} raw senses not covered: {sorted(missing)[:5]}')
    dup = len(covered) - len(set(covered))
    if dup:
        errs.append(f'{dup} raw senses covered twice')
    return errs


# ---------------------------------------------------------------- steps

def write_user(raw):
    lo, hi = core_range(len(raw['senses']))
    return (f'Entry language: {LANG_NAME[raw["lang"]]}. This entry has {len(raw["senses"])} raw senses, so give '
            f'{lo} to {hi} core senses.\nRaw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\n'
            f'Return JSON of this shape:\n{json.dumps(SCHEMA_HINT, ensure_ascii=False)}')


def build(entry_id, trad, pool):
    """Write, check, review and correct one entry. The reviewer is never the writer, and the
    corrections go back to the writer when it is ready. Returns the cache record."""
    raw = raw_entry(entry_id)
    writer, layer, secs = pool.ask(SYSTEM, write_user(raw))
    rec = {'raw': raw, 'report': {'id': entry_id, 'writer': writer, 'seconds_write': secs}}
    errs = validate(layer, raw, trad)
    if errs:
        # One retry with the problems spelled out; the model usually fixes all of them.
        writer, layer, secs = pool.ask(SYSTEM, write_user(raw) + '\n\nYour previous answer had these problems; '
                                       f'return the whole corrected layer:\n{json.dumps(errs)}\n\nPrevious answer:\n'
                                       + json.dumps(layer, ensure_ascii=False), prefer=writer)
        errs = validate(layer, raw, trad)
        rec['report'].update(writer=writer, seconds_retry=secs)
    if errs:
        rec['report']['errors'] = errs
        return rec
    reviewer, review, secs = pool.ask(REVIEW, f'Raw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\n'
                                              f'Learner layer:\n{json.dumps(layer, ensure_ascii=False)}', avoid={writer})
    rec['report']['reviewer'] = reviewer
    issues = [i for i in review.get('issues') or [] if isinstance(i, dict)]
    rec['report']['seconds_review'] = secs
    rec['issues'] = issues
    if issues:
        lo, hi = core_range(len(raw['senses']))
        fixer, fixed, secs = pool.ask(FIX, f'Give {lo} to {hi} core senses.\nRaw entry:\n{json.dumps(raw, ensure_ascii=False)}'
                                           f'\n\nYour layer:\n{json.dumps(layer, ensure_ascii=False)}\n\nReviewer issues:\n'
                                           f'{json.dumps(issues, ensure_ascii=False)}', prefer=writer, avoid={reviewer})
        rec['report'].update(fixer=fixer, seconds_fix=secs)
        fix_errs = validate(fixed, raw, trad)
        if fix_errs:
            # The review was not applied, so no gloss a dictionary wrote is replaced on its word.
            rec['report']['fix_errors'] = fix_errs
            for f in layer.get('gloss_fixes') or []:
                f['certain'] = False
        else:
            layer = fixed
            rec['report']['model'] = fixer
    rec['layer'] = layer
    rec['report']['errors'] = []
    return rec


def gloss(text):
    """A proposal as lex.gloss_terms reads it: it drops everything from the first "(" and
    splits only on commas, so a leading "(lóng)" would leave no term and "lấy/nhận" one."""
    text = re.sub(r'^\s*\([^)]*\)\s*', '', text.strip())
    return re.sub(r'\s*[;/]\s*', ', ', text).rstrip('.').strip()


def domain_label(v):
    """A minor sense's field outside the list becomes 'other' rather than failing the entry."""
    return None if not v else v if v in DOMAINS else 'other'


def register_label(v):
    return next((r for r in re.split(r'[/,; ]+', v or '') if r in REGISTERS), None)


def as_text(v):
    return v if v is None or isinstance(v, str) else json.dumps(v, ensure_ascii=False)


def review_items(items, keys):
    """Model-written review items, reduced to objects whose listed fields are text or null."""
    return [{k: as_text(i.get(k)) for k in keys} for i in items or [] if isinstance(i, dict)]


def payload(rec, version):
    """The shape lex.learner_load reads."""
    raw, layer, lang = rec['raw'], rec['layer'], rec['raw']['lang']
    raw_senses = {s['id']: s for s in raw['senses']}
    raw_text = {x['id']: x['text'] for x in raw['examples']}
    fixes = {f['source_sense_id']: f for f in layer.get('gloss_fixes') or [] if f.get('proposed_vi')}
    senses, labels = [], []

    def label(sid, order, terms, domain, register, inflection=False, lemma=None):
        s = raw_senses.get(sid)
        if not s:
            return
        # gloss_vi is a list of equivalents that lex.gloss_terms splits on commas, so a
        # proposal written as a definition falls back to the sense's own terms.
        joined = gloss(', '.join(terms or []))
        fix_vi, reason, certain = None, None, False
        if sid in fixes:
            proposed = gloss(fixes[sid]['proposed_vi'])
            fix_vi = proposed if 0 < len(proposed) <= 60 else joined if 0 < len(joined) <= 60 else None
            reason = fixes[sid].get('reason') if fix_vi else None
            certain = bool(fix_vi) and fix_vi == proposed and fixes[sid].get('certain') is True
        elif not s.get('gloss_vi') and terms and not inflection and len(joined) <= 60:
            fix_vi, reason = joined, 'empty'
        labels.append({'sense_id': sid, 'core_sense_order': order, 'vi_terms': terms or None, 'domain': domain,
                       'register': register, 'is_inflection': bool(inflection), 'lemma': lemma,
                       'fix_vi': fix_vi, 'fix_reason': reason, 'fix_certain': certain})

    for n, c in enumerate(layer['core_senses'], 1):
        links = []
        for k in c.get('collocations') or []:
            # A model has written pinyin for English collocations ("bank account yínháng zhànghù").
            reading, example_reading = collocation_readings(k['text'], k.get('example'), k.get('reading'),
                                                            k.get('example_reading')) if lang == 'zh' else (None, None)
            links.append({'kind': 'collocation', 'text': k['text'], 'pattern': k.get('pattern'), 'vi': k.get('vi'),
                          'example': k.get('example'), 'example_vi': k.get('example_vi'), 'reading': reading,
                          'example_reading': example_reading})
        for kind in ('synonyms', 'antonyms'):
            for k in c.get(kind) or []:
                if k.get('text'):
                    links.append({'kind': kind[:-1], 'text': k['text'], 'note_vi': k.get('note_vi')})
        for other, terms in (c.get('equivalents') or {}).items():
            if other in LANG_NAME and other != lang:
                links += [{'kind': 'equivalent', 'text': t, 'lang': other} for t in terms or [] if isinstance(t, str)]
        examples = []
        for x in c.get('examples') or []:
            src = raw_text.get(x.get('source_example_id'))
            examples.append({'text': x['text'], 'reading': x.get('reading') if lang == 'zh' else None, 'vi': x['vi'],
                             'from_source': bool(src) and src.strip() == x['text'].strip()})
        senses.append({'pos': c.get('pos'), 'vi_terms': c['vi_terms'], 'vi_definition': c['vi_definition'],
                       'en_definition': c.get('en_definition'), 'domain': c.get('domain'),
                       'register': c.get('register'), 'cefr': c.get('cefr'),
                       'source_sense_ids': c['source_sense_ids'], 'examples': examples, 'links': links})
        for sid in c['source_sense_ids']:
            label(sid, n, c['vi_terms'], c.get('domain'), c.get('register'))
    for o in layer.get('other_senses') or []:
        label(o['source_sense_id'], None, o.get('vi_terms'), domain_label(o.get('domain')), register_label(o.get('register')),
              o.get('is_inflection'), o.get('lemma'))
    level = layer.get('level')
    report = rec['report']
    return {'entry_id': raw['id'], 'model': report.get('model') or report.get('writer'),
            'reviewer': report.get('reviewer'), 'prompt_version': version,
            'gist_vi': [g for g in layer.get('gist_vi') or [] if isinstance(g, str)][:3],
            'level': level if level in CEFR else None, 'usage_note_vi': layer.get('usage_note_vi'),
            'review': {'issues': review_items(rec.get('issues'), ('path', 'problem', 'fix', 'severity')),
                       'rejected': review_items(layer.get('rejected'), ('path', 'reason')),
                       'seconds': {k: v for k, v in report.items() if k.startswith('seconds')}},
            'senses': senses,
            'links': [{'kind': 'confusable', 'text': k['text'], 'note_vi': k.get('note_vi')}
                      for k in layer.get('confusables') or [] if k.get('text')],
            'labels': labels}


def load(rec, version):
    return rest('rpc/learner_load', {'p': payload(rec, version)})


def cache_path(entry_id):
    lang, _, head = entry_id.partition(':')
    d = os.path.join(CACHE_DIR, PROMPT_VERSION)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f'{lang}_{head.replace("/", "_")}.json')


def revalidate():
    site, secret = os.environ.get('SITE_URL'), os.environ.get('REVALIDATE_SECRET')
    if not site or not secret:
        return
    try:
        req = urllib.request.Request(site.rstrip('/') + '/api/revalidate', b'', {'x-revalidate-secret': secret})
        with urllib.request.urlopen(req, timeout=30) as r:
            log('revalidate', r.status)
    except Exception as e:
        log('revalidate failed', type(e).__name__, str(e)[:120])


# ---------------------------------------------------------------- commands

def cmd_run(a):
    trad = traditional_only()
    ids = a.entries.split(',') if a.entries else queue(a.lang.split(','), a.top)
    if a.limit:
        ids = ids[:a.limit]
    pool = Pool(a.models.split(',') if a.models else None)
    log(f'{len(ids)} entries, {len(pool.models)} models, prompt {PROMPT_VERSION}')
    totals = {'loaded': 0, 'invalid': 0, 'failed': 0}

    def one(entry_id):
        path = cache_path(entry_id)
        try:
            rec = json.load(open(path))
        except (OSError, ValueError):
            rec = None
        if not rec or rec['report'].get('errors'):
            rec = build(entry_id, trad, pool)
            with open(path + '.tmp', 'w') as fh:
                json.dump(rec, fh, ensure_ascii=False, indent=1)
            os.replace(path + '.tmp', path)
        if rec['report'].get('errors'):
            return 'invalid', rec['report']['errors'][:3]
        if a.dry_run:
            return 'loaded', 'dry run'
        result = load(rec, PROMPT_VERSION)
        return 'loaded', result

    # A flush drops every cached dictionary page, so it runs on a clock, not per entry count.
    flushed = time.time()
    with ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(one, i): i for i in ids}
        for n, f in enumerate(as_completed(futs), 1):
            entry_id = futs[f]
            try:
                status, detail = f.result()
            except Exception as e:
                status, detail = 'failed', f'{type(e).__name__}: {str(e)[:200]}'
            totals[status] += 1
            log(f'{n}/{len(ids)}', status, entry_id, json.dumps(detail, ensure_ascii=False)[:200])
            if not a.dry_run and status == 'loaded' and time.time() - flushed > FLUSH_EVERY:
                revalidate()
                flushed = time.time()
    if not a.dry_run:
        revalidate()
    log('finished', json.dumps(totals))


def cmd_load(a):
    trad = traditional_only()
    for path in a.files:
        rec = json.load(open(path))
        errs = rec['report'].get('errors') or ([] if 'layer' in rec else ['no layer'])
        errs = errs or validate(rec['layer'], rec['raw'], trad)
        if errs:
            log('skip', path, json.dumps(errs, ensure_ascii=False)[:200])
            continue
        log('load', rec['raw']['id'], json.dumps(load(rec, a.version), ensure_ascii=False))
    revalidate()


def cmd_reapply(a):
    ids = [r['entry_id'] for r in rest_all('learner_entries?select=entry_id&order=entry_id')]
    n = sum(rest('rpc/learner_apply_fixes', {'p_entry_id': i}) or 0 for i in ids)
    log(f'{n} glosses rewritten over {len(ids)} entries')
    revalidate()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('--lang', default='en,es,zh')
    r.add_argument('--top', type=int, default=3000)
    r.add_argument('--entries', default='')
    r.add_argument('--limit', type=int, default=0)
    r.add_argument('--workers', type=int, default=12)
    r.add_argument('--models', default='', help='only these models, instead of every usable one')
    r.add_argument('--dry-run', action='store_true')
    ld = sub.add_parser('load')
    ld.add_argument('files', nargs='+')
    ld.add_argument('--version', default='pilot-v1')
    sub.add_parser('reapply')
    a = ap.parse_args()
    {'run': cmd_run, 'load': cmd_load, 'reapply': cmd_reapply}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
