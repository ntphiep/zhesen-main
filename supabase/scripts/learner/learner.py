"""Builds the learner layer of the dictionary (migration 0076) through the 9router router.

Per entry: one model writes the layer from the raw senses and examples, a script checks its
structure, a second model reviews it, the first corrects it, and `lex.learner_load` stores
it. Every step's output is cached under CACHE_DIR, so a rerun resumes where it stopped, and
an entry already loaded at PROMPT_VERSION is skipped.

usage:
  learner.py run [--lang en,es,zh] [--top 3000] [--entries id,id] [--limit N] [--workers N] [--dry-run]
  learner.py load FILE...     load cached layer files, e.g. a pilot run
  learner.py reapply          re-run lex.learner_apply_fixes over every loaded entry
env: AI_BASE_URL, AI_API_KEY, SUPABASE_URL (the site's /rest/v1 host), SUPABASE_SERVICE_ROLE_KEY,
     SITE_URL and REVALIDATE_SECRET (optional, to flush the site cache after loading)
"""
import argparse, json, os, random, re, sys, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from prompts import DOMAINS as DOMAIN_LIST, FIX, LANG_NAME, REGISTERS as REGISTER_LIST, REVIEW, SCHEMA_HINT, SYSTEM, core_range

PROMPT_VERSION = 'v4'
# Writers in order of preference. Antigravity refused Claude with HTTP 403 for every call from
# 11:00 to 17:20 UTC on 2026-09-28, so the batch falls back rather than stall.
WRITER = 'ag/claude-opus-4-6-thinking,ag/gemini-3.1-pro-low'
REVIEWER = 'ag/gemini-3.1-pro-low'
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
    done = {r['entry_id'] for r in rest_all(f'learner_entries?prompt_version=eq.{PROMPT_VERSION}&select=entry_id&order=entry_id')}
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
    senses = rest(f'senses?entry_id=eq.{q(entry_id)}&select=id,pos,gloss_en,gloss_vi&order=sense_order,id')
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
                        'gloss_vi': s['gloss_vi']} for s in senses],
            'examples': [{'id': f'x{i}', 'sense_id': x['sense_id'], 'text': x['text'],
                          'vi': x['translation_vi']} for i, x in enumerate(picked)],
            'relations': rel}


# ---------------------------------------------------------------- model

def reset_after(body):
    """Seconds until the provider's quota window reopens, from 9router's error text
    ("[antigravity/gemini-3.8-flash] [403]: HTTP 403 (reset after 2m)"), or None."""
    m = re.search(r'reset after (\d+)\s*(s|m|h)', body)
    return int(m.group(1)) * {'s': 1, 'm': 60, 'h': 3600}[m.group(2)] if m else None


class Busy(RuntimeError):
    """The router refused an impatient call for quota; the caller moves to its next model."""


def ask(model, system, user, patient=True):
    """Streamed, because CloudFront cuts a response that sends nothing for 60 s. Waits out a
    router that answers 429 or 503 instead of switching to another model: until the quota
    window the router names reopens, else with a doubling backoff. Another job sharing the
    quota retries every second, so a fixed long backoff kept losing the window. A reply cut
    at the token limit, or one with no JSON twice running, fails the entry instead. Without
    `patient` the first quota refusal raises Busy."""
    body = json.dumps({'model': model, 'max_tokens': 32000, 'stream': True, 'system': system,
                       'messages': [{'role': 'user', 'content': user}]}).encode()
    key = os.environ['AI_API_KEY']
    headers = {'content-type': 'application/json', 'x-api-key': key, 'authorization': f'Bearer {key}',
               'anthropic-version': '2023-06-01', 'accept': 'text/event-stream'}
    url = os.environ['AI_BASE_URL'].rstrip('/') + '/messages'
    wait, unparsable, backoffs = 30, 0, 0
    deadline = time.time() + 6 * 3600
    while backoffs < 40 and time.time() < deadline:
        t = time.time()
        pause = None
        parts, stop = [], None
        try:
            with urllib.request.urlopen(urllib.request.Request(url, body, headers), timeout=900) as r:
                for raw in r:
                    line = raw.decode('utf-8', 'replace').strip()
                    if not line.startswith('data:'):
                        continue
                    payload = line[5:].strip()
                    if payload == '[DONE]':
                        break
                    try:
                        ev = json.loads(payload)
                    except ValueError:
                        continue
                    if ev.get('type') == 'content_block_delta' and ev['delta'].get('type') == 'text_delta':
                        parts.append(ev['delta']['text'])
                    elif ev.get('type') == 'message_delta':
                        stop = (ev.get('delta') or {}).get('stop_reason') or stop
                    elif ev.get('choices'):
                        choice = ev['choices'][0]
                        parts.append((choice.get('delta') or {}).get('content') or '')
                        stop = choice.get('finish_reason') or stop
        except urllib.error.HTTPError as e:
            text = e.read()[:400].decode('utf-8', 'replace')
            if e.code not in (429, 500, 502, 503, 504, 529):
                raise RuntimeError(f'{model}: HTTP {e.code} {text[:200]!r}')
            if not patient:
                raise Busy(f'{model}: HTTP {e.code}')
            reopen = reset_after(text)
            if reopen is not None:
                pause = min(reopen, 900) + random.uniform(1, 6)
            log('wait', model, e.code, f'{round(pause or wait)}s')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            log('wait', model, type(e).__name__, str(e)[:80], f'{wait}s')
        else:
            if stop in ('max_tokens', 'length'):
                raise RuntimeError(f'{model}: reply cut at the token limit')
            try:
                return parse(''.join(parts)), round(time.time() - t, 1)
            except ValueError as e:
                unparsable += 1
                if unparsable >= 2:
                    raise RuntimeError(f'{model}: no JSON in the reply: {e}')
                log('unparsable reply, asking again', model)
                continue
        if pause is not None:
            time.sleep(pause)
            continue
        backoffs += 1
        time.sleep(wait)
        wait = min(wait * 2, 900)
    raise RuntimeError(f'{model}: unavailable')


