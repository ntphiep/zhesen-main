-- 0084_es_drop_english_tokens_and_case_twins.sql
-- Delete the Spanish entries that are English tokens or duplicate another entry (#55).
--
-- 34 Spanish entries had no sense at all: English tokens from wordfreq's Spanish list
-- (the, of, you, twitter, http) and a few names, each still levelled by frequency, so
-- es:the showed as A1 on the common-words row. `es:a` has no sense either but is a real
-- word; it stays for a rebuild.
--
-- 142 pairs such as es:Reina and es:reina carry the same senses, because the Wiktionary
-- lookup ignores case. In every pair exactly one twin has a level and a frequency rank,
-- the one the frequency list chose, and it stays: es:pan and es:México stay, es:Pan and
-- es:méxico go. 86 capitalised and 56 lowercase entries go. No row of `user_words`,
-- `lex.learner_*`, `lex.sense_labels` or `admin.entry_flags` sits on any of them. Their
-- senses and examples cascade. The relations (42 on 2026-09-29, still growing as the
-- enrichment jobs run) and the 1 grammar point link that point at a deleted twin move to
-- the kept one first; the learner references move too, in case one was written after the
-- check.
--
-- zhesen-pipeline refuses an entry with no sense and English tokens in the Spanish list,
-- and its resume check folds case for Spanish, from its #55 commit on, so a reload brings
-- neither back.
--
-- TO ROLL BACK: restore the rows from the COPY files under
-- s3://zhesen-infra-assets-014498663963/data-loads/issue55/ (entries, senses, examples,
-- pronunciations, inflections, lex_relations, gloss_terms, grammar_point_entries), entries
-- first, then undo the related_entry_id repointing from lex_relations.csv.
--
-- reviewed-destructive: Harry Nguyen. The owner approved deleting these entries in #55;
-- every row is backed up above and none belongs to a learner.

-- The delete checks the foreign key from lex_relations.related_entry_id once per entry.
-- Production has idx_lex_rel_related for it; without that index each check scanned
-- 2,437,003 relations and a dry run ran past 3 minutes.
set lock_timeout = '5s';

