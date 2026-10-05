#!/usr/bin/env python3
"""Draws the quality-gate sample for glossfix.py: senses in scope from the 20,000 most frequent English
and 10,000 most frequent Spanish entries, at most 4 per entry, two thirds from entries that have a human
Vietnamese reference. A reference is a human gloss of the same entry and part of speech in lex.senses,
the Cambridge English-Vietnamese gloss (/opt/zhesen/camb/camb.jsonl) or a Glosbe translation
(/opt/zhesen/glosbe/glosbe.jsonl). Writes STATE/gate/sample.json.

With --human it instead draws senses whose gloss is human (dictionary-like, at most 60 characters),
at most 2 per entry, and writes STATE/gate/human.json, each sense carrying its own gloss as the reference.

usage: gate_sample.py [--en 140] [--es 60] [--seed 7] [--human]
"""
import argparse, json, os, random
import glossfix as gf

HUMAN = """not s.gloss_vi_is_mt and s.gloss_vi is not null and not s.provenance ?| array['pointer_label', 'ai', 'learner_fix']"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--en', type=int, default=140)
    ap.add_argument('--es', type=int, default=60)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--human', action='store_true')
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    if a.human:
        return draw_human(a, rnd)
    camb, glosbe = {}, {}
    for line in open('/opt/zhesen/camb/camb.jsonl'):
        d = json.loads(line)
        if d['status'] == 'ok':
            camb[d['entry_id']] = [(e.get('pos') or '', s['vi']) for e in d['entries'] for s in e['senses'] if s.get('vi')]
    for line in open('/opt/zhesen/glosbe/glosbe.jsonl'):
        d = json.loads(line)
        if d['status'] == 'ok' and d['translations']:
            glosbe[d['entry_id']] = [t['vi'] for t in d['translations'] if t.get('vi')]
    sample = []
    for lang, top, want in (('en', 20000, a.en), ('es', 10000, a.es)):
        ids = [r['id'] for r in gf.rows(f"""
          select e.id from lex.entries e where e.lang = '{lang}' and e.frequency_rank <= {top}
            and exists (select 1 from lex.senses s where s.entry_id = e.id and {gf.TARGET})""")]
        human = {r['entry_id'] for r in gf.rows(f"""
          select distinct s.entry_id from lex.senses s join lex.entries e on e.id = s.entry_id
          where e.lang = '{lang}' and e.frequency_rank <= {top} and {HUMAN}""")}
        with_ref = [i for i in ids if i in human or i in camb or i in glosbe]
        rnd.shuffle(with_ref)
        rest = [i for i in ids if i not in set(with_ref)]
        rnd.shuffle(rest)
        got, n_ref = [], want * 2 // 3
        for pool, cap in ((with_ref, n_ref), (rest, want)):
            for eid in pool:
                if len(got) >= cap:
                    break
                ss = gf.senses_of([eid])
                rnd.shuffle(ss)
                got += ss[:min(4, cap - len(got))]
        hum = gf.rows(f"""select s.entry_id, s.pos, s.gloss_vi, coalesce(s.provenance->>'gloss_vi_source', 'human') as src
                          from lex.senses s where s.entry_id in (select jsonb_array_elements_text({gf.lit(sorted({g['entry_id'] for g in got}))}))
                            and {HUMAN}""")
        for s in got:
            refs = [(h['src'], h['gloss_vi']) for h in hum if h['entry_id'] == s['entry_id'] and h['pos'] == s['pos']]
            cb = camb.get(s['entry_id'], [])
            same = [vi for p, vi in cb if p == s['pos'] or (p == 'adjective' and s['pos'] == 'adj')]
            refs += [('cambridge', vi) for vi in (same or ([vi for _, vi in cb] if not s['pos'] else []))]
            refs += [('glosbe', vi) for vi in glosbe.get(s['entry_id'], [])[:8]]
            s['refs'] = refs
        got.sort(key=lambda s: (s['entry_id'], s['id']))
        sample += got
    os.makedirs(os.path.join(gf.STATE, 'gate'), exist_ok=True)
    json.dump(sample, open(os.path.join(gf.STATE, 'gate', 'sample.json'), 'w'), ensure_ascii=False, indent=0)
    print(len(sample), 'senses,', sum(1 for s in sample if s['refs']), 'with a reference,',
          sum(1 for s in sample if s['lang'] == 'es'), 'Spanish')


def draw_human(a, rnd):
    out = []
    for lang, top, want in (('en', 20000, a.en), ('es', 10000, a.es)):
        got = gf.rows(f"""
          select s.id, s.entry_id, e.lang, e.headword as word, s.pos, s.gloss_en as en, s.gloss_vi as vi,
                 e.level, e.frequency_rank as rank, coalesce(s.provenance->>'gloss_vi_source', 'human') as src,
                 (select x.text from lex.examples x where x.sense_id = s.id and length(x.text) between 8 and 200
                  order by x.translation_vi is null, length(x.text), x.id limit 1) as ex
          from lex.senses s join lex.entries e on e.id = s.entry_id
          where e.lang = '{lang}' and e.frequency_rank <= {top} and {HUMAN} and length(s.gloss_vi) <= 60
            and s.gloss_en is not null and length(s.gloss_en) between 3 and 400
            and s.gloss_en !~* '^(plural|simple past|past participle|present participle|third-person|alternative)'""")
        rnd.shuffle(got)
        # Up to half from the named dictionaries (Glosbe, Wiktionary translations), the rest from the others.
        per, mine = {}, []
        for s in [g for g in got if g['src'] != 'human'] + [g for g in got if g['src'] == 'human']:
            if len(mine) >= want:
                break
            if s['src'] != 'human' and len(mine) >= want // 2:
                continue
            if per.get(s['entry_id'], 0) < 2:
                s['refs'] = [(s['src'], s['vi'])]
                mine.append(s)
        out += mine
    out.sort(key=lambda s: (s['lang'], s['entry_id'], s['id']))
    json.dump(out, open(os.path.join(gf.STATE, 'gate', 'human.json'), 'w'), ensure_ascii=False, indent=0)
    import collections
    print(len(out), 'human senses', collections.Counter((s['lang'], s['src']) for s in out))


if __name__ == '__main__':
    main()
