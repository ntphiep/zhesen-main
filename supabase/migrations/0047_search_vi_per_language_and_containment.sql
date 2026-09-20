-- The Vietnamese lookup answers all three languages, and stops answering with words
-- that only collide once tone marks are folded away.
--
-- Eight defects, all measured on production before this migration.
--
-- 1. One quota for three languages. `lex.search_vi` ranked every candidate together
--    and cut to p_limit, so a language could starve:
--
--      lex.search_vi('di bo',    array['en','es','zh'], 24) -> en 16, es 7, zh 1
--      lex.search_vi('hop dong', array['en','es','zh'], 24) -> en 16, es 6, zh 2
--
--    The caller then kept 8 per language, so 8 English rows were discarded while
--    Chinese showed one. p_limit now counts per language.
--
-- 2. A gloss shorter than the query could only match by trigram. The Chinese entry
--    for dog carries the single gloss "cho", so "con cho" ranked it 0.70,
--    seventeenth of twenty-four, under market, location and alcohol. A gloss that is
--    one whole word of the query now scores from 3.0.
--
-- 3. A substring match ignored word boundaries. "con cho" normalises into "con chong
--    mat", so swim ranked 3.70 and turn 3.67, both above doggy at 3.50. The
--    short-query branch has required a word boundary since 0018; the long branch now
--    does too, through the escaped q_re that 0036 added for this.
--
-- 4. A bracketed definition hid the gloss. es:gato reads "meo (gioi tinh khong xac
--    dinh)" and es:perro "cho (loai canis familiaris ...)", so "con meo" and "con
--    cho" never reached either: 2,480 senses of 117,972 are shaped this way, and they
--    include the most ordinary words. Every comparison now reads the gloss with its
--    bracket removed, and `idx_lex_senses_gloss_vi_head` indexes that expression.
--
-- 5. Folding tone marks turned different words into one string, and nothing put them
--    back. "cai ban" reached ban, ban and ban; "con cho" reached cho; "an" reached the
--    Chinese words for press and for crush. The rank now carries one penalty of 1.5
--    for a gloss whose marks disagree with the query's, which covers every tier at
--    once. A query typed without marks is exempt, because nothing can tell them apart,
--    and so is a spelling the language writes two ways: lex.tone_key puts each word's
--    marks after its letters, so "hoa binh" written either way is one word. Comparing
--    the raw text instead cost peace and paz their query, which returned jar.
--
-- 6. The classifier opening a Vietnamese noun phrase names no word, so every Chinese
--    gloss reading "cai" answered "cai ban" -- eight of them, and the eight were the
--    whole column.
--
-- 7. Edge punctuation broke every structural tier. "Troi." never equalled, contained
--    or bounded "troi", so cielo answered "bau troi" at 0.68, under casa at 1.02.
--
-- 8. A gloss deep inside a long entry outranked the primary sense of the right word.
--    "bau troi" is sense 13 of element and sense 28 of blue, both whole-gloss matches
--    at 5.0, and both beat sky, whose first sense lists two glosses and so scores one
--    tier lower. The sense-position penalty 0023 added was capped at 0.4, which could
--    only reorder inside a tier; at 1.2 it crosses one.
--
-- After, reading the top of each column:
--
--   con cho  ->  dog, dogs | perro, perros | the character for dog
--   con meo  ->  cat, cats | gato          | the character for cat
--   cai ban  ->  table, tables | mesa, tabla | nothing, which is the truth
--   bau troi ->  sky, skies   | cielo       | the two characters for sky
--   an       ->  eat, eating  | comer, come | the character for eat
--
-- The floor is 2.6, not the 3.0 of the tier it is meant to keep. Rank is the tier plus
-- bonuses minus two penalties: up to 1.2 for sense position and 1.5 for disagreeing
-- tone marks. A tier-5.0 hit whose marks disagree lands at 3.5 and stays visible where
-- nothing better exists, which is what a spelling the language writes both ways, "hoa
-- binh" with either mark, needs. Nothing below the structural tiers reaches the floor:
-- trigram tops out at 1.2 + 0.5 + 0.3 = 2.0 and the attr_hit substring tier at 1.8.
--
-- Cost, warm, `explain (analyze, buffers)` on production:
--
--   lex.search_vi('bau troi', array['en','es','zh'], 8)    35 ms
--   lex.search_vi('hoc',      array['en','es','zh'], 8)    40 ms
--   lex.search_vi('con cho',  array['en','es','zh'], 8)    71 ms
--   lex.search_vi('cai ban',  array['en','es','zh'], 8)   120 ms
--   lex.search_vi('an',       array['en','es','zh'], 8)   410 ms, 17,971 buffers
--
-- Replacing the `limit p_limit` inside `ranked` with two window functions means a
-- full sort of the candidate set rather than a top-N heapsort. It does not show:
-- "bau troi" ran at 218 ms before this migration and 250 ms after, on a candidate set
-- the same migration cuts.
--
-- A query of three characters or fewer takes the short branch, which matches by regex
-- and so reads every sense in the three languages: that is the 17,924 buffers behind
-- "an". Cold, before the pages are in shared buffers, it crosses the 3 s the anon role
-- allows and returns SQLSTATE 57014. `app/dictionary/search/route.ts` answers 503 to
-- that rather than an error page, because the condition passes as the cache fills.
--
-- Applied as a text transform of the live definition, asserting the hit count of
-- each replacement, rather than re-emitting the body. Same method as 0042 and 0045,
-- and it is what carries 0044's `SET pg_trgm.similarity_threshold` and 0045's
-- `lex.entry_pos` call through unread.
--
-- TO ROLL BACK: reverse each replacement, then drop the index; every pattern quotes
-- the text it replaces.

