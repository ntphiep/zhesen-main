"""Tests for the pure parts of learner.py and the jobs that share its Pool. No package beyond the
standard library, so the instance's python3 runs them:

  python3 supabase/scripts/learner/test_learner.py      (or: python3 -m pytest supabase/scripts/learner)
"""
import io, os, random, sys, tempfile, time, urllib.error
from datetime import datetime, timezone

os.environ.setdefault('AI_BASE_URL', 'http://127.0.0.1:9/v1')
os.environ['BATCH_AI_API_KEY'] = 'batch-test'
os.environ['AI_API_KEY'] = 'site-test'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import learner as L  # noqa: E402


def http(code, body):
    return urllib.error.HTTPError('http://x', code, 'refused', {}, io.BytesIO(body.encode()))


def pool(models):
    p = L.Pool(models)
    p.post = None
    return p


# ---------------------------------------------------------------- names

def test_provider_folds_aliases():
    assert L.provider('omni:agy/gemini-3.7-flash-low') == 'omni:antigravity'
    assert L.provider('omni:antigravity/gemini-3.1-pro-high') == 'omni:antigravity'
    assert L.provider('omni:deepseek-web/x') == 'omni:ds-web'
    assert L.provider('gemini/gemma-4-31b-it') == 'gemini'


def test_reserved_under_every_alias():
    assert not L.usable('agy/gemini-3.7-flash-medium')
    assert not L.usable('antigravity/gemini-3.7-flash-medium')
    for name in ('gemini/gemini-3.8-flash', 'gemini/gemini-3.7-flash', 'gemini/gemini-3.6-flash',
                 'ds-web/deepseek-v4-pro', 'deepseek-web/deepseek-v4-flash', 'ag/gpt-oss-120b-medium'):
        assert not L.usable(name), name
    assert L.usable('agy/gemini-3.7-flash-low')
    assert L.usable('orca/deepseek/deepseek-v4-flash-free') and L.usable('kr/glm-5')


def test_no_openrouter_free_model_under_any_prefix():
    for name in ('or/qwen/qwen3.8-27b:free', 'openrouter/google/gemma-4-31b-it:free',
                 'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free-high', 'omni:openrouter/meta/llama-4-70b:free'):
        assert not L.usable(name.removeprefix('omni:')), name
    assert L.usable('openrouter/stealth/space-bunny-alpha')


def test_pool_uses_the_batch_key_only():
    p = pool(['gemini/gemma-4-31b-it'])
    assert p.routers[''][1] == 'batch-test'
    saved = os.environ.pop('BATCH_AI_API_KEY')
    try:
        L.Pool(['gemini/gemma-4-31b-it'])
    except SystemExit as e:
        assert 'batch.env' in str(e)
    else:
        raise AssertionError('the site key was used')
    finally:
        os.environ['BATCH_AI_API_KEY'] = saved


def test_gemini_daily_quota_rests_until_0700_utc():
    assert L.until_quota_reset(datetime(2026, 10, 5, 14, 54, tzinfo=timezone.utc)) == (16 * 60 + 6) * 60
    assert L.until_quota_reset(datetime(2026, 10, 5, 6, 0, tzinfo=timezone.utc)) == 3600
    p = pool(['gemini/gemma-4-31b-it', 'gemini/gemini-3.5-flash'])
    p.refused('gemini/gemma-4-31b-it', http(503, '{"error":{"message":"[gemini/gemma-4-31b-it] [429]: {\\"error\\": '
                                              '{\\"code\\": 429, \\"message\\": \\"You exceeded your current quota'))
    wait = p.cool['gemini/gemma-4-31b-it'] - time.time()
    assert L.until_quota_reset() - 5 <= wait <= L.until_quota_reset() * 1.1 + 5
    assert p.cool['gemini/gemini-3.5-flash'] == 0


def test_claude_never_usable_and_refused():
    for name in ('ag/claude-opus-4-6-thinking', 'openrouter/anthropic/x', 'kr/sonnet-5', 'or/fable-5'):
        assert not L.usable(name)
    try:
        L.Pool(['ag/claude-opus-4-6-thinking'])
    except SystemExit as e:
        assert 'Claude' in str(e)
    else:
        raise AssertionError('a Claude model was accepted')
    p = pool(['gemini/gemma-4-31b-it'])
    try:
        L.Pool.post(p, 'omni:x/claude-sonnet-4-6', 'hi')
    except SystemExit:
        pass
    else:
        raise AssertionError('a call to Claude was sent')


# ---------------------------------------------------------------- refusals

