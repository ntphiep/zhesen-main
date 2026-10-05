"""Tests for the pure parts of learner.py and the jobs that share its Pool. No package beyond the
standard library, so the instance's python3 runs them:

  python3 supabase/scripts/learner/test_learner.py      (or: python3 -m pytest supabase/scripts/learner)
"""
import io, os, random, sys, tempfile, time, urllib.error
from datetime import datetime, timezone

os.environ.setdefault('AI_BASE_URL', 'http://127.0.0.1:9/v1')
os.environ.setdefault('AI_API_KEY', 'test')
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
    assert not L.usable('or/qwen/qwen3.8-27b:free')
    assert L.usable('agy/gemini-3.7-flash-low')


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
