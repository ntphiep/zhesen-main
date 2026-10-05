#!/bin/sh
# Full enrichment: levelled entries, then collocation targets, then the AI level guess.
cd /opt/zhesen/enrich
# The router URLs, then the routers' zhesen-batch keys that learner.Pool reads.
. /opt/zhesen/learner/env.sh
set -a; . /opt/zhesen/batch.env; set +a
# Claude writes no product data: every sense it wrote, collocation senses included, is rewritten first.
for lang in en es zh; do
  ENRICH_STATE=/opt/zhesen/enrich/state_redo_claude python3 enrich.py --workers 4 --lang $lang --redo-models ag/claude-opus-4-6-thinking || exit 1
done
python3 enrich.py --workers 4 || exit 1
python3 enrich.py --workers 4 || exit 1
# Senses first written by a weaker model or a Claude model are rewritten by the current chain.
ENRICH_STATE=/opt/zhesen/enrich/state_redo python3 enrich.py --workers 4 --redo-models ag/gpt-oss-120b-medium,ag/claude-opus-4-6-thinking || exit 1
ENRICH_STATE=/opt/zhesen/enrich/state_redo python3 enrich.py --workers 4 --redo-models ag/gpt-oss-120b-medium,ag/claude-opus-4-6-thinking || exit 1
python3 enrich.py --workers 4 --collocation-targets || exit 1
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- Still an estimate, but the model's CEFR judgement replaces the frequency-based one.
update lex.entries set level = provenance->>'ai_level',
  provenance = provenance || '{"level": "zhesen-ai"}'::jsonb
where lang = 'en' and level_is_estimated and form_of is null and provenance->>'ai_level' in ('A1','A2','B1','B2','C1','C2')
  and level is distinct from provenance->>'ai_level';
SQL
python3 -c "import enrich; enrich.revalidate()"
echo all-done