def test_cooldown_full_jitter():
    rnd = random.Random(1)
    waits = [L.cooldown(0, 1800, 10, rnd) for _ in range(200)]
    assert min(waits) >= 0 and max(waits) <= 1800 and max(waits) - min(waits) > 900
    stated = [L.cooldown(100, 120, 1, rnd) for _ in range(200)]
    assert min(stated) >= 100 and max(stated) <= 120


def test_breaker_on_invalid_key_rests_provider_12h():
    p = pool(['omni:bedrock/a', 'omni:bedrock/b', 'gemini/gemma-4-31b-it'])
    p.refused('omni:bedrock/a', http(403, '{"error":{"message":"[bedrock/a] [403]: Invalid API Key format: '
                                          'Must start with pre-defined prefix (reset after 1m 36s)"}}'))
    now = time.time()
    assert p.cool['omni:bedrock/b'] - now >= L.BREAK_SECONDS - 5
    assert p.cool['gemini/gemma-4-31b-it'] == 0


def test_breaker_on_third_short_403():
    p = pool(['gc/gemini-3.1-pro-preview', 'gc/gemini-2.5-flash'])
    body = '{"error":{"message":"[gemini-cli/gemini-3.1-pro-preview] [403]: HTTP 403 (reset after 1s)"}}'
    p.refused('gc/gemini-3.1-pro-preview', http(503, body))
    p.refused('gc/gemini-3.1-pro-preview', http(503, body))
    assert p.cool['gc/gemini-2.5-flash'] == 0
    p.refused('gc/gemini-3.1-pro-preview', http(503, body))
    assert p.cool['gc/gemini-2.5-flash'] - time.time() >= L.BREAK_SECONDS - 5


def test_answer_resets_the_403_count():
    p = pool(['gc/a', 'gc/b'])
    body = '[gemini-cli/a] [403]: HTTP 403 (reset after 1s)'
    p.refused('gc/a', http(503, body))
    p.refused('gc/a', http(503, body))
    p.record('gc/b', True)
    p.refused('gc/a', http(503, body))
    assert p.cool['gc/b'] == 0


def test_account_quota_rests_provider():
    p = pool(['omni:agy/gemini-3.1-pro-low', 'omni:antigravity/gemini-3.1-pro-high', 'gemini/gemma-4-31b-it'])
    p.refused('omni:agy/gemini-3.1-pro-low', http(429, '{"error":{"message":"[antigravity/gemini-3.1-pro-low] All antigravity '
                                                     'accounts have exhausted their quota (reset after 5m)"}}'))
    assert p.cool['omni:antigravity/gemini-3.1-pro-high'] - time.time() >= 300
    assert p.cool['gemini/gemma-4-31b-it'] == 0


def test_402_rests_provider_6h():
    p = pool(['or/deepseek/deepseek-v4.1-flash', 'or/qwen/qwen3.8-flash'])
    p.refused('or/deepseek/deepseek-v4.1-flash', http(503, '[402]: {"error":{"message":"Insufficient credits"}}'))
    assert p.cool['or/qwen/qwen3.8-flash'] - time.time() >= 6 * 3600 - 5


# ---------------------------------------------------------------- pick

def test_pick_orders_by_measured_success_before_tier():
    p = pool(['gc/gemini-3-pro-preview', 'omni:openrouter/stealth/space-bunny-alpha', 'gemini/gemini-3.5-flash-lite'])
    for _ in range(20):
        p.record('gc/gemini-3-pro-preview', False)
    p.record('gemini/gemini-3.5-flash-lite', True)
    assert p.pick(None, set()) == 'gemini/gemini-3.5-flash-lite'
    assert p.pick(None, set()) == 'omni:openrouter/stealth/space-bunny-alpha'
    assert p.pick(None, set()) == 'gemini/gemini-3.5-flash-lite'


def test_pick_tier_breaks_ties():
    p = pool(['gemini/gemini-3.5-flash-lite', 'gc/gemini-3-pro-preview'])
    assert p.pick(None, set()) == 'gc/gemini-3-pro-preview'


def test_ask_gives_up_after_bad_limit():
    p = pool(['a/m1', 'b/m2', 'c/m3', 'd/m4'])
    p.post = lambda model, text: ('no json here', 'stop', model)
    try:
        p.ask('s', 'u', bad_limit=3)
    except RuntimeError:
        pass
    else:
        raise AssertionError('ask kept going')
    assert sum(1 for m in p.models if p.cool[m] > time.time()) == 3


def test_parse_accepts_raw_newline_in_string():
    assert L.parse('```json\n{"a": "x\ny"}\n```') == {'a': 'x\ny'}


