-- Speed up lex.match_cross_language: it matches senses on a normalized gloss
-- (strip leading to/a/an/the, lowercase). Without an index that was a seq scan over
-- ~170k senses with a per-row regexp_replace (~2.2s), exceeding the API role's
-- statement_timeout on a cold request. This expression index (identical expression
-- to the function) turns it into an index lookup.
create index if not exists idx_lex_senses_gloss_norm on lex.senses (
  (lower(regexp_replace(coalesce(gloss_en, ''), '^(to|a|an|the)\s+', '')))
);
