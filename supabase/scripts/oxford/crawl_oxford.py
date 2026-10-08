#!/usr/bin/env python3
"""Crawl Oxford Learner's Dictionaries for the English words in words.tsv (entry_id, headword, rank).
Appends one JSON line per word to oxford.jsonl:
{"entry_id","headword","status","entries":[{"id","hw","pos","phrasal","senses":[{"def","grammar","labels",
"patterns":[{"cf","examples"}],"examples"}],"idioms":[{"idm","def","examples"}],"phrasal_links":[...]}]}
Status ok, missing (404 or no entry) or error; a restart skips ok and missing. Pages of a word's other parts
of speech (run_1, run_2, close1_1, close2_1 ...) are found through the page's own links; every phrasal verb
the entry links to is fetched too and recorded under the same word. Workers default to 2 (OX_WORKERS), one
request per second each, backing off on 403, 429 and 5xx. Stdlib only."""
import html
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from queue import Queue

D = os.path.dirname(os.path.abspath(__file__)) + '/'
OUT = D + 'oxford.jsonl'
BASE = 'https://www.oxfordlearnersdictionaries.com/definition/english/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
LOCK = threading.Lock()
PAUSE = {'until': 0.0}
PV_CACHE = {}
MAX_PAGES = 12
MAX_EG = 3
VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track'}


# ---------------------------------------------------------------- html tree

class Node:
    __slots__ = ('tag', 'attrs', 'kids', 'parent')

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.kids, self.parent = tag, attrs, [], parent

    def has(self, c):
        return c in (self.attrs.get('class') or '').split()


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', {}, None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, dict(attrs), self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, dict(attrs), self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def tree(page):
    t = Tree()
    t.feed(page)
    return t.root


def walk(n, stop=None):
    """Descendant nodes in document order; does not enter a node for which stop(node) is true."""
    for k in n.kids:
        if isinstance(k, Node):
            yield k
            if not (stop and stop(k)):
                yield from walk(k, stop)


def raw(n):
    if isinstance(n, str):
        return n
    return ''.join(raw(k) for k in n.kids if isinstance(k, str) or (k.tag not in ('script', 'style') and not k.has('hm')))


def text(n):
    s = re.sub(r'\s+', ' ', html.unescape(raw(n))).strip()
    return re.sub(r'\s+([,.;:!?)\]])', r'\1', re.sub(r'([(\[])\s+', r'\1', s))


def within(n, c, top):
    while n is not None and n is not top:
        if isinstance(n, Node) and n.has(c):
            return True
        n = n.parent
    return False


def find(n, c, stop=None):
    return [k for k in walk(n, stop) if k.has(c)]


# ---------------------------------------------------------------- parsing

def parse_sense(li):
    """One li.sense: def, grammar, labels, patterns (cf with its examples) and plain examples."""
    uls = [k for k in li.kids if isinstance(k, Node) and k.tag == 'ul' and k.has('examples')]
    # nodes of the sense outside its example lists and outside the collapsed boxes (extra examples, collocations)
    top = [k for k in walk(li, lambda n: n.tag == 'ul') if not within(k, 'collapse', li)]
    d = next((k for k in top if k.has('def')), None)
    g = next((k for k in top if k.has('grammar')), None)
    labels = []
    for k in top:
        if (k.has('labels') or k.has('use')) and not within(k, 'def', li) and k.tag != 'ul':
            t = text(k).strip('() ').strip()
            if t and t not in labels:
                labels.append(t)
    pats, plain_eg = {}, []
    for u in uls:
        for e in u.kids:
            if not isinstance(e, Node) or e.tag != 'li':
                continue
            cfs = [text(k) for k in find(e, 'cf')]
            xs = [x for x in (text(k) for k in find(e, 'x')) if x]
            if cfs:
                for cf in cfs:
                    p = pats.setdefault(cf, [])
                    p.extend(x for x in xs if x not in p)
            else:
                plain_eg.extend(x for x in xs if x not in plain_eg)
    for k in top:  # a cf outside the example list has no example of its own
        if k.has('cf') and k.tag != 'ul':
            pats.setdefault(text(k), [])
    return {'def': text(d) if d else '', 'grammar': text(g) if g else '', 'labels': labels,
            'patterns': [{'cf': cf, 'examples': xs[:MAX_EG]} for cf, xs in pats.items() if cf],
            'examples': plain_eg[:MAX_EG]}


def senses_of(scope, skip):
    out = []
    for li in walk(scope, skip):
        if li.tag == 'li' and li.has('sense'):
            s = parse_sense(li)
            sh = li.parent
            while sh is not None and sh is not scope and not sh.has('shcut-g'):
                sh = sh.parent
            h = next((text(k) for k in find(sh, 'shcut')), '') if sh is not None and sh is not scope else ''
            if h:
                s['group'] = h
            if s['def'] or s['patterns']:
                out.append(s)
    return out


def slug_of(href):
    m = re.search(r'/definition/english/([^"#?]+)', href or '')
    return m.group(1) if m else ''


