-- Seed Vietnamese/English glosses for common closed-class proper nouns that the
-- pipeline imported without any senses (285 EN entries have zero senses; this fills
-- the high-frequency, unambiguous ones: months, weekdays, continents, major
-- countries, nationalities/languages, and a couple of holidays). These translations
-- are hand-curated (not MT), so gloss_vi_is_mt stays false.
--
-- Idempotent: only inserts for an entry that EXISTS and currently has no sense, so
-- re-running is safe and it never collides with senses the pipeline adds later.
-- The long tail (personal names, US states/cities, brands) is left to the pipeline
-- (see docs/superpowers/specs/2026-06-21-chesen-pipeline-data-fixes-handoff.md).

insert into lex.senses (id, entry_id, sense_order, pos, gloss_vi, gloss_en, gloss_vi_is_mt, provenance)
select e.id || '#1', e.id, 1, v.pos, v.gloss_vi, v.gloss_en, false,
       '{"source":"curated-seed-0009"}'::jsonb
from (values
  -- months
  ('january','noun','tháng Một, tháng Giêng','January (first month of the year)'),
  ('february','noun','tháng Hai','February'),
  ('march','noun','tháng Ba','March'),
  ('april','noun','tháng Tư','April'),
  ('may','noun','tháng Năm','May'),
  ('june','noun','tháng Sáu','June'),
  ('july','noun','tháng Bảy','July'),
  ('august','noun','tháng Tám','August'),
  ('september','noun','tháng Chín','September'),
  ('october','noun','tháng Mười','October'),
  ('november','noun','tháng Mười Một','November'),
  ('december','noun','tháng Mười Hai','December'),
  -- weekdays
  ('monday','noun','thứ Hai','Monday'),
  ('tuesday','noun','thứ Ba','Tuesday'),
  ('wednesday','noun','thứ Tư','Wednesday'),
  ('thursday','noun','thứ Năm','Thursday'),
  ('friday','noun','thứ Sáu','Friday'),
  ('saturday','noun','thứ Bảy','Saturday'),
  ('sunday','noun','Chủ Nhật','Sunday'),
  -- continents
  ('europe','noun','châu Âu','Europe'),
  ('asia','noun','châu Á','Asia'),
  ('africa','noun','châu Phi','Africa'),
  ('america','noun','nước Mỹ; châu Mỹ','America; the United States'),
  -- countries
  ('england','noun','nước Anh','England'),
  ('britain','noun','nước Anh, Vương quốc Anh','Britain'),
  ('australia','noun','nước Úc','Australia'),
  ('france','noun','nước Pháp','France'),
  ('russia','noun','nước Nga','Russia'),
  ('germany','noun','nước Đức','Germany'),
  ('italy','noun','nước Ý','Italy'),
  ('spain','noun','Tây Ban Nha','Spain'),
  ('portugal','noun','Bồ Đào Nha','Portugal'),
  ('greece','noun','Hy Lạp','Greece'),
  ('poland','noun','Ba Lan','Poland'),
  ('sweden','noun','Thụy Điển','Sweden'),
  ('norway','noun','Na Uy','Norway'),
  ('switzerland','noun','Thụy Sĩ','Switzerland'),
  ('belgium','noun','nước Bỉ','Belgium'),
  ('ireland','noun','Ai-len','Ireland'),
  ('scotland','noun','Scotland','Scotland'),
  ('netherlands','noun','Hà Lan','the Netherlands'),
  ('israel','noun','Israel','Israel'),
  ('egypt','noun','Ai Cập','Egypt'),
  ('mexico','noun','Mexico','Mexico'),
  ('cuba','noun','Cuba','Cuba'),
  ('argentina','noun','Argentina','Argentina'),
  ('korea','noun','Hàn Quốc; Triều Tiên','Korea'),
  ('japan','noun','Nhật Bản','Japan'),
  ('china','noun','Trung Quốc','China'),
  ('vietnam','noun','Việt Nam','Vietnam'),
  ('thailand','noun','Thái Lan','Thailand'),
  ('malaysia','noun','Malaysia','Malaysia'),
  ('singapore','noun','Singapore','Singapore'),
  ('indonesia','noun','Indonesia','Indonesia'),
  ('philippines','noun','Philippines','the Philippines'),
  ('india','noun','Ấn Độ','India'),
  ('pakistan','noun','Pakistan','Pakistan'),
  ('iran','noun','Iran','Iran'),
  ('iraq','noun','Iraq','Iraq'),
  ('syria','noun','Syria','Syria'),
  ('afghanistan','noun','Afghanistan','Afghanistan'),
  ('ukraine','noun','Ukraine','Ukraine'),
  ('nigeria','noun','Nigeria','Nigeria'),
  ('kenya','noun','Kenya','Kenya'),
  ('canada','noun','Canada','Canada'),
  ('brazil','noun','Brazil','Brazil'),
  -- nationalities / languages
  ('american','adjective','(thuộc) Mỹ; người Mỹ','American'),
  ('british','adjective','(thuộc) Anh; người Anh','British'),
  ('english','adjective','(thuộc) Anh; tiếng Anh; người Anh','English'),
  ('european','adjective','(thuộc) châu Âu; người châu Âu','European'),
  ('chinese','adjective','(thuộc) Trung Quốc; tiếng Trung; người Trung Quốc','Chinese'),
  ('japanese','adjective','(thuộc) Nhật Bản; tiếng Nhật; người Nhật','Japanese'),
  ('korean','adjective','(thuộc) Hàn Quốc; tiếng Hàn; người Hàn','Korean'),
  ('russian','adjective','(thuộc) Nga; tiếng Nga; người Nga','Russian'),
  ('french','adjective','(thuộc) Pháp; tiếng Pháp; người Pháp','French'),
  ('italian','adjective','(thuộc) Ý; tiếng Ý; người Ý','Italian'),
  ('australian','adjective','(thuộc) Úc; người Úc','Australian'),
  ('canadian','adjective','(thuộc) Canada; người Canada','Canadian'),
  ('mexican','adjective','(thuộc) Mexico; người Mexico','Mexican'),
  ('brazilian','adjective','(thuộc) Brazil; người Brazil','Brazilian'),
  ('irish','adjective','(thuộc) Ai-len; người Ai-len','Irish'),
  ('scottish','adjective','(thuộc) Scotland; người Scotland','Scottish'),
  ('swedish','adjective','(thuộc) Thụy Điển; tiếng Thụy Điển','Swedish'),
  ('thai','adjective','(thuộc) Thái Lan; tiếng Thái; người Thái','Thai'),
  ('latin','adjective','(thuộc) La-tinh; tiếng La-tinh','Latin'),
  -- holidays
  ('christmas','noun','lễ Giáng Sinh, Nô-en','Christmas'),
  ('halloween','noun','lễ Halloween','Halloween')
) as v(hw, pos, gloss_vi, gloss_en)
join lex.entries e on e.lang = 'en' and e.headword_normalized = v.hw
where not exists (select 1 from lex.senses s where s.entry_id = e.id);
