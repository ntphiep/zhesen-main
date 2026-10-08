"""Tests for the parser and the page-following logic of crawl_oxford.py, on trimmed real pages in fixtures/.
Stdlib only, so the instance's python3 runs them:

  python3 supabase/scripts/oxford/test_oxford.py      (or: python3 -m pytest supabase/scripts/oxford)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import crawl_oxford as C  # noqa: E402


def page(name):
    return open(os.path.join(HERE, 'fixtures', name + '.html'), encoding='utf-8').read()


def test_accuse_patterns_with_their_examples():
    ents, sibs, pvs = C.parse(page('accuse'))
    assert len(ents) == 1 and (ents[0]['hw'], ents[0]['pos'], ents[0]['phrasal']) == ('accuse', 'verb', False)
    pats = {p['cf']: p['examples'] for s in ents[0]['senses'] for p in s['patterns']}
    assert pats == {
        'accuse somebody of something': ['to accuse somebody of murder/a crime'],
        'accuse somebody of doing something': ['She accused him of lying.'],
        'be accused of something': ['The government was accused of incompetence.'],
    }
    assert ents[0]['senses'][0]['examples'] == ['to be falsely/wrongly/unjustly accused of something',
                                                'They stand accused of crimes against humanity.']
    assert sibs == [] and pvs == []


def test_extra_examples_box_is_not_read():
    assert 'class="unx"' in page('accuse')
    blob = str(C.parse(page('accuse'))[0])
    assert 'His critics accused' not in blob and 'unbox' not in blob


def test_multi_sense_entry_keeps_grammar_group_and_cf_before_definition():
    e = C.parse(page('run'))[0][0]
    assert (e['id'], e['hw'], e['pos']) == ('run_1', 'run', 'verb')
    s0, s1 = e['senses'][0], e['senses'][1]
    assert s0['grammar'] == '[intransitive]' and s0['group'] == 'move fast on foot'
    assert s0['patterns'] == [{'cf': '+ adv./prep.', 'examples': ['The dogs ran off as soon as we appeared.']}]
    assert [p['cf'] for p in s1['patterns']] == ['run something'] and s1['def'].startswith('to travel')
    assert all(len(s['examples']) <= 3 for s in e['senses'])


def test_idioms_and_phrasal_links_stay_out_of_senses():
    e = C.parse(page('run'))[0][0]
    assert [i['idm'] for i in e['idioms']] == ['come running', 'run for it']
    assert e['idioms'][0]['def'] == 'to be pleased to do what somebody wants'
    assert e['idioms'][0]['examples'] == ['She knew she had only to call and he would come running.']
    assert e['phrasal_links'] == ['run across', 'run after']
    assert all('come running' not in s['def'] for s in e['senses'])


def test_sibling_and_phrasal_slugs():
    _, sibs, pvs = C.parse(page('run'))
    assert 'run_2' in sibs and pvs == ['run-across', 'run-after']


def test_phrasal_verb_page_records_each_pattern_under_its_group():
    e = C.parse(page('depend-on'))[0][0]
    assert (e['hw'], e['pos'], e['phrasal']) == ('depend on', 'phrasal verb', True)
    assert {s['pv'] for s in e['senses']} >= {'depend on/upon somebody/something',
                                              'depend on/upon somebody/something (for something)'}
    cfs = [p['cf'] for s in e['senses'] for p in s['patterns']]
    assert 'depend on/upon somebody/something doing something' in cfs
    assert 'depend on/upon somebody/something to do something' in cfs


def test_text_is_plain():
    assert C.text(C.tree('<p> a&amp;b\n <b>c</b> , (<i> d </i>) </p>')) == 'a&b c, (d)'
    assert C.text(C.tree('<h1>close<span class="hm">1</span></h1>')) == 'close'


def fake_site(monkey):
    """close is a 404 whose close_1 redirects to close1_1; the page links its siblings and one phrasal verb."""
    def entry(i, pos, extra=''):
        return ('<div class="entry" id="%s"><div class="webtop"><h1 class="headword">close</h1>'
                '<span class="pos">%s</span></div><ol><li class="sense"><span class="def">d %s</span></li></ol>%s</div>'
                % (i, pos, i, extra))
    rel = '<div id="relatedentries">%s</div>' % ''.join(
        '<a href="https://www.oxfordlearnersdictionaries.com/definition/english/%s">x</a>' % s
        for s in ('close1_2', 'close2_1', 'closet_1'))
    aside = ('<aside class="phrasal_verb_links"><ul><li><a href="https://www.oxfordlearnersdictionaries.com'
             '/definition/english/close-down#x"><span class="xh">close down</span></a></li><li><a href="/definition/'
             'english/close-down-2"><span class="xh">close down</span></a></li></ul></aside>')
    pages = {
        'close1_1': entry('close1_1', 'verb', aside) + rel,
        'close1_2': entry('close1_2', 'noun') + rel,
        'close2_1': entry('close2_1', 'adjective') + rel,
        'close-down': ('<div class="entry" id="close-down"><div class="webtop"><h1 class="headword">close down</h1>'
                       '<span class="pos">phrasal verb</span></div><span class="pv-g"><span class="pv">close down</span>'
                       '<ol><li class="sense"><span class="def">to stop</span></li></ol></span></div>'),
    }
    pages['close-down-2'] = pages['close-down'].replace('id="close-down"', 'id="close-down-2"')
    calls = []

    def get(slug):
        calls.append(slug)
        slug = {'close_1': 'close1_1'}.get(slug, slug)
        return (slug, pages[slug]) if slug in pages else None
    monkey['get'], monkey['calls'] = get, calls


def test_crawl_word_follows_siblings_and_phrasal_verbs_once_and_drops_twin_pages():
    box = {}
    fake_site(box)
    real, C.get = C.get, box['get']
    C.PV_CACHE.clear()
    try:
        ents = C.crawl_word('close')
        assert [e['id'] for e in ents] == ['close1_1', 'close1_2', 'close2_1', 'close-down']
        assert 'close-down-2' in box['calls'] and 'closet_1' not in box['calls'] and box['calls'].count('close1_1') <= 1
        assert [e['id'] for e in C.crawl_word('close')] == ['close1_1', 'close1_2', 'close2_1', 'close-down']
        assert box['calls'].count('close-down') == 1
        assert C.crawl_word('zzz') == []
    finally:
        C.get = real
        C.PV_CACHE.clear()


if __name__ == '__main__':
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith('test_') and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print('ok  ', name)
        except Exception as e:
            failed += 1
            print('FAIL', name, type(e).__name__, e)
    print(f'{len(tests) - failed} passed, {failed} failed')
    sys.exit(1 if failed else 0)