# ---------------------------------------------------------------- normalisation

def test_cefr_label():
    assert L.cefr_label('A2.C1') == 'A2'
    assert L.cefr_label('b2') == 'B2'
    assert L.cefr_label('A1..C2', 'B1') == 'B1'
    assert L.cefr_label('A1..C2', 'HSK1') == 'A1..C2'
    assert L.cefr_label('advanced') == 'advanced'


def test_normalise_repairs_labels():
    layer = {'level': 'A1..C2', 'core_senses': [
        {'cefr': 'A1.C2', 'domain': 'general', 'register': 'neutral', 'equivalents': {'zh': ['真是的', '的']}},
        {'cefr': 'B2.B2', 'domain': 'theater', 'register': 'null'},
        {'cefr': 'A2', 'domain': 'Finance', 'register': 'Informal'}]}
    L.normalise(layer, {'level': 'A2'})
    c = layer['core_senses']
    assert layer['level'] == 'A2'
    assert [x['cefr'] for x in c] == ['A2', 'B2', 'A2']
    assert [x['domain'] for x in c] == [None, 'other', 'finance']
    assert [x['register'] for x in c] == [None, None, 'informal']
    assert c[0]['equivalents']['zh'] == ['真是', '的']


def test_schema_hint_is_an_enum():
    assert L.SCHEMA_HINT['core_senses'][0]['cefr'] == 'one of A1|A2|B1|B2|C1|C2'
    assert '..' not in L.SCHEMA_HINT['level']


# ---------------------------------------------------------------- families and reviewers

def test_family_joins_one_model_across_names():
    assert L.family('omni:agy/gemini-3.7-flash-low') == L.family('omni:agy/gemini-3.7-flash-tiered')
    assert L.family('gemini/gemma-4-31b-it') == L.family('omni:ddgw/tinfoil/gemma4-31b')
    assert L.family('ag/gemini-3-pro-low') == L.family('gc/gemini-3-pro-preview')
    assert L.family('gemini/gemini-3.5-flash-lite') != L.family('gemini/gemini-3.5-flash')


def test_vendor():
    assert L.vendor('gemini/gemma-4-31b-it') == L.vendor('omni:agy/gemini-3.7-flash-low') == 'google'
    assert L.vendor('omni:ddgw/tinfoil/gpt-oss-120b') == 'openai'
    assert L.vendor('omni:openrouter/nvidia/nemotron-3-super:free') == 'nvidia'
    assert L.vendor('omni:openrouter/stealth/space-bunny-alpha-high') == 'spacebunnyalpha'


def test_independent_reviewer():
    assert not L.independent('omni:agy/gemini-3.7-flash-tiered', 'omni:agy/gemini-3.7-flash-low')  # en:8
    assert not L.independent('gemini/gemma-4-31b-it', 'omni:ddgw/tinfoil/gemma4-31b')
    assert not L.independent('gemini/gemini-3.5-flash-lite', 'omni:openrouter/stealth/space-bunny-alpha')  # weaker
    assert L.independent('omni:ddgw/tinfoil/gpt-oss-120b', 'omni:openrouter/stealth/space-bunny-alpha')


def test_review_pick_avoids_vendor_and_weaker_models():
    p = pool(['gemini/gemma-4-31b-it', 'gemini/gemini-3.5-flash-lite', 'omni:ddgw/gpt-5.4-nano',
              'omni:ddgw/tinfoil/gpt-oss-120b'])
    shut = {L.family('omni:agy/gemini-3.7-flash-low'), L.vendor('omni:agy/gemini-3.7-flash-low')}
    assert p.pick(None, shut, L.rank('omni:openrouter/stealth/space-bunny-alpha')) == 'omni:ddgw/tinfoil/gpt-oss-120b'
    assert p.pick(None, shut, L.rank('omni:openrouter/stealth/space-bunny-alpha')) == 'omni:ddgw/tinfoil/gpt-oss-120b'
    assert p.pick(None, shut, 0) is None


# ---------------------------------------------------------------- content checks

RAW = {'lang': 'en', 'headword': 'go', 'level': 'A1', 'senses': [], 'examples': []}


def layer(**kw):
    base = {'gist_vi': ['đi'], 'level': 'A1', 'usage_note_vi': 'Dùng hằng ngày.',
            'core_senses': [{'vi_terms': ['đi'], 'vi_definition': 'di chuyển', 'register': None,
                             'examples': [{'text': 'We go home.', 'vi': 'Chúng tôi về nhà.'}]}]}
    base.update(kw)
    return base