-- The gloss with its bracketed definition removed. Mirrors
-- `idx_lex_senses_gloss_head`, which already indexes the same shape of the English
-- gloss. btree rather than trigram, because the new test is equality against one
-- word of the query.
create index if not exists idx_lex_senses_gloss_vi_head
  on lex.senses (btrim(regexp_replace(gloss_vi_normalized, '\s*\(.*$', ''), ' .,;:!?'));

-- The comparison that tells a spelling from a different word. Folding the marks away
-- makes an, án and ăn one string; comparing the raw text makes "hoà bình" and "hòa
-- bình" two, because Vietnamese puts the tone on either vowel of a diphthong and the
-- data holds both spellings. Measured: 577 of 93,803 gloss heads are written more than
-- one way, and they include peace and paz, which "hòa bình" lost to jar and jars.
create or replace function lex.tone_key(t text)
returns text
language sql
immutable
parallel safe
set search_path = lex, extensions, public
as $$
  -- Each word becomes its letters followed by its marks. NFD splits a letter from its
  -- marks, so the first regexp_replace keeps the letters and the second keeps what is
  -- left once letters, spaces and punctuation are gone, which is the marks. Punctuation
  -- goes because a gloss lists its senses comma-separated and the comma is not part of
  -- the word beside it.
  select coalesce(string_agg(
    regexp_replace(w, '[^[:alnum:]]', '', 'g') || regexp_replace(w, '[[:alnum:][:space:][:punct:]]', '', 'g'),
    ' ' order by ord), '')
  from unnest(regexp_split_to_array(lower(normalize(btrim(coalesce(t, '')), NFD)), '[\s,;]+'))
       with ordinality as u(w, ord)
$$;

grant execute on function lex.tone_key(text) to anon, authenticated, service_role;

-- pg_get_functiondef re-emits lex.search_vi with its own
-- `SET pg_trgm.similarity_threshold TO '0.45'` (0044), and setting that parameter
-- fails with 42501 until pg_trgm is loaded into the session. Calling one of its
-- functions loads it. Same line, same reason, as 0045.
select extensions.similarity('a', 'b');

do $mig$
declare
  step record;
  def text;
  hits int;
