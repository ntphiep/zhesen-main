"""Tests for the pattern selection and the answer checks of patterns.py. Stdlib only and no network, so the
instance's python3 runs them:

  python3 supabase/scripts/oxford/test_patterns.py      (or: python3 -m pytest supabase/scripts/oxford)
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import patterns as P  # noqa: E402


def sense(cfs, pv=None, examples=None):
    s = {'def': 'd', 'grammar': '', 'labels': [], 'examples': [],
         'patterns': [{'cf': cf, 'examples': (examples or {}).get(cf, [])} for cf in cfs]}
    if pv:
        s['pv'] = pv
    return s


def row(entries, head='accuse', status='ok'):
    return {'entry_id': 'en:' + head, 'headword': head, 'status': status, 'entries': entries}


def entry(hw, senses, pos='verb', phrasal=False):
    return {'id': hw, 'hw': hw, 'pos': pos, 'phrasal': phrasal, 'senses': senses, 'idioms': [], 'phrasal_links': []}


def test_shorten_somebody_and_something_only():
    assert P.shorten('accuse somebody of something') == 'accuse sb of sth'
    assert P.shorten('accuse somebody of doing something') == 'accuse sb of doing sth'
    assert P.shorten('be accused of something') == 'be accused of sth'
    assert P.shorten('depend on/upon somebody/something') == 'depend on/upon sb/sth'
    assert P.shorten("borrow somebody's something") == "borrow sb's sth"
    assert P.shorten('tell someone  something') == 'tell sb sth'
    assert P.shorten('look as if…/as though…') == 'look as if…/as though…'
    assert P.shorten('somethingness') == 'somethingness'


def test_select_keeps_own_entries_in_order_and_skips_phrasal_verbs():
    r = row([
        entry('accuse', [sense(['accuse somebody of something', 'accuse somebody of doing something'],
                               examples={'accuse somebody of something': ['to accuse somebody of murder/a crime'],
                                         'accuse somebody of doing something': ['She accused him of lying.']}),
                         sense(['be accused of something'], pv='accuse of')]),
        entry('accuser', [sense(['accuser of somebody'])], pos='noun'),
        entry('accuse on', [sense(['accuse on something'])], pos='phrasal verb', phrasal=True),
    ])
    got = P.select(r)
    assert [p['p'] for p in got] == ['accuse sb of sth', 'accuse sb of doing sth']
    assert got[0]['ex'] is None and got[1]['ex'] == 'She accused him of lying.'
    assert P.select(dict(r, status='error')) == [] and P.select(dict(r, status='missing', entries=[])) == []


def test_select_dedupes_by_pattern_drops_grammar_codes_and_caps():
    cfs = ['look at somebody/something', '+ adv./prep.', '(+ adj.)', 'look for somebody/something',
           'look at somebody/something', 'look for something/somebody', 'give somebody/something + adj.']
    got = [p['p'] for p in P.select(row([entry('look', [sense(cfs)])], head='look'))]
    assert got == ['look at sb/sth', 'look for sb/sth', 'give sb/sth + adj.']
    many = [f'look {i} something' for i in range(20)]
    assert len(P.select(row([entry('Look', [sense(many)])], head='look'))) == P.MAX_PATTERNS


def test_example_prefers_a_plain_sentence_and_drops_glosses():
    assert P.example(['to accuse somebody of murder', 'a look of disgust/horror', 'She smiled.']) == 'She smiled.'
    assert P.example(['a look of disgust/horror']) == 'a look of disgust/horror'
    assert P.example(["We'll take a close look (= examine it carefully)."]) == "We'll take a close look."
    assert P.example(['to do something', 'ok']) is None


ITEMS = [{'p': 'accuse sb of sth', 'ex': None}, {'p': 'accuse sb of doing sth', 'ex': 'She accused him of lying.'},
         {'p': 'give sb/sth + adj.', 'ex': None}]


def test_check_accepts_a_clean_answer():
    got = P.check(ITEMS, {'r': [{'n': 1, 'vi': 'buộc tội ai về việc gì.'},
                                {'n': 2, 'vi': 'buộc tội ai đã làm gì', 'exVi': 'Cô ấy buộc tội anh ta nói dối'},
                                {'n': 3, 'vi': 'coi ai/cái gì là + adj.'}]})
    assert got == {1: ('buộc tội ai về việc gì', None), 2: ('buộc tội ai đã làm gì', 'Cô ấy buộc tội anh ta nói dối.'),
                   3: ('coi ai/cái gì là + adj.', None)}


def test_check_rejects_english_long_missing_and_untranslated():
    bad = P.check(ITEMS, {'r': [
        {'n': 1, 'vi': 'accuse sb of sth'},                          # English copied back
        {'n': 2, 'vi': 'buộc tội ai đã làm gì'},                      # example sent, no exVi
        {'n': 3, 'vi': 'buộc tội ' + 'rất ' * 20},                    # over MAX_VI
    ]})
    assert bad == {}
    assert P.check(ITEMS, {'r': [{'n': 1, 'vi': 'buộc tội sb về việc gì'}]}) == {}
    assert P.check(ITEMS, {'r': [{'n': 2, 'vi': 'buộc tội ai', 'exVi': 'She accused him of lying.'}]}) == {}
    assert P.check(ITEMS, {'r': [{'n': 1, 'vi': '指责'}, {'n': 9, 'vi': 'buộc tội'}, 'x']}) == {}
    # a slot dropped: "responsible with sth" answered "cẩn thận với tiền bạc", "look as if…" without its "…"
    assert P.check([{'p': 'responsible with sth', 'ex': None}], {'r': [{'n': 1, 'vi': 'cẩn thận với tiền bạc'}]}) == {}
    assert P.check([{'p': 'blame sb', 'ex': None}], {'r': [{'n': 1, 'vi': 'đổ lỗi'}]}) == {}
    assert P.check([{'p': 'look as if…', 'ex': None}], {'r': [{'n': 1, 'vi': 'có vẻ như'}]}) == {}
    assert P.check([{'p': 'look as if…', 'ex': None}], {'r': [{'n': 1, 'vi': 'có vẻ như…'}]}) == {1: ('có vẻ như…', None)}
    assert P.check(ITEMS, {'answer': []}) == {} and P.check(ITEMS, []) == {}


def test_record_keeps_dictionary_order_and_pairs_ex_with_exvi():
    w = P.word_of(row([]), [{'p': 'a sb', 'ex': 'One.'}, {'p': 'b sth', 'ex': None}, {'p': 'c', 'ex': 'Three.'}])
    w['got'] = {2: ('ba', 'Ba.'), 0: ('một ai', 'Một.'), 1: ('hai gì', None)}
    assert P.record(w) == [{'p': 'a sb', 'vi': 'một ai', 'ex': 'One.', 'exVi': 'Một.'}, {'p': 'b sth', 'vi': 'hai gì'},
                           {'p': 'c', 'vi': 'ba', 'ex': 'Three.', 'exVi': 'Ba.'}]
    del w['got'][1]
    assert [r['p'] for r in P.record(w)] == ['a sb', 'c'] and P.todo([w]) == [(w, 1)]


def test_calls_hold_at_most_the_word_and_pattern_limits():
    words = [P.word_of(row([], head=str(i)), [{'p': 'x', 'ex': None}] * n) for i, n in enumerate([30, 25, 10, 1])]
    q = P.deque(words)
    assert [len(c) for c in iter(lambda: P.calls_of(q), [])] == [2, 2]
    q = P.deque(P.word_of(row([], head=str(i)), [{'p': 'x', 'ex': None}]) for i in range(30))
    assert len(P.calls_of(q)) == P.CALL_WORDS


def test_follow_reads_only_complete_lines():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, 'oxford.jsonl')
        f = P.Follow(path)
        assert f.read() == []
        with open(path, 'w') as fh:
            fh.write(json.dumps({'entry_id': 'en:a'}) + '\n' + '{"entry_id": "en:b"')
        assert [r['entry_id'] for r in f.read()] == ['en:a']
        with open(path, 'a') as fh:
            fh.write('}\n')
        assert [r['entry_id'] for r in f.read()] == ['en:b'] and f.read() == []
        with open(os.path.join(d, 'crawl.log'), 'w') as fh:
            fh.write('2026-10-08T02:26:00 loaded 1 words\n')
        assert not P.crawler_finished(os.path.join(d, 'crawl.log'))
        with open(os.path.join(d, 'crawl.log'), 'a') as fh:
            fh.write('2026-10-09T02:26:00 finished\n')
        assert P.crawler_finished(os.path.join(d, 'crawl.log'))


def test_pool_never_takes_claude():
    os.environ.setdefault('AI_BASE_URL', 'http://127.0.0.1:9/v1')
    os.environ.setdefault('BATCH_AI_API_KEY', 'batch-test')
    try:
        P.Pool(['kr/glm-5', 'ag/claude-opus-4-6-thinking'])
        raise AssertionError('a Claude model was accepted')
    except SystemExit as e:
        assert 'Claude never writes' in str(e)
    pool = P.Pool(['kr/glm-5', 'ds-web/deepseek-v4-pro', 'or/openai/gpt-6-sol'])
    assert pool.models == ['kr/glm-5', 'or/openai/gpt-6-sol'] and set(pool.cap.values()) == {8000}
    assert P.learner.PROVIDER_LIMIT['omni:ds-web'] == 0 and P.learner.PROVIDER_LIMIT['ds-web'] <= 2


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