def test_content_clean_layer_passes():
    assert L.content_errors(layer(), RAW, ['went']) == []


def test_content_example_needs_headword_or_form():
    bad = layer(core_senses=[{'vi_terms': ['đi'], 'examples': [{'text': 'They left early.', 'vi': 'Họ về sớm.'}]}])
    assert any('does not contain' in e for e in L.content_errors(bad, RAW, ['went']))
    ok = layer(core_senses=[{'vi_terms': ['đi'], 'examples': [{'text': 'She went out.', 'vi': 'Cô ấy ra ngoài.'}]}])
    assert L.content_errors(ok, RAW, ['went']) == []
    es = {'lang': 'es', 'headword': 'realizar', 'level': 'B1'}
    assert L.mentions('Realizó el trabajo.', 'realizar', [], 'es')
    assert not L.mentions('Daniel se dio cuenta de que llovía.', 'realizar', [], 'es')
    assert L.content_errors(layer(level='B1', core_senses=[{'examples': [{'text': 'Daniel se dio cuenta.', 'vi': 'x'}]}]),
                            es) != []


def test_content_example_length():
    long = ' '.join(['go'] * 26)
    errs = L.content_errors(layer(core_senses=[{'examples': [{'text': long, 'vi': 'x'}]}]), RAW)
    assert any('26 words' in e for e in errs)


def test_content_gist_repeat_and_brackets():
    assert 'gist_vi repeats a term' in L.content_errors(layer(gist_vi=['như vậy', 'đó', 'Như vậy']), RAW)
    assert any('brackets' in e for e in L.content_errors(layer(gist_vi=['có', '(thức giả định)']), RAW))


def test_content_cjk_punctuation_in_vietnamese():
    errs = L.content_errors(layer(usage_note_vi='Dùng trong 「事情」，như việc.'), RAW)
    assert any('Chinese punctuation' in e for e in errs)


def test_content_vulgar_in_a1_note():
    zh = {'lang': 'zh', 'headword': '日', 'level': 'HSK1'}
    note = '日 thường xuất hiện trong 生日. Nghĩa địt, đụ là từ tục.'
    lay = layer(usage_note_vi=note, core_senses=[{'examples': [{'text': '生日快乐', 'vi': 'Chúc mừng sinh nhật'}]}])
    assert any('vulgar' in e for e in L.content_errors(lay, zh))
    lay['usage_note_vi'] = '日 thường xuất hiện trong 生日.'
    assert L.content_errors(lay, zh) == []


# ---------------------------------------------------------------- sample gate

def test_gate_lots_sample_and_decision():
    import gate
    rows = [{'entry_id': f'en:w{i}', 'model': 'm/a', 'status': 'published', 'created_at': '2026-09-30T10:00:00+00:00'}
            for i in range(60)]
    rows += [{'entry_id': 'en:h', 'model': 'm/a', 'status': 'hidden', 'created_at': '2026-09-30T10:00:00+00:00'},
             {'entry_id': 'zh:x', 'model': 'm/a', 'status': 'published', 'created_at': '2026-10-05T10:00:00+00:00'}]
    got = gate.lots(rows, now=datetime(2026, 10, 5, tzinfo=timezone.utc))
    assert list(got) == [('m/a', 'en', '2026-W40')] and len(got[('m/a', 'en', '2026-W40')]) == 60
    assert list(gate.lots(rows, {'2026-W41'})) == [('m/a', 'zh', '2026-W41')]
    s = gate.sample(got[('m/a', 'en', '2026-W40')], gate.SAMPLE_SIZE, 'salt')
    assert len(s) == 50 and s == gate.sample(list(reversed(got[('m/a', 'en', '2026-W40')])), 50, 'salt')
    assert gate.defect([{'verdict': 'reject'}, {'verdict': 'reject'}, {'verdict': 'accept'}])
    assert not gate.defect([{'verdict': 'reject'}, {'verdict': 'accept'}, {'verdict': 'accept'}])
    assert gate.decide(50, 5) == (0.1, False) and gate.decide(50, 6)[1]


# ---------------------------------------------------------------- queues and redo

def stub_rest_all(answers):
    """L.rest_all answering by the first path fragment found in `answers`; returns the paths asked."""
    asked = []

    def fake(path):
        asked.append(path)
        return next((v for k, v in answers.items() if k in path), [])
    L.rest_all = fake
    return asked