def parse(page):
    """-> (entries, sibling page slugs, phrasal verb page slugs)"""
    root = tree(page)
    entries, sibs, pvs = [], [], []
    for ent in [n for n in walk(root) if n.tag == 'div' and n.has('entry') and n.attrs.get('id')]:
        wt = next(iter(find(ent, 'webtop')), None)
        hw = next((text(k) for k in find(wt, 'headword')), '') if wt else ''
        pos = next((text(k) for k in find(wt, 'pos')), '') if wt else ''
        senses = senses_of(ent, lambda n: n.has('idm-g') or n.has('pv-g') or n.has('phrasal_verb_links'))
        for pg in find(ent, 'pv-g'):
            pvt = next((text(k) for k in find(pg, 'pv')), '')
            for s in senses_of(pg, lambda n: n.has('idm-g')):
                s['pv'] = pvt
                senses.append(s)
        idioms = []
        for ig in find(ent, 'idm-g'):
            idm = next((text(k) for k in find(ig, 'idm')), '')
            for s in senses_of(ig, lambda n: False):
                eg = s['examples'] or [x for p in s['patterns'] for x in p['examples']][:MAX_EG]
                idioms.append({'idm': idm, 'def': s['def'], 'examples': eg})
        links = []
        for aside in find(ent, 'phrasal_verb_links'):
            for a in walk(aside):
                if a.tag == 'a':
                    sl, t = slug_of(a.attrs.get('href')), text(a)
                    if sl and sl not in pvs:
                        pvs.append(sl)
                    if t and t not in links:
                        links.append(t)
        entries.append({'id': ent.attrs['id'], 'hw': hw, 'pos': pos, 'phrasal': 'phrasal' in pos,
                        'senses': senses, 'idioms': idioms, 'phrasal_links': links})
    for a in walk(root):  # the homograph list (close1_1, close1_2, close2_1) is outside the entry
        if a.tag == 'a':
            sl = slug_of(a.attrs.get('href'))
            if sl and sl not in sibs:
                sibs.append(sl)
    return entries, sibs, pvs


def keep(e):
    return bool(e['senses'] or e['idioms'] or e['phrasal_links'])


# ---------------------------------------------------------------- crawling

def log(*a):
    with LOCK:
        with open(D + 'crawl.log', 'a') as f:
            f.write(time.strftime('%Y-%m-%dT%H:%M:%S ') + ' '.join(map(str, a)) + '\n')


def word_slug(word):
    return urllib.parse.quote(re.sub(r'\s+', '-', word.strip().lower()), safe='-')


def get(slug):
    """(final slug, page) or None on 404. Backs off on 403, 429 and 5xx; raises after six tries."""
    for attempt in range(6):
        time.sleep(max(0, PAUSE['until'] - time.time()))
        req = urllib.request.Request(BASE + slug, headers={
            'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read().decode('utf-8', 'replace')
                final = r.geturl().rsplit('/', 1)[-1]
            time.sleep(1)
            return final, body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                time.sleep(1)
                return None
            with LOCK:
                PAUSE['until'] = time.time() + 60 * 2 ** attempt
            log('backoff', e.code, slug, 60 * 2 ** attempt)
        except Exception as e:
            log('error', slug, type(e).__name__, str(e)[:100])
            time.sleep(20)
    raise RuntimeError('gave up on ' + slug)


def crawl_word(word):
    base = word_slug(word)
    first = get(base) or get(base + '_1')  # close is a 404 but close_1 redirects to close1_1
    if not first:
        return []
    pages, todo, seen, entries, pvq = {first[0]: first[1]}, [first[0]], set(), [], []
    sibling = re.compile(r'^' + re.escape(base) + r'\d*_\d+$')
    while todo and len(seen) < MAX_PAGES:
        sl = todo.pop(0)
        if sl in seen:
            continue
        seen.add(sl)
        got = (sl, pages[sl]) if sl in pages else get(sl)
        if not got:
            continue
        ents, sibs, pvs = parse(got[1])
        entries.extend(e for e in ents if keep(e))
        todo.extend(s for s in sibs if sibling.match(s) and s not in seen)
        pvq.extend(p for p in pvs if p not in pvq)
    for sl in pvq:
        if sl not in PV_CACHE:
            got = get(sl)
            PV_CACHE[sl] = [e for e in parse(got[1])[0] if keep(e)] if got else []
        entries.extend(PV_CACHE[sl])
    uniq, seen_keys = [], set()
    for e in entries:  # depend-on and depend-upon are one page under two names
        key = e['id'], json.dumps([e['pos'], e['senses'], e['idioms']], sort_keys=True)
        if key[0] not in seen_keys and key[1] not in seen_keys:
            seen_keys.update(key)
            uniq.append(e)
    return uniq


def worker(q, out):
    while True:
        w = q.get()
        if w is None:
            return
        try:
            entries = crawl_word(w['headword'])
            rec = dict(w, status='ok' if entries else 'missing', entries=entries)
        except Exception as e:
            log('failed', w['headword'], type(e).__name__, str(e)[:100])
            rec = dict(w, status='error', entries=[])
        with LOCK:
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
            out.flush()


def main():
    done = set()
    if os.path.exists(OUT):
        for line in open(OUT):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r['status'] in ('ok', 'missing'):
                done.add(r['entry_id'])
                for e in r['entries']:
                    if e['phrasal']:
                        PV_CACHE[e['id']] = [e]
    words, seen = [], set()
    for line in open(D + 'words.tsv'):
        p = line.rstrip('\n').split('\t')
        if len(p) >= 2 and p[0] not in done and p[1].lower() not in seen:
            seen.add(p[1].lower())
            words.append({'entry_id': p[0], 'headword': p[1]})
    log('loaded', len(words), 'words to do,', len(done), 'done before')
    q = Queue()
    for w in words:
        q.put(w)
    n = int(os.environ.get('OX_WORKERS', '2'))
    with open(OUT, 'a') as out:
        ts = [threading.Thread(target=worker, args=(q, out)) for _ in range(n)]
        for t in ts:
            q.put(None)
            t.start()
        for t in ts:
            t.join()
    log('finished')


if __name__ == '__main__':
    main()
