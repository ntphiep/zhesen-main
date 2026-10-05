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
env: AI_BASE_URL, OMNI_BASE_URL, and BATCH_AI_API_KEY and BATCH_OMNI_API_KEY (the routers' `zhesen-batch`
     keys from /opt/zhesen/batch.env; the site's AI_API_KEY and OMNI_API_KEY are never read),
     SUPABASE_URL (the site's /rest/v1 host), SUPABASE_SERVICE_ROLE_KEY, SITE_URL and REVALIDATE_SECRET (optional, to flush the site cache after loading)
"""
import argparse, json, os, random, re, sys, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

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


# Phrasal verbs of 40 common verbs: 383 entries, none levelled or ranked, so no queue reached them.
PHRASAL = (r'^(take|get|go|put|come|look|give|make|turn|set|run|bring|break|keep|pick|cut|fall|hold|carry|work|find|'
           r'call|check|fill|figure|show|sit|stand|throw|wake|grow|hang|let|pass|pay|pull|shut|sort|switch|try) '
           r'(up|down|in|out|on|off|over|away|back|through|around|about|along|after|for|into|by)$')


def queue(langs, top, skip_forms=False):
    """Entries ranked within `top`, interleaved by rank so all three languages fill in from their most
    common words, then English phrasal verbs at their base verb's rank. `skip_forms` leaves out
    inflected forms; it waits for the form_of fix, because form_of now also marks para and pero."""
    forms = '&form_of=is.null' if skip_forms else ''
    entries = []
    for lang in langs:
        entries += rest_all(f'entries?lang=eq.{lang}&frequency_rank=lte.{top}{forms}&select=id,frequency_rank'
                            f'&order=frequency_rank,id')
    if 'en' in langs:
        rank_of = {e['id']: e['frequency_rank'] for e in entries}
        for e in rest_all(f'entries?lang=eq.en&entry_type=in.(phrase,idiom,word)&headword=match.{q(PHRASAL)}'
                          f'&select=id,headword,frequency_rank&order=id'):
            base = rank_of.get('en:' + e['headword'].split(' ')[0])
            if e['id'] not in rank_of and (base or e['frequency_rank']):
                entries.append({'id': e['id'], 'frequency_rank': min(r for r in (base, e['frequency_rank']) if r)})
    done = {r['entry_id'] for r in rest_all(f'learner_entries?prompt_version=in.({",".join(DONE_VERSIONS)})'
                                            '&select=entry_id&order=entry_id')}
    entries.sort(key=lambda e: (e['frequency_rank'], e['id']))
    return [e['id'] for e in entries if e['id'] not in done]


def redo_queue(kind):
    """Loaded layers to redo: `claude`, written or reviewed by Claude, are written again from the raw
    entry; `same-family`, reviewed inside the writer's model family, and `dependent`, reviewed by a
    model that is not independent of the writer, are reviewed again. {entry id: learner_entries row}."""
    rows = rest_all('learner_entries?select=entry_id,model,reviewer,prompt_version&order=entry_id')
    if kind == 'claude':
        keep = lambda r: CLAUDE.search(r['model'] or '') or CLAUDE.search(r['reviewer'] or '')
    elif kind == 'same-family':
        keep = lambda r: r['reviewer'] and family(r['model']) == family(r['reviewer'])
    else:
        keep = lambda r: r['reviewer'] and not independent(r['reviewer'], r['model'])
    return {r['entry_id']: r for r in rows if keep(r)}


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
    r'gemini-3(\.\d)?-flash|gemma-?4-31b|nemotron-3-super|gpt-oss-120b|deepseek|qwen3|dots|ling|space-bunny',
)]
LIGHT = re.compile(r'(^|[-/_.])(lite|mini|nano|lightning|code)([-/_.:]|$)|(^|/)free$')
# A refusal that names a quota or an unconfigured provider; 9router wraps both in a 503.
QUOTA = re.compile(r'\[40[23]\]|\[429\]|quota|exhausted|credits|rate.?limit|high demand|reset after', re.I)
# Refusals no wait cures, so the whole provider breaks for 12 hours and one call then probes it.
# gemini-cli answered "[403]: HTTP 403 (reset after 1s)" 8,875 times in a day and never once
# answered; one of its bodies said "You do not have a valid license". Bedrock's "Invalid API Key
# format" came 2,010 times.
PERMANENT = re.compile(r'invalid api key|api key not valid|valid license', re.I)
BREAK_SECONDS = 12 * 3600
SHORT_RESET, SHORT_403_TRIPS = 60, 3
# Credit spent, which rests the provider. OpenRouter's free-model 429 says "Add 10 credits to
# unlock" and is not one: matching any "credits" rested the provider that answered most.
NO_CREDIT = re.compile(r'\[402\]|insufficient credits|credits exhausted', re.I)
# A quota that names the account rests every model behind it: omni:agy refused 2,659 calls in a
# day, nearly all "All antigravity accounts have exhausted their quota".
ACCOUNT_QUOTA = re.compile(r'all \S+ accounts', re.I)
# The Gemini API key on 9router is free tier, whose daily quota per model is small: gemini-3.8,
# 3.7 and 3.6-flash answered "exceeded your current quota" after 28, 20 and 43 calls on
# 2026-10-05. Such a model rests until the quota reopens at 07:00 UTC.
DAILY_QUOTA = re.compile(r'exceeded your current quota', re.I)
QUOTA_RESET_UTC = 7
DEAD = re.compile(r'\[40[014]\]|no active credentials|not found|not supported|not configured|not installed|ENOENT|'
                  r'invalid token|token included in the request is invalid|authorization failed|egress IP|\[52[0-9]\]|'
                  r'must be an absolute path|Playwright is not', re.I)
# A refusal about the provider account rather than the model rests every model behind it: one
# rejected Kiro token answered for 15 models, 5 seconds each.
PROVIDER_DOWN = re.compile(r'no active credentials|invalid token|token included|authorization failed|ENOENT|not configured|'
                           r'not installed|egress IP|\[52[0-9]\]|CLI not found|must be an absolute path|Playwright is not', re.I)
# A 400 about this request, not the model: a long prompt, or a reply a safety filter stopped.
REQUEST_REFUSED = re.compile(r'context|too long|too many tokens|maximum|safety|blocked|content', re.I)
# A layer for a word with many senses runs past 16,000 tokens: en:on was cut there.
MAX_TOKENS = 32000
PER_PROVIDER = 4
# The site's assistant asks the `zhesen` combo on 9router, then the one on OmniRoute, so the
# batch leaves their members' quota to readers. The one DeepSeek web login backs the OmniRoute
# combo and revokes its token past about 6 calls at once, so the batch never calls it.
PROVIDER_LIMIT = {'omni:ds-web': 0}
# The members of both combos on 2026-10-05 14:52 UTC.
RESERVED = {'gemini/gemini-3.8-flash', 'gemini/gemini-3.7-flash', 'gemini/gemini-3.6-flash',
            'ag/gemini-3.8-flash', 'ag/gemini-3.8-flash-low', 'ag/gpt-oss-120b-medium',
            'antigravity/gemini-3.8-flash-tiered', 'antigravity/gemini-3.7-flash-medium',
            'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free', 'openrouter/qwen/qwen3.8-27b:free',
            'ds-web/deepseek-v4-pro', 'ds-web/deepseek-v4-flash'}
# OpenRouter counts free-model calls per account, 50 a day here, and the site's fallback spends
# them: 54 answered on 2026-10-05, then "free-models-per-day" from 00:35 UTC. A ":free" id, or its
# OmniRoute variants such as ":free-high", is never the batch's.
FREE_TIER = re.compile(r':free(-|$)')
# A member is reserved under every provider that serves it: omni:agy/gemini-3.7-flash-medium is
# Antigravity's gemini-3.7-flash-medium again.
# Effort variants are the same model: ag/gemini-3.8-flash-high is reserved like ag/gemini-3.8-flash.
EFFORT = re.compile(r'-(extra-low|high|medium|low|tiered)$')


def base_name(name):
    return EFFORT.sub('', name.rsplit('/', 1)[-1])


RESERVED_NAMES = {base_name(r) for r in RESERVED}
# Both combos lean on Antigravity, whose quota may be the account's rather than each model's,
# so the batch calls it only from 23:00 to 07:00 in Vietnam, when few readers ask.
NIGHT_ONLY = {'ag', 'omni:antigravity'}
NIGHT_UTC = range(16, 24)


def refuse_claude(names):
    """Raises before any call when a name is Claude's: Claude writes this code and never writes
    or reviews the dictionary (owner, 2026-10-05)."""
    bad = [n for n in names if CLAUDE.search(n)]
    if bad:
        raise SystemExit(f'refusing to call {", ".join(bad[:3])}: Claude never writes product data')


def usable(name):
    if ('/' not in name or base_name(name) in RESERVED_NAMES or CLAUDE.search(name)
            or EXCLUDE.search(name) or FREE_TIER.search(name)):
        return False
    # Parameter counts in the name, skipping the active count of a mixture ("120b-a12b").
    sizes = [float(n) for n in re.findall(r'(?<![a-z])e?(\d+(?:\.\d+)?)b(?![a-z])', name.lower())]
    return not sizes or max(sizes) >= MIN_BILLIONS


def rank(name):
    tier = next((i for i, p in enumerate(RANK) if p.search(name)), len(RANK))
    return tier + (len(RANK) + 1 if LIGHT.search(name) else 0)


def provider(name):
    # OmniRoute lists the one DeepSeek web login under two names, and Antigravity under two.
    p = name.split('/')[0].replace('deepseek-web', 'ds-web')
    return 'omni:antigravity' if p == 'omni:agy' else p


def family(name):
    """The model behind a name, whichever router and provider serve it: ag/gemini-3-pro-low and
    gc/gemini-3-pro-preview are one model, so one of them never reviews the other, and neither do
    gemini-3.7-flash-low and gemini-3.7-flash-tiered (en:8) or gemini/gemma-4-31b-it and
    omni:ddgw/tinfoil/gemma4-31b."""
    base = name.rsplit('/', 1)[-1].lower()
    base = re.sub(r'(:free|-(low|medium|high|xhigh|max|extra-low|preview|thinking|agentic|agent|tiered|it|instruct'
                  r'|\d{4}))+$', '', base)
    return re.sub(r'[-_.]', '', base)


VENDORS = [(re.compile(p), v) for p, v in (
    (r'gemini|gemma', 'google'), (r'^gpt|^o\d', 'openai'), (r'deepseek', 'deepseek'), (r'qwen|qwq', 'alibaba'),
    (r'nemotron', 'nvidia'), (r'llama', 'meta'), (r'mistral|mixtral|stral', 'mistral'), (r'kimi|moonshot', 'moonshot'),
    (r'glm', 'zhipu'), (r'grok', 'xai'), (r'mimo', 'xiaomi'), (r'minimax', 'minimax'), (r'ernie', 'baidu'),
    (r'hunyuan', 'tencent'), (r'doubao|^seed', 'bytedance'), (r'^step\d', 'stepfun'), (r'^(ling|ring)', 'inclusionai'),
    (r'^dots', 'rednote'), (r'^phi\d', 'microsoft'), (r'^command|^aya', 'cohere'), (r'^nova', 'amazon'),
)]


def vendor(name):
    """Who trained the model, read from its family, or the family itself when the name does not say
    (stealth/space-bunny-alpha): a reviewer from the writer's vendor shares its blind spots."""
    f = family(name)
    return next((v for p, v in VENDORS if p.search(f)), f)


def independent(reviewer, writer):
    """True when `reviewer` may judge `writer`'s work: another family and vendor, ranked at least
    as strong. 2,990 of 6,024 layers were reviewed by a lite, mini, nano or gemma model."""
    return (not {family(reviewer), vendor(reviewer)} & {family(writer), vendor(writer)}
            and rank(reviewer) <= rank(writer))


def reset_after(body):
    """Seconds until the provider's quota window reopens, from the router's error text
    ("[antigravity/gemini-3.8-flash] [403]: HTTP 403 (reset after 2m)"), or None."""
    m = re.search(r'reset after (?:(\d+)m ?)?(\d+)s', body)
    if m:
        return int(m.group(1) or 0) * 60 + int(m.group(2))
    m = re.search(r'reset after (\d+)\s*(m|h)', body)
    return int(m.group(1)) * {'m': 60, 'h': 3600}[m.group(2)] if m else None


def until_quota_reset(now=None):
    now = now or datetime.now(timezone.utc)
    reset = now.replace(hour=QUOTA_RESET_UTC, minute=0, second=0, microsecond=0)
    return ((reset if reset > now else reset + timedelta(days=1)) - now).total_seconds()


def cooldown(wait, cap, fails, rnd=random):
    """Seconds a refused model rests: full jitter over the capped exponential backoff
    (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), never shorter than
    the wait the refusal states, which itself spreads by up to a tenth so twelve workers do not
    wake together."""
    return max(wait * rnd.uniform(1, 1.1), rnd.uniform(0, min(cap, 15 * 2 ** fails)))


class Pool:
    """Every usable model on 9router and OmniRoute, strongest first, each resting on its own after
    a refusal. There is no up-front probe: one over all 1,137 took 3 minutes, and of the 17 models
    that answered it only 3 answered the next one, so a probe says little about the next call."""

    def __init__(self, only=None):
        # Each router has a `zhesen-batch` key apart from the site's, so a batch never spends what
        # the site's key is allowed.
        if not os.environ.get('BATCH_AI_API_KEY'):
            raise SystemExit('BATCH_AI_API_KEY is not set: source /opt/zhesen/batch.env')
        self.routers = {'': (os.environ['AI_BASE_URL'], os.environ['BATCH_AI_API_KEY'])}
        if os.environ.get('BATCH_OMNI_API_KEY'):
            self.routers['omni:'] = (os.environ.get('OMNI_BASE_URL', 'http://127.0.0.1:20130/v1'),
                                     os.environ['BATCH_OMNI_API_KEY'])
        refuse_claude(only or [])
        self.models = [m for m in only or self.discover() if usable(m.removeprefix('omni:'))]
        refuse_claude(self.models)
        self.cool = dict.fromkeys(self.models, 0.0)
        self.fails = dict.fromkeys(self.models, 0)
        self.cap = dict.fromkeys(self.models, MAX_TOKENS)
        self.temperature = dict.fromkeys(self.models, True)
        self.busy = dict.fromkeys(self.models, 0)
        self.tier = {m: rank(m) for m in self.models}
        self.kin = {m: {family(m), vendor(m)} for m in self.models}
        # Answered or not, per call, and when last answered: pick() orders by these first.
        self.hist = {m: deque(maxlen=20) for m in self.models}
        self.ok_at = dict.fromkeys(self.models, 0.0)
        # 403s in a row per provider since its last answer.
        self.forbidden = {}

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
        refuse_claude([model])
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
            self.cool[model] = time.time() + cooldown(wait, cap, self.fails[model])

    def rest_provider(self, model, wait, cap):
        for m in [m for m in self.models if provider(m) == provider(model)]:
            self.rest(m, wait, cap)

    def record(self, model, answered):
        with LOCK:
            self.hist[model].append(answered)
            if answered:
                self.ok_at[model] = time.time()
                self.fails[model] = 0
                self.forbidden[provider(model)] = 0

    def broken(self, model, code, body):
        """True when the refusal opens the provider's circuit: a key or licence no wait cures, or a
        third 403 in a row with a reset under a minute, which gemini-cli sends for a missing licence."""
        if PERMANENT.search(body):
            return True
        if code != 403 and '[403]' not in body:
            return False
        p, wait = provider(model), reset_after(body)
        with LOCK:
            self.forbidden[p] = self.forbidden.get(p, 0) + 1
            return self.forbidden[p] >= SHORT_403_TRIPS and wait is not None and wait < SHORT_RESET

    def refused(self, model, e):
        """Rests the model, or its whole provider, by what the refusal says. An error sent inside
        the stream carries the same text as an HTTP one and is read the same way."""
        if isinstance(e, urllib.error.HTTPError):
            code, body = e.code, e.read()[:400].decode('utf-8', 'replace')
            e.close()
        else:
            code, body = None, f'{type(e).__name__} {e}'
        stream = isinstance(e, RuntimeError)
        if self.broken(model, code, body):
            self.rest_provider(model, BREAK_SECONDS, BREAK_SECONDS)
        elif (code == 402 or '[402]' in body) and self.cap[model] > 4000 and re.search(r'max_tokens|afford', body):
            # OpenRouter refuses a max_tokens the remaining credit cannot cover.
            self.cap[model] //= 2
        elif code == 400 and 'temperature' in body and self.temperature[model]:
            # Reasoning models refuse a temperature.
            self.temperature[model] = False
        elif code == 400 and self.cap[model] > 4000 and re.search(r'max_tokens|max_output|maximum', body):
            self.cap[model] //= 2
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
        elif code == 402 or NO_CREDIT.search(body):
            # Credit is the account's and does not come back within the day, so every model behind
            # it waits 6 hours: two OpenRouter models were asked 305 times a day after a 402.
            self.rest_provider(model, 6 * 3600, 6 * 3600)
        elif DAILY_QUOTA.search(body) and 'PerMinute' not in body:
            wait = until_quota_reset()
            self.rest(model, wait, wait)
        elif ACCOUNT_QUOTA.search(body):
            wait = reset_after(body)
            self.rest_provider(model, wait + 2 if wait is not None else 900, 6 * 3600)
        elif code in (403, 429) or ((code or 500) >= 500 and QUOTA.search(body)):
            wait = reset_after(body)
            self.rest(model, wait + 2 if wait is not None else 300, 120 if wait is not None else 1800)
        elif code is None and isinstance(e, (TimeoutError, urllib.error.URLError)):
            self.rest(model, 600, 3600)
        else:
            self.rest(model, 60, 900)
        return f'{model} {code or ""} {body[:160]}'

    def standing(self, model, now):
        """0 when the model answered in the last hour, 2 when none of its last 20 calls was
        answered, else 1. The tier-0 names belong to gemini-cli, which refused every call of a
        day, so ordering by name alone walked the dead models whenever the working ones were busy."""
        if now - self.ok_at[model] < 3600:
            return 0
        h = self.hist[model]
        return 2 if len(h) == h.maxlen and not any(h) else 1

    def pick(self, prefer, avoid, ceiling=None):
        """The preferred model when it is ready, else the best ready one no other worker is
        calling, so the workers spread over several models rather than trip one rate limit. Best
        is measured success first (`standing`), then name tier. A light model, or one that has not
        answered its last 20 calls, is taken only when no better one is ready, busy or not. No
        provider takes more than its PROVIDER_LIMIT, else PER_PROVIDER, calls at once, no model of a
        family or vendor in `avoid` is taken, and with `ceiling` none ranked weaker than it."""
        now = time.time()
        night = datetime.now(timezone.utc).hour in NIGHT_UTC
        with LOCK:
            load = {}
            for m, n in self.busy.items():
                load[provider(m)] = load.get(provider(m), 0) + n
            ready = sorted((m for m in self.models if self.cool[m] <= now and not self.kin[m] & avoid
                            and (ceiling is None or self.tier[m] <= ceiling)
                            and (night or provider(m) not in NIGHT_ONLY)
                            and load.get(provider(m), 0) < PROVIDER_LIMIT.get(provider(m), PER_PROVIDER)),
                           key=lambda m: (self.standing(m, now), self.tier[m]))
            free = [m for m in ready if not self.busy[m]]
            if free and ready and (self.tier[free[0]] > len(RANK) >= self.tier[ready[0]]
                                   or self.standing(free[0], now) == 2 > self.standing(ready[0], now)):
                free = []
            model = prefer if prefer in ready else (free or ready or [None])[0]
            if model:
                self.busy[model] += 1
            return model

    def ask(self, system, user, prefer=None, avoid=(), bad_limit=0, stronger_than=None, wait=16 * 3600):
        """(model, parsed JSON, seconds) from `prefer` when it is ready, else the best ready
        model of neither a family nor a vendor in `avoid` and, with `stronger_than`, ranked at least
        as strong as that model. A reply cut at the token limit or without JSON rests that model and
        the call moves on; after `bad_limit` such replies, when set, the call gives up. Waits up to
        `wait` seconds for a model, by default 16 hours, because a daily quota reopens at midnight
        Pacific."""
        text = system + '\n\n' + user
        avoid = {k for m in avoid for k in (family(m), vendor(m))}
        ceiling = rank(stronger_than) if stronger_than else None
        last, bad, deadline = None, 0, time.time() + wait
        while time.time() < deadline:
            model = self.pick(prefer, avoid, ceiling)
            if not model:
                time.sleep(random.uniform(5, 20))
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
                self.record(model, False)
                last, bad = f'{model}: {e}: {out[:80]!r}', bad + 1
                if str(e).startswith('reply cut') and self.cap[model] < 64000:
                    with LOCK:
                        self.cap[model] *= 2
                elif isinstance(e, ValueError):
                    self.rest(model, 600)
            except Exception as e:
                self.record(model, False)
                last = self.refused(model, e)
            else:
                self.record(model, True)
                # With the rest lines, the answer rate per provider that the deploy check reads.
                log('answer', model)
                return model, answer, round(time.time() - t, 1)
            finally:
                with LOCK:
                    self.busy[model] -= 1
            log('rest', last[:200])
            if bad_limit and bad >= bad_limit:
                break
        raise RuntimeError(last or 'no model answered')


def parse(text):
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    text = (m.group(1) if m else text).strip()
    # DeepSeek's web replies can carry a raw newline or tab inside a string.
    return json.loads(text[text.index('{'):text.rindex('}') + 1], strict=False)


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


def cefr_label(v, fallback=None):
    """A level as CEFR spells it. A range takes its lower bound ("A2.C1" is A2); the schema's own
    "A1..C2" copied back is no judgement and takes `fallback`. Anything else is returned as given
    and fails the check."""
    found = re.findall(r'[ABC][12]', v.upper()) if isinstance(v, str) else []
    if len(found) > 1 and (found[0], found[-1]) == ('A1', 'C2'):
        return fallback if fallback in CEFR else v
    return found[0] if found else v


def normalise(layer, raw):
    """Values a loader can repair in place rather than throw the layer away: 219 cached layers
    failed on "cefr A1.C2" (48), "register neutral" (24), "register null" (22) and the like."""
    level = cefr_label(layer.get('level'), raw.get('level'))
    if level in CEFR:
        layer['level'] = level
    for c in layer.get('core_senses') or []:
        if not isinstance(c, dict):
            continue
        c['cefr'] = cefr_label(c.get('cefr'), layer.get('level') if layer.get('level') in CEFR else raw.get('level'))
        c['domain'] = domain_label(c.get('domain'))
        c['register'] = register_label(c.get('register'))
        eq = c.get('equivalents')
        if isinstance(eq, dict) and isinstance(eq.get('zh'), list):
            eq['zh'] = [t[:-1] if isinstance(t, str) and len(t) >= 3 and t.endswith('的') else t for t in eq['zh']]
    return layer


MAX_EXAMPLE_WORDS = 25
CJK_PUNCT = re.compile(r'[「」『』【】《》〈〉，。：；！？、（）]')
# Words a Vietnamese reader takes as obscene; zh:日 printed two of them in an A1 usage note.
VULGAR_VI = re.compile(r'(?<!\w)(địt|đụ|đéo|lồn|buồi|cặc|đĩ)(?!\w)', re.I)


def mentions(text, head, forms, lang):
    """True when an example contains the headword, its stem (all but its last two letters, at least
    three) or one of its listed forms: "Daniel se dio cuenta de que" illustrated realizar without
    containing it."""
    t = (text or '').lower()
    if lang == 'zh':
        return head in t or any(f in t for f in forms)
    return head.lower()[:max(3, len(head) - 2)] in t or any(f.lower() in t for f in forms)


def content_errors(layer, raw, forms=()):
    """What a bilingual editor rejected in the audit's sample of 45 layers and a script can see."""
    errs = []
    gist = [g for g in layer.get('gist_vi') or [] if isinstance(g, str)]
    if len({g.strip().lower() for g in gist}) < len(gist):
        errs.append('gist_vi repeats a term')
    if any(re.search(r'[()\[\]（）]', g) for g in gist):
        errs.append('gist_vi: a term in brackets; give the bare equivalent')
    vi = gist + [layer.get('usage_note_vi')] + [k.get('note_vi') for k in layer.get('confusables') or []
                                               if isinstance(k, dict)]
    vulgar = []
    for i, c in enumerate(layer.get('core_senses') or []):
        if not isinstance(c, dict):
            continue
        vi += list(c.get('vi_terms') or []) + [c.get('vi_definition')]
        vi += [k.get(f) for k in c.get('collocations') or [] if isinstance(k, dict) for f in ('vi', 'example_vi')]
        vi += [k.get('note_vi') for kind in ('synonyms', 'antonyms') for k in c.get(kind) or [] if isinstance(k, dict)]
        if c.get('register') in ('vulgar', 'offensive'):
            vulgar += c.get('vi_terms') or []
        for j, x in enumerate(c.get('examples') or []):
            if not isinstance(x, dict):
                continue
            vi.append(x.get('vi'))
            text = x.get('text') or ''
            if raw['lang'] != 'zh' and len(text.split()) > MAX_EXAMPLE_WORDS:
                errs.append(f'core {i} example {j}: {len(text.split())} words; give one of at most 20')
            if text and not mentions(text, raw['headword'], forms, raw['lang']):
                errs.append(f'core {i} example {j}: does not contain {raw["headword"]!r} or a form of it')
    for o in layer.get('other_senses') or []:
        if isinstance(o, dict):
            vi += list(o.get('vi_terms') or [])
            if register_label(o.get('register')) in ('vulgar', 'offensive'):
                vulgar += o.get('vi_terms') or []
    vi += [f.get('proposed_vi') for f in layer.get('gloss_fixes') or [] if isinstance(f, dict)]
    if any(isinstance(t, str) and CJK_PUNCT.search(t) for t in vi):
        errs.append('Vietnamese text contains Chinese punctuation such as ， 。 「」; use Vietnamese punctuation')
    note = layer.get('usage_note_vi') if isinstance(layer.get('usage_note_vi'), str) else ''
    if (layer.get('level') == 'A1' or raw.get('level') in ('A1', 'HSK1')) and (
            VULGAR_VI.search(note) or any(isinstance(t, str) and t and t.lower() in note.lower() for t in vulgar)):
        errs.append('usage_note_vi of an A1 word spells out a vulgar sense; leave it to other_senses with register "vulgar"')
    return errs


def validate(layer, raw, trad, forms=()):
    """Structural and content problems; an empty list means the layer can be loaded."""
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
    return errs + content_errors(layer, raw, forms)


# ---------------------------------------------------------------- steps

def write_user(raw):
    lo, hi = core_range(len(raw['senses']))
    return (f'Entry language: {LANG_NAME[raw["lang"]]}. This entry has {len(raw["senses"])} raw senses, so give '
            f'{lo} to {hi} core senses.\nRaw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\n'
            f'Return JSON of this shape:\n{json.dumps(SCHEMA_HINT, ensure_ascii=False)}')


def forms_of(raw):
    """The entry's lemma and the headwords filed as its forms (went for go), which an example may
    contain instead of the headword."""
    lang, head = raw['lang'], raw['headword']
    own = rest(f'entries?id=eq.{q(raw["id"])}&select=form_of') or [{}]
    rows = rest(f'entries?lang=eq.{lang}&form_of=eq.{q(head)}&select=headword&limit=300') or []
    return sorted({r['headword'] for r in rows} | ({own[0]['form_of']} if own[0].get('form_of') else set()))


# A reviewer of another vendor, at least as strong as the writer, may be resting; past this the
# written layer is kept as a draft and only the review is asked again.
REVIEW_WAIT = 3600


def build(entry_id, trad, pool, draft=None, avoid=()):
    """Write, check, review and correct one entry. The reviewer is of another family and vendor
    than the writer and of `avoid`, and ranks at least as strong as the writer; the corrections go
    back to the writer when it is ready. A `draft` record, whose layer passed the checks, skips the
    writing. Returns the cache record."""
    if draft:
        raw, layer, forms = draft['raw'], draft['draft'], draft.get('forms') or forms_of(draft['raw'])
        rec = {'raw': raw, 'forms': forms, 'report': {k: v for k, v in draft['report'].items()
                                                      if k in ('id', 'writer', 'seconds_write', 'seconds_retry')}}
        writer = rec['report']['writer']
    else:
        raw = raw_entry(entry_id)
        forms = forms_of(raw)
        writer, layer, secs = pool.ask(SYSTEM, write_user(raw))
        rec = {'raw': raw, 'forms': forms, 'report': {'id': entry_id, 'writer': writer, 'seconds_write': secs}}
        errs = validate(normalise(layer, raw), raw, trad, forms)
        if errs:
            # One retry with the problems spelled out; the model usually fixes all of them.
            writer, layer, secs = pool.ask(SYSTEM, write_user(raw) + '\n\nYour previous answer had these problems; '
                                           f'return the whole corrected layer:\n{json.dumps(errs)}\n\nPrevious answer:\n'
                                           + json.dumps(layer, ensure_ascii=False), prefer=writer)
            errs = validate(normalise(layer, raw), raw, trad, forms)
            rec['report'].update(writer=writer, seconds_retry=secs)
        if errs:
            rec['report']['errors'] = errs
            return rec
    try:
        reviewer, review, secs = pool.ask(REVIEW, f'Raw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\n'
                                                  f'Learner layer:\n{json.dumps(layer, ensure_ascii=False)}',
                                          avoid={writer, *avoid}, stronger_than=writer, wait=REVIEW_WAIT)
    except RuntimeError as e:
        rec['draft'] = layer
        rec['report']['errors'] = [f'no reviewer of another vendor at least as strong as {writer}: {str(e)[:120]}']
        return rec
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
        fix_errs = validate(normalise(fixed, raw), raw, trad, forms)
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


# What models write for "no label".
NO_LABEL = {'null', 'none', 'neutral', 'general', 'standard', 'common', 'n/a', 'na', '-'}


def domain_label(v):
    """A field outside the list becomes 'other' rather than failing the entry."""
    v = v.strip().lower() if isinstance(v, str) else ''
    if v in NO_LABEL | {''}:
        return None
    return v if v in DOMAINS else 'other'


def register_label(v):
    return next((r for r in re.split(r'[/,; ]+', v.lower() if isinstance(v, str) else '') if r in REGISTERS), None)


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


def cache_path(entry_id, version=PROMPT_VERSION):
    lang, _, head = entry_id.partition(':')
    d = os.path.join(CACHE_DIR, version)
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
    redo = redo_queue(a.redo) if a.redo else {}
    if a.redo and not redo:
        # Falling through to the queue would build what the main learner run is building.
        log(f'redo {a.redo}: nothing left')
        return
    if redo:
        ids = [i for i in (a.entries.split(',') if a.entries else sorted(redo)) if i in redo]
    else:
        ids = a.entries.split(',') if a.entries else queue(a.lang.split(','), a.top, a.skip_forms)
    if a.limit:
        ids = ids[:a.limit]
    pool = Pool(a.models.split(',') if a.models else None)
    log(f'{len(ids)} entries, {len(pool.models)} models, prompt {PROMPT_VERSION}' + (f', redo {a.redo}' if redo else ''))
    totals = {'loaded': 0, 'invalid': 0, 'failed': 0}

    def again(entry_id):
        """A new cache record for a loaded layer that --redo names, keeping the one it replaces. Until
        the new record loads, the old layer stays on the site."""
        row = redo.pop(entry_id)
        try:
            old = json.load(open(cache_path(entry_id, row['prompt_version'])))
        except (OSError, ValueError):
            old = None
        draft = None
        if a.redo != 'claude' and not CLAUDE.search(row['model'] or '') and old and old.get('layer'):
            if not validate(normalise(old['layer'], old['raw']), old['raw'], trad, old.get('forms') or forms_of(old['raw'])):
                draft = {'raw': old['raw'], 'draft': old['layer'], 'forms': old.get('forms'),
                         'report': {'id': entry_id, 'writer': row['model']}}
        rec = build(entry_id, trad, pool, draft=draft, avoid={row['reviewer']} if draft else ())
        if old:
            rec['replaced'] = {'report': old.get('report'), 'layer': old.get('layer'), 'model': row['model'],
                               'reviewer': row['reviewer']}
        return rec

    def one(entry_id):
        path = cache_path(entry_id)
        try:
            rec = json.load(open(path))
        except (OSError, ValueError):
            rec = None
        redone = entry_id in redo
        if redone:
            rec = again(entry_id)
            with open(path + '.tmp', 'w') as fh:
                json.dump(rec, fh, ensure_ascii=False, indent=1)
            os.replace(path + '.tmp', path)
        elif not rec or rec['report'].get('errors'):
            replaced = rec and rec.get('replaced')
            rec = build(entry_id, trad, pool, draft=rec if rec and rec.get('draft') else None)
            if replaced:
                rec['replaced'] = replaced
                redone = bool(a.redo)
            with open(path + '.tmp', 'w') as fh:
                json.dump(rec, fh, ensure_ascii=False, indent=1)
            os.replace(path + '.tmp', path)
        if rec['report'].get('errors'):
            return 'invalid', rec['report']['errors'][:3]
        if a.dry_run:
            return 'loaded', 'dry run'
        # learner_load keeps the status (owner, 2026-10-05). A failed re-review is hidden before it loads,
        # so a failed backup leaves the old row, which the next --redo run selects again. A Claude layer,
        # hidden by hand, is published only once its rewrite has passed a review.
        failed_review = redone and bool(rec['report'].get('fix_errors'))
        if failed_review:
            import gate
            gate.hide([entry_id], f'failed re-review ({a.redo})')
        result = load(rec, PROMPT_VERSION)
        if redone and a.redo == 'claude' and not failed_review:
            import gate
            gate.set_status([entry_id], 'published', 'rewritten and reviewed without Claude')
        return 'loaded', result

    # A flush drops every cached dictionary page, so it runs on a clock, not per entry count.
    flushed = time.time()
    # An entry left invalid is built once more before the run ends: a run of 8,599 entries takes
    # days, and 219 invalid ones otherwise waited for the next run.
    for attempt in range(2):
        invalid = []
        with ThreadPoolExecutor(a.workers) as ex:
            futs = {ex.submit(one, i): i for i in ids}
            for n, f in enumerate(as_completed(futs), 1):
                entry_id = futs[f]
                try:
                    status, detail = f.result()
                except Exception as e:
                    status, detail = 'failed', f'{type(e).__name__}: {str(e)[:200]}'
                totals[status] += 1
                if status == 'invalid':
                    invalid.append(entry_id)
                log(f'{n}/{len(ids)}', status, entry_id, json.dumps(detail, ensure_ascii=False)[:200])
                if not a.dry_run and status == 'loaded' and time.time() - flushed > FLUSH_EVERY:
                    revalidate()
                    flushed = time.time()
        if not invalid:
            break
        if attempt == 0:
            totals['invalid'] -= len(invalid)
            ids = invalid
            log(f'building {len(ids)} invalid entries again')
    if not a.dry_run:
        revalidate()
    log('finished', json.dumps(totals))


def cmd_load(a):
    trad = traditional_only()
    for path in a.files:
        rec = json.load(open(path))
        errs = rec['report'].get('errors') or ([] if 'layer' in rec else ['no layer'])
        errs = errs or validate(normalise(rec['layer'], rec['raw']), rec['raw'], trad, rec.get('forms') or ())
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
    r.add_argument('--redo', choices=('claude', 'same-family', 'dependent'),
                   help='write again the layers Claude touched, or review again the ones reviewed by a related model')
    r.add_argument('--skip-forms', action='store_true',
                   help='leave inflected forms out of the queue; only once form_of no longer marks para or pero')
    ld = sub.add_parser('load')
    ld.add_argument('files', nargs='+')
    ld.add_argument('--version', default='pilot-v1')
    sub.add_parser('reapply')
    a = ap.parse_args()
    {'run': cmd_run, 'load': cmd_load, 'reapply': cmd_reapply}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