def test_queue_adds_phrasal_verbs_and_skips_forms_only_on_request():
    real = L.rest_all
    try:
        asked = stub_rest_all({
            'frequency_rank=lte': [{'id': 'en:take', 'frequency_rank': 50}, {'id': 'en:apple', 'frequency_rank': 40},
                                   {'id': 'en:done', 'frequency_rank': 10}],
            'headword=match': [{'id': 'en:take off', 'headword': 'take off', 'frequency_rank': None},
                               {'id': 'en:zonk out', 'headword': 'zonk out', 'frequency_rank': None},
                               {'id': 'en:take', 'headword': 'take', 'frequency_rank': 50}],
            'learner_entries': [{'entry_id': 'en:done'}]})
        assert L.queue(['en'], 3000) == ['en:apple', 'en:take', 'en:take off']
        assert not any('form_of' in p for p in asked)
        asked.clear()
        L.queue(['en'], 3000, skip_forms=True)
        assert '&form_of=is.null' in asked[0]
        assert L.re.match(L.PHRASAL, 'take off') and not L.re.match(L.PHRASAL, 'take')
    finally:
        L.rest_all = real


def test_redo_queue_selects_by_kind():
    rows = [{'entry_id': 'en:a', 'model': 'ag/claude-opus-4-6-thinking', 'reviewer': 'x/gpt-5', 'prompt_version': 'v4'},
            {'entry_id': 'en:b', 'model': 'x/gpt-5', 'reviewer': 'omni:kr/claude-sonnet-4-6', 'prompt_version': 'v5'},
            {'entry_id': 'en:c', 'model': 'omni:antigravity/gemini-3.8-flash-tiered', 'reviewer': 'ag/gemini-3.8-flash',
             'prompt_version': 'v5'},
            {'entry_id': 'en:d', 'model': 'x/gpt-5', 'reviewer': 'y/gpt-oss-120b', 'prompt_version': 'v5'},
            {'entry_id': 'en:e', 'model': 'x/gpt-5', 'reviewer': 'y/deepseek-v4', 'prompt_version': 'v5'},
            {'entry_id': 'en:f', 'model': 'x/gpt-5', 'reviewer': None, 'prompt_version': 'v5'}]
    real = L.rest_all
    try:
        stub_rest_all({'learner_entries': rows})
        assert sorted(L.redo_queue('claude')) == ['en:a', 'en:b']
        assert sorted(L.redo_queue('same-family')) == ['en:c']
        dep = L.redo_queue('dependent')
        assert 'en:c' in dep and 'en:d' in dep and 'en:e' not in dep and 'en:f' not in dep
        assert dep['en:c']['prompt_version'] == 'v5'
    finally:
        L.rest_all = real


def test_enrich_redo_reaches_collocation_senses_and_keeps_the_old_gloss():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'enrich'))
    import enrich
    sent = []
    real_psql, real_redo = enrich.psql, enrich.REDO
    enrich.psql = lambda sql: sent.append(sql) or '[]'
    try:
        enrich.REDO = ['ag/claude-opus-4-6-thinking']
        enrich.load_material(['en:make a decision'])
        assert "s.gloss_en is null and s.provenance->>'ai' = any" in sent[0]
        s = {'id': 'en:make a decision#ai1', 'gloss_vi': 'ra quyết định', 'fix': True}
        counts, _ = enrich.write([], 'x/gpt-5', {'s': [{'n': 1, 'vi': 'ra quyết định'}]}, {1: s}, {}, {}, False)
        assert counts['senses'] == 1
        assert "'replaced'" in sent[-1] and "or s.provenance->>'ai' = any" in sent[-1]
        sent.clear()
        enrich.REDO = []
        enrich.load_material(['en:x'])
        assert 'gloss_en is null' not in sent[0]
        counts, _ = enrich.write([], 'x/gpt-5', {'s': [{'n': 1, 'vi': 'ra quyết định'}]}, {1: s}, {}, {}, False)
        assert counts['senses'] == 0
    finally:
        enrich.psql, enrich.REDO = real_psql, real_redo


# ---------------------------------------------------------------- glossfix guard

def test_glossfix_guard_counts_only_loads():
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'glossfix'))
    import glossfix
    now = datetime.now(timezone.utc).strftime('%H:%M:%S')
    with tempfile.NamedTemporaryFile('w', suffix='.log', delete=False) as fh:
        fh.write('header\n')
        fh.write(f'{now} rest omni:agy/gpt-oss-120b-medium 429 quota\n')
        fh.write(f'{now} 1/9 loaded en:a {{}}\n{now} 2/9 invalid en:b []\n{now} 3/9 loaded en:c {{}}\n')
    glossfix.LEARNER_LOG = fh.name
    try:
        assert glossfix.learner_loaded() == 2
    finally:
        os.unlink(fh.name)


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