def parse(text):
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


def first_answer(models, system, user):
    """(model, answer, seconds) from the first model the router serves; it waits only on the last."""
    for m in models[:-1]:
        try:
            return (m, *ask(m, system, user, patient=False))
        except Busy:
            continue
    return (models[-1], *ask(models[-1], system, user))


def build(entry_id, trad, writers, reviewer):
    """Write, check, review and correct one entry with the first writer the router serves,
    which also makes the corrections. Returns the cache record."""
    raw = raw_entry(entry_id)
    writer, layer, secs = first_answer(writers.split(','), SYSTEM, write_user(raw))
    rec = {'raw': raw, 'report': {'id': entry_id, 'writer': writer, 'reviewer': reviewer}}
    errs = validate(layer, raw, trad)
    rec['report']['seconds_write'] = secs
    if errs:
        # One retry with the problems spelled out; the model usually fixes all of them.
        layer, secs = ask(writer, SYSTEM, write_user(raw) + '\n\nYour previous answer had these problems; '
                          f'return the whole corrected layer:\n{json.dumps(errs)}\n\nPrevious answer:\n'
                          + json.dumps(layer, ensure_ascii=False))
        errs = validate(layer, raw, trad)
        rec['report']['seconds_retry'] = secs
    if errs:
        rec['report']['errors'] = errs
        return rec
    review, secs = ask(reviewer, REVIEW, f'Raw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\n'
                                          f'Learner layer:\n{json.dumps(layer, ensure_ascii=False)}')
    issues = [i for i in review.get('issues') or [] if isinstance(i, dict)]
    rec['report']['seconds_review'] = secs
    rec['issues'] = issues
    if issues:
        lo, hi = core_range(len(raw['senses']))
        fixed, secs = ask(writer, FIX, f'Give {lo} to {hi} core senses.\nRaw entry:\n{json.dumps(raw, ensure_ascii=False)}\n\nYour layer:\n'
                                       f'{json.dumps(layer, ensure_ascii=False)}\n\nReviewer issues:\n'
                                       f'{json.dumps(issues, ensure_ascii=False)}')
        rec['report']['seconds_fix'] = secs
        fix_errs = validate(fixed, raw, trad)
        if fix_errs:
            rec['report']['fix_errors'] = fix_errs
        else:
            layer = fixed
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
        fix_vi, reason = None, None
        if sid in fixes:
            proposed = gloss(fixes[sid]['proposed_vi'])
            fix_vi = proposed if 0 < len(proposed) <= 60 else joined if 0 < len(joined) <= 60 else None
            reason = fixes[sid].get('reason') if fix_vi else None
        elif not s.get('gloss_vi') and terms and not inflection and len(joined) <= 60:
            fix_vi, reason = joined, 'empty'
        labels.append({'sense_id': sid, 'core_sense_order': order, 'vi_terms': terms or None, 'domain': domain,
                       'register': register, 'is_inflection': bool(inflection), 'lemma': lemma,
                       'fix_vi': fix_vi, 'fix_reason': reason})

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
    return {'entry_id': raw['id'], 'model': report.get('writer') or report.get('model'),
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
    log(f'{len(ids)} entries, writer {a.writer}, reviewer {a.reviewer}, prompt {PROMPT_VERSION}')
    totals = {'loaded': 0, 'invalid': 0, 'failed': 0}

    def one(entry_id):
        path = cache_path(entry_id)
        try:
            rec = json.load(open(path))
        except (OSError, ValueError):
            rec = None
        if not rec or rec['report'].get('errors'):
            rec = build(entry_id, trad, a.writer, a.reviewer)
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
    with ThreadPoolExecutor(a.workers) as pool:
        futs = {pool.submit(one, i): i for i in ids}
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
    r.add_argument('--workers', type=int, default=4)
    r.add_argument('--writer', default=WRITER)
    r.add_argument('--reviewer', default=REVIEWER)
    r.add_argument('--dry-run', action='store_true')
    ld = sub.add_parser('load')
    ld.add_argument('files', nargs='+')
    ld.add_argument('--version', default='pilot-v1')
    sub.add_parser('reapply')
    a = ap.parse_args()
    {'run': cmd_run, 'load': cmd_load, 'reapply': cmd_reapply}[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