begin
  for step in
    select * from (values
      -- Word boundary on the substring tier. The long branch only: its scoring block
      -- ends with the trigram term the short branch does not compute, which is what
      -- tells the two identical `then 3.0` lines apart.
      (1,
       $p1$like '%' \|\| \(select q_norm from q\) \|\| '%' then 3\.0(\s+else 0 end,\s+-- Trigram similarity says nothing useful about a two-character query, and\s+-- computing it for every candidate row is what made short queries slow\.\s+)coalesce\(extensions\.similarity$p1$,
       $r1$~ ('(^|[^[:alnum:]])' || (select q_re from q) || '([^[:alnum:]]|$)') then 3.0\1coalesce(extensions.similarity$r1$,
       1),

      -- The same boundary on the candidate test, so a gloss the scoring no longer
      -- credits is not carried along either. The trigram alternative stays: it is
      -- what answers a misspelling, and it is scored on similarity alone.
      (2,
       $p2$and \( s\.gloss_vi_normalized like '%' \|\| \(select q_norm from q\) \|\| '%'
            or s\.gloss_vi_normalized operator\(extensions\.%\) \(select q_norm from q\) \)$p2$,
       $r2$and ( s.gloss_vi_normalized ~ ('(^|[^[:alnum:]])' || (select q_re from q) || '([^[:alnum:]]|$)')
            or s.gloss_vi_normalized operator(extensions.%) (select q_norm from q) )$r2$,
       1),

      -- The per-language quota, once per branch.
      (3,
       $p3$    order by rank desc
    limit p_limit
  \)
  select
    r\.id, r\.lang, r\.headword$p3$,
       $r3$  ),
  -- One quota per language rather than one list cut at the end, and a floor that
  -- follows the language instead of a fixed number: a column stops where its rows
  -- fall away from its own best answer. "con cho" has two English words and then a
  -- drop to glosses that merely share a syllable once tone marks are folded away.
  --
  -- A language holding nothing structural shows nothing. That is a worse answer than
  -- a guess only if the guess is right, and the guesses were casa for "bau troi" and
  -- eight characters reading "cai" for "cai ban".
  per_lang as (
    select * from (
      select *,
        row_number() over (partition by lang order by rank desc) as rn,
        max(rank) over (partition by lang) as best_in_lang
      from ranked
    ) t
    where rn <= p_limit and rank >= 2.6 and rank >= best_in_lang - 2.0
  )
  select
    r.id, r.lang, r.headword$r3$,
       2),

      -- The final select reads the quota, once per branch. The alias is what keeps
      -- this from matching the `from ranked` inside the CTE added above.
      (4,
       $p4$  from ranked r$p4$,
       $r4$  from per_lang r$r4$,
       2),

      -- The containment tier, under the substring tier: a gloss holding the whole
      -- query answers better than one filling a single word of it, which is why
      -- Spanish perros outranks alcohol, glossed "con", for "con cho".
      (5,
       $p5$then 4\.0\n             when s\.gloss_vi_normalized ~ \('\(\^\|\[\^\[:alnum:\]\]\)'$p5$,
       $r5$then 4.0
             -- A gloss shorter than the query can only be reached by trigram: 狗 carries
             -- "chó" alone, so "con chó" ranked it 0.70, seventeenth. A gloss that is one
             -- whole word of the query is a real answer. The bonus leans on Vietnamese
             -- word order, where the head noun follows its classifier, so "chó" in
             -- "con chó" outranks "con".
             when length(s.gloss_vi_normalized) >= 2
                  and ' ' || (select q_norm from q) || ' ' like '%' || ' ' || btrim(regexp_replace(s.gloss_vi_normalized, '\\s*\\(.*$', ''), ' .,;:!?') || ' ' || '%'
               then case
                 -- The classifier a Vietnamese noun phrase opens with names no word:
                 -- every Chinese gloss reading "cái" answered "cái bàn". It lands under
                 -- the structural floor, so it is dropped. A gloss that matches only
                 -- because the marks were folded away is handled once, in the rank.
                 when (position(' ' || btrim(regexp_replace(s.gloss_vi_normalized, '\\s*\\(.*$', ''), ' .,;:!?') || ' ' in ' ' || (select q_norm from q) || ' ') = 1
                          and (select q_norm from q) like '% %')
                   then 2.0
                 else 3.0 + 0.4 * ((position(' ' || btrim(regexp_replace(s.gloss_vi_normalized, '\\s*\\(.*$', ''), ' .,;:!?') || ' ' in ' ' || (select q_norm from q) || ' ') - 1)::real
                                   / greatest(length((select q_norm from q)), 1))
               end
             when s.gloss_vi_normalized ~ ('(^|[^[:alnum:]])'$r5$,
       1),

      -- The diacritic bonus in both directions. Once per branch.
      (6,
       $p6$lower\(coalesce\(bs\.gloss_vi, ''\)\) like '%' \|\| lower\(trim\(p_q\)\) \|\| '%'$p6$,
       $r6$lower(coalesce(bs.gloss_vi, '')) like '%' || lower(trim(p_q)) || '%'
              -- ... or the query holds the gloss as a whole word, which is how a
              -- one-word gloss answers a longer query. Tone marks are the only thing
              -- separating the words for dog and for market here: both normalise to
              -- "cho" and every tier above scores them the same.
              or (length(coalesce(bs.gloss_vi, '')) >= 2
                  and ' ' || lower(trim(p_q)) || ' ' like '%' || ' ' || btrim(regexp_replace(lower(bs.gloss_vi), '\\s*\\(.*$', ''), ' .,;:!?') || ' ' || '%')$r6$,
       2),

      -- The exact tier reads the gloss the same way, so a trailing period or a
      -- bracket no longer decides it. Fixed here rather than in the
      -- gloss_vi_normalized generated column, because changing that column rewrites
      -- the senses table and its trigram index on a Free-plan instance already short
      -- of disk.
      (7, $p7$case when s\.gloss_vi_normalized = \(select q_norm from q\) then 5\.0$p7$,
          $r7$case when btrim(regexp_replace(s.gloss_vi_normalized, '\\s*\\(.*$', ''), ' .,;:!?') = (select q_norm from q) then 5.0$r7$,
          2),

      -- And the candidate test, so a gloss the scoring would now credit is actually
      -- offered to it. Long branch only: a one- or two-syllable query already reaches
      -- these rows through the word boundary, since the bracket follows a space.
      (8,
       $p8$or s\.gloss_vi_normalized operator\(extensions\.%\) \(select q_norm from q\) \)$p8$,
       $r8$or s.gloss_vi_normalized operator(extensions.%) (select q_norm from q)
            -- ... or the gloss, with its bracketed definition removed, is one word of the
            -- query. Spanish and English glosses often carry the definition inline: gato
            -- reads "meo (gioi tinh khong xac dinh)" and perro "cho (loai canis
            -- familiaris ...)", which nothing above can see through, so "con meo" and
            -- "con cho" never reached them. 2,480 senses of 117,972 are shaped this way.
            -- idx_lex_senses_gloss_vi_head indexes this exact expression.
            or btrim(regexp_replace(s.gloss_vi_normalized, '\\s*\\(.*$', ''), ' .,;:!?')
               = any (string_to_array((select q_norm from q), ' ')) )$r8$,
       1),

      -- `ranked` no longer cuts anything; per_lang does. The comment above it is part
      -- of the live definition and would now be describing code that moved.
      (9,
       $p9$  -- Rank and cut to p_limit before touching pronunciations or the entry's own$p9$,
       $r9$  -- Rank here and cut in per_lang below, before touching pronunciations or the own$r9$,
       2),

      -- Tone marks, judged once for every tier rather than inside each one. A gloss
      -- reaching the query only because the marks were folded away is a different
      -- Vietnamese word, and -1.5 drops it under the floor without erasing it, which
      -- leaves room for the spelling variants the language really has.
      -- The tone key of the query, once per call rather than once per candidate row.
      (10,
       $p10$lower\(extensions\.immutable_unaccent\(trim\(p_q\)\)\) as q_norm$p10$,
       $r10$lower(extensions.immutable_unaccent(trim(p_q))) as q_norm,
      lex.tone_key(trim(p_q)) as q_tone$r10$,
       2),

      -- Tone marks, judged once for every tier rather than inside each one. A gloss
      -- reaching the query only because the marks were folded away is a different
      -- Vietnamese word, and -1.5 drops it under the floor without erasing it, which
      -- leaves room for the spelling variants the language really has.
      (11,
       $p11$\+ case when lower\(coalesce\(bs\.gloss_vi, ''\)\) like.*?then 0\.5 else 0 end$p11$,
       $r11$+ case
              -- A query typed without marks proves nothing about tone, and an entry
              -- matched through gloss_vi_all carries no curated gloss to compare against.
              when bs.gloss_vi is null or lower(trim(p_q)) = (select q_norm from q) then 0
              -- The raw spellings already agree, which is the ordinary case and costs
              -- two string comparisons. lex.tone_key below is only reached by a row about
              -- to be penalised: it splits and rewrites the gloss, and the candidate
              -- set for a two-character query runs to thousands of rows.
              when lower(bs.gloss_vi) like '%' || lower(trim(p_q)) || '%'
                   or ' ' || lower(trim(p_q)) || ' ' like '%' || ' ' || btrim(regexp_replace(lower(bs.gloss_vi), '\\s*\\(.*$', ''), ' .,;:!?') || ' ' || '%'
                then 0.5
              -- The marks agree: the query holds the gloss as a whole word, which is how a
              -- one-word gloss answers a longer query, or the gloss holds the query.
              -- lex.tone_key reads "hoà bình" and "hòa bình" as one word, because the tone
              -- sits on either vowel of a diphthong, and still keeps ăn, án and ấn apart.
              when greatest(coalesce(bs.score, 0), coalesce(ah.score, 0)) >= 3.0
                   -- Under the structural tiers the row sits below the floor whatever
                   -- this decides, and lex.tone_key is the expensive half of the test.
                   and (' ' || (select q_tone from q) || ' ' like '%' || ' ' || lex.tone_key(btrim(regexp_replace(bs.gloss_vi, '\\s*\\(.*$', ''), ' .,;:!?')) || ' ' || '%'
                        or lex.tone_key(bs.gloss_vi) like '%' || (select q_tone from q) || '%')
                then 0.5
              -- Otherwise they are different words folded into one string: "ăn" reached
              -- 按 and 压, "cái bàn" reached bán and bẩn, "con chó" reached 市 "chợ".
              else -1.5 end$r11$,
       2),

      -- The sense-position penalty 0023 set at 0.4 could only reorder inside a tier.
      (12,
       $p12$0\.4 \* \(1 - 1 / sqrt$p12$,
       $r12$1.2 * (1 - 1 / sqrt$r12$,
       2),

      (13,
       $p13$-- Capped at 0\.4 so it only reorders inside a score tier, never across one\.$p13$,
       $r13$-- The weight also has to cross a tier: "bầu trời" is sense 13 of element and
       -- sense 28 of blue, both whole-gloss matches at 5.0, and both outranked
       -- sense 1 of sky until this rose from 0.4 to 1.2.$r13$,
       2)
    ) as t(ord, pattern, replacement, expected)
    order by 1
  loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'lex' and p.proname = 'search_vi';
    if def is null then raise exception 'lex.search_vi not found'; end if;

    hits := (select count(*) from regexp_matches(def, step.pattern, 'g'));
    if hits <> step.expected then
      raise exception 'lex.search_vi step %: expected % hits, found %',
        step.ord, step.expected, hits;
    end if;

    execute regexp_replace(def, step.pattern, step.replacement, 'g');
  end loop;
end
$mig$;

-- Creating an expression index does not collect statistics for the expression, and
-- without them the planner mis-sizes the new OR branch and hashes all 36,361 entry
-- rows instead of looking them up by primary key. Measured on "bau troi": 2,093 ms
-- and 27,215 buffers before this line, 165 ms and 3,649 buffers after.
analyze lex.senses;

-- `create or replace function` keeps existing grants, but 0042 and 0045 restated them
-- after the same kind of transform and nothing in CI would catch a lost one.
grant execute on function lex.search_vi(text, text[], int) to anon, authenticated, service_role;