create temp table issue55 (id text primary key, keep text);
insert into issue55 (id, keep) values
  ('es:Abad', 'es:abad'),
  ('es:alberto', 'es:Alberto'),
  ('es:alejandro', 'es:Alejandro'),
  ('es:alemania', 'es:Alemania'),
  ('es:Alma', 'es:alma'),
  ('es:américa', 'es:América'),
  ('es:ana', 'es:Ana'),
  ('es:andrés', 'es:Andrés'),
  ('es:antonio', 'es:Antonio'),
  ('es:Argentina', 'es:argentina'),
  ('es:asia', 'es:Asia'),
  ('es:australia', 'es:Australia'),
  ('es:Barca', 'es:barca'),
  ('es:barcelona', 'es:Barcelona'),
  ('es:Bengala', 'es:bengala'),
  ('es:Blanca', 'es:blanca'),
  ('es:bolivia', 'es:Bolivia'),
  ('es:Brasil', 'es:brasil'),
  ('es:Burdeos', 'es:burdeos'),
  ('es:California', 'es:california'),
  ('es:canadá', 'es:Canadá'),
  ('es:caracas', 'es:Caracas'),
  ('es:carlos', 'es:Carlos'),
  ('es:Caro', 'es:caro'),
  ('es:Castro', 'es:castro'),
  ('es:cataluña', 'es:Cataluña'),
  ('es:Chile', 'es:chile'),
  ('es:China', 'es:china'),
  ('es:Clara', 'es:clara'),
  ('es:colombia', 'es:Colombia'),
  ('es:Colonia', 'es:colonia'),
  ('es:Come', 'es:come'),
  ('es:Corea', 'es:corea'),
  ('es:Costa', 'es:costa'),
  ('es:Cristina', 'es:cristina'),
  ('es:Cruz', 'es:cruz'),
  ('es:Cuba', 'es:cuba'),
  ('es:CV', 'es:cv'),
  ('es:D', 'es:d'),
  ('es:Dan', 'es:dan'),
  ('es:daniel', 'es:Daniel'),
  ('es:david', 'es:David'),
  ('es:diego', 'es:Diego'),
  ('es:Domingo', 'es:domingo'),
  ('es:Don', 'es:don'),
  ('es:Ecuador', 'es:ecuador'),
  ('es:eduardo', 'es:Eduardo'),
  ('es:españa', 'es:España'),
  ('es:ET', 'es:et'),
  ('es:europa', 'es:Europa'),
  ('es:FA', 'es:fa'),
  ('es:Fatiga', 'es:fatiga'),
  ('es:felipe', 'es:Felipe'),
  ('es:Fernando', 'es:fernando'),
  ('es:fernández', 'es:Fernández'),
  ('es:francia', 'es:Francia'),
  ('es:francisco', 'es:Francisco'),
  ('es:Frustración', 'es:frustración'),
  ('es:Ginebra', 'es:ginebra'),
  ('es:Gobierno', 'es:gobierno'),
  ('es:google', 'es:Google'),
  ('es:grecia', 'es:Grecia'),
  ('es:guatemala', 'es:Guatemala'),
  ('es:Idea', 'es:idea'),
  ('es:India', 'es:india'),
  ('es:Inevitable', 'es:inevitable'),
  ('es:inglaterra', 'es:Inglaterra'),
  ('es:Irán', 'es:irán'),
  ('es:israel', 'es:Israel'),
  ('es:italia', 'es:Italia'),
  ('es:Japón', 'es:japón'),
  ('es:javier', 'es:Javier'),
  ('es:Jesús', 'es:jesús'),
  ('es:Jorge', 'es:jorge'),
  ('es:josé', 'es:José'),
  ('es:juan', 'es:Juan'),
  ('es:Jueces', 'es:jueces'),
  ('es:Julio', 'es:julio'),
  ('es:L', 'es:l'),
  ('es:León', 'es:león'),
  ('es:Lima', 'es:lima'),
  ('es:Linda', 'es:linda'),
  ('es:londres', 'es:Londres'),
  ('es:Lucas', 'es:lucas'),
  ('es:Luis', 'es:luis'),
  ('es:madrid', 'es:Madrid'),
  ('es:Malta', 'es:malta'),
  ('es:manuel', 'es:Manuel'),
  ('es:Margarita', 'es:margarita'),
  ('es:mario', 'es:Mario'),
  ('es:martínez', 'es:Martínez'),
  ('es:María', 'es:maría'),
  ('es:Media', 'es:media'),
  ('es:Miguel', 'es:miguel'),
  ('es:Mira', 'es:mira'),
  ('es:méxico', 'es:México'),
  ('es:Navidad', 'es:navidad'),
  ('es:nicolás', 'es:Nicolás'),
  ('es:Norma', 'es:norma'),
  ('es:Once', 'es:once'),
  ('es:pablo', 'es:Pablo'),
  ('es:Pan', 'es:pan'),
  ('es:Panamá', 'es:panamá'),
  ('es:Papa', 'es:papa'),
  ('es:París', 'es:parís'),
  ('es:Pastor', 'es:pastor'),
  ('es:perú', 'es:Perú'),
  ('es:portugal', 'es:Portugal'),
  ('es:Post', 'es:post'),
  ('es:PUF', 'es:puf'),
  ('es:pérez', 'es:Pérez'),
  ('es:R', 'es:r'),
  ('es:rafael', 'es:Rafael'),
  ('es:Real', 'es:real'),
  ('es:Reina', 'es:reina'),
  ('es:Reyes', 'es:reyes'),
  ('es:rodríguez', 'es:Rodríguez'),
  ('es:Roma', 'es:roma'),
  ('es:Rubio', 'es:rubio'),
  ('es:rusia', 'es:Rusia'),
  ('es:Salvador', 'es:salvador'),
  ('es:santiago', 'es:Santiago'),
  ('es:Sastre', 'es:sastre'),
  ('es:Señora', 'es:señora'),
  ('es:sánchez', 'es:Sánchez'),
  ('es:Tales', 'es:tales'),
  ('es:Todos', 'es:todos'),
  ('es:Torres', 'es:torres'),
  ('es:Tres', 'es:tres'),
  ('es:Uno', 'es:uno'),
  ('es:uruguay', 'es:Uruguay'),
  ('es:Valencia', 'es:valencia'),
  ('es:Van', 'es:van'),
  ('es:venezuela', 'es:Venezuela'),
  ('es:Victoria', 'es:victoria'),
  ('es:washington', 'es:Washington'),
  ('es:X', 'es:x'),
  ('es:york', 'es:York'),
  ('es:youtube', 'es:YouTube'),
  ('es:África', 'es:áfrica'),
  ('es:Ángel', 'es:ángel'),
  ('es:Ángeles', 'es:ángeles'),
  ('es:and', null),
  ('es:art', null),
  ('es:by', null),
  ('es:dr', null),
  ('es:ed', null),
  ('es:etc', null),
  ('es:for', null),
  ('es:harry', null),
  ('es:http', null),
  ('es:ii', null),
  ('es:iii', null),
  ('es:in', null),
  ('es:is', null),
  ('es:it', null),
  ('es:iv', null),
  ('es:james', null),
  ('es:john', null),
  ('es:km', null),
  ('es:maria', null),
  ('es:martin', null),
  ('es:new', null),
  ('es:of', null),
  ('es:on', null),
  ('es:pais', null),
  ('es:paul', null),
  ('es:peter', null),
  ('es:tenes', null),
  ('es:the', null),
  ('es:to', null),
  ('es:trump', null),
  ('es:twitter', null),
  ('es:us', null),
  ('es:xd', null),
  ('es:you', null);

update lex.lex_relations r set related_entry_id = d.keep
from issue55 d
where r.related_entry_id = d.id and d.keep is not null;

-- A kept twin that pointed at its deleted twin would now point at itself.
delete from lex.lex_relations r using issue55 d where r.entry_id = d.keep and r.related_entry_id = d.keep;

insert into lex.grammar_point_entries (grammar_point_id, entry_id)
select g.grammar_point_id, d.keep
from lex.grammar_point_entries g join issue55 d on g.entry_id = d.id
where d.keep is not null
on conflict do nothing;

update public.user_words u set entry_id = d.keep
from issue55 d
where u.entry_id = d.id and d.keep is not null
  and not exists (select 1 from public.user_words o where o.user_id = u.user_id and o.entry_id = d.keep);
update lex.learner_links l set target_entry_id = d.keep
from issue55 d where l.target_entry_id = d.id and d.keep is not null;
update lex.sense_labels l set lemma_entry_id = d.keep
from issue55 d where l.lemma_entry_id = d.id and d.keep is not null;

delete from lex.entries e using issue55 d where e.id = d.id;

drop table issue55;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000005', 'es_drop_english_tokens_and_case_twins')
on conflict (version) do nothing;
