-- Phase 3: rich lexical bank schema (lex)
-- Content tables for the multi-source vocabulary pipeline. Separate from the
-- POC content tables (public.vocab_items etc.) so the existing app is untouched.
-- RLS: SELECT for role `authenticated` on every table (consistent with Phase 2
-- content policy). Writes happen via the service role (pipeline load), which
-- bypasses RLS. Idempotent so the migration can be safely re-applied.

create schema if not exists lex;

-- source catalog + license/tier
create table if not exists lex.sources (
  id text primary key,
  name text not null,
  url text,
  license text,
  tier text not null check (tier in ('open','personal')),
  notes text
);

-- lexical entries (word / phrase / idiom / collocation)
create table if not exists lex.entries (
  id text primary key,
  lang text not null references public.languages(code),
  entry_type text not null check (entry_type in ('word','phrase','idiom','collocation')),
  headword text not null,
  headword_normalized text not null,
  traditional text,
  frequency_rank int,
  frequency_band text,
  level text,
  level_is_estimated boolean not null default false,
  etymology text,
  attributes jsonb not null default '{}',
  source_id text references lex.sources(id),
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- senses, ordered most-common first
create table if not exists lex.senses (
  id text primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  pos text,
  sense_order int not null,
  gloss_vi text,
  gloss_vi_is_mt boolean not null default false,
  gloss_en text,
  register text,
  domain text,
  sense_frequency text,
  source_id text references lex.sources(id),
  provenance jsonb not null default '{}'
);

-- pronunciations per accent
create table if not exists lex.pronunciations (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  accent text not null,
  ipa text,
  audio_url text,
  audio_source text,
  source_id text references lex.sources(id),
  tier text not null default 'open'
);

-- inflections: en plural/past/comparative AND es full conjugation tables
create table if not exists lex.inflections (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  form_text text not null,
  ipa text,
  mood text,
  tense text,
  person int,
  number text,
  gender text,
  degree text,
  form_label text,
  source_id text references lex.sources(id)
);

-- related-word graph
create table if not exists lex.lex_relations (
  id bigint generated always as identity primary key,
  entry_id text not null references lex.entries(id) on delete cascade,
  related_entry_id text references lex.entries(id),
  related_text text,
  relation_type text not null,
  source_id text references lex.sources(id)
);

-- example sentences
create table if not exists lex.examples (
  id bigint generated always as identity primary key,
  sense_id text references lex.senses(id) on delete cascade,
  entry_id text references lex.entries(id) on delete cascade,
  text text not null,
  reading text,
  translation_vi text,
  translation_en text,
  audio_url text,
  audio_source text,
  source_id text references lex.sources(id),
  tier text not null default 'open'
);

-- images for concrete nouns, attached to a sense
create table if not exists lex.images (
  id bigint generated always as identity primary key,
  sense_id text not null references lex.senses(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  source_id text references lex.sources(id),
  license text,
  attribution text,
  tier text not null default 'open'
);

-- same concept across languages
create table if not exists lex.cross_language_links (
  id bigint generated always as identity primary key,
  from_sense_id text references lex.senses(id) on delete cascade,
  to_sense_id text references lex.senses(id) on delete cascade,
  from_entry_id text references lex.entries(id) on delete cascade,
  to_entry_id text references lex.entries(id) on delete cascade,
  link_type text not null default 'translation',
  concept_id text,
  source_id text references lex.sources(id)
);

-- culture/history/story enrichment (deferred at v1, schema ready)
create table if not exists lex.enrichment (
  id bigint generated always as identity primary key,
  entry_id text references lex.entries(id) on delete cascade,
  sense_id text references lex.senses(id) on delete cascade,
  kind text not null,
  body text not null,
  citations jsonb not null default '[]',
  generated_by text,
  tier text not null default 'open'
);

-- zh extension: per-character data (Unihan + CC-CEDICT)
create table if not exists lex.characters (
  char text primary key,
  is_simplified boolean,
  simplified_variant text,
  traditional_variant text,
  radical text,
  stroke_count int,
  decomposition text,
  pinyin text[],
  cantonese text[],
  han_viet text[],
  gloss text,
  source_id text references lex.sources(id)
);

create table if not exists lex.entry_characters (
  entry_id text not null references lex.entries(id) on delete cascade,
  char text not null references lex.characters(char),
  position int not null,
  primary key (entry_id, position)
);

-- es extension: tense/mood explanations, reused across all verbs
create table if not exists lex.grammar_concepts (
  id text primary key,
  lang text not null references public.languages(code),
  mood text,
  tense text,
  title_vi text not null,
  explanation_vi text not null,
  source_id text references lex.sources(id)
);

-- indexes
create index if not exists idx_lex_senses_entry on lex.senses (entry_id);
create index if not exists idx_lex_pron_entry on lex.pronunciations (entry_id);
create index if not exists idx_lex_infl_entry on lex.inflections (entry_id);
create index if not exists idx_lex_rel_entry on lex.lex_relations (entry_id);
create index if not exists idx_lex_examples_sense on lex.examples (sense_id);
create index if not exists idx_lex_images_sense on lex.images (sense_id);
create index if not exists idx_lex_entries_lang_rank on lex.entries (lang, frequency_rank);
create index if not exists idx_lex_entry_chars_char on lex.entry_characters (char);

-- RLS: enable + SELECT-for-authenticated on every table
do $$
declare t text;
begin
  foreach t in array array[
    'sources','entries','senses','pronunciations','inflections','lex_relations',
    'examples','images','cross_language_links','enrichment','characters',
    'entry_characters','grammar_concepts'
  ]
  loop
    execute format('alter table lex.%I enable row level security;', t);
    execute format('drop policy if exists %I on lex.%I;', 'lex_'||t||'_select_auth', t);
    execute format(
      'create policy %I on lex.%I for select to authenticated using (true);',
      'lex_'||t||'_select_auth', t
    );
  end loop;
end $$;
