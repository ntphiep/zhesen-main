insert into public.languages (code, name, native_name, script) values
  ('zh','Tiếng Trung','中文','han'),
  ('es','Tiếng Tây Ban Nha','Español','latin'),
  ('en','Tiếng Anh','English','latin')
on conflict (code) do nothing;

insert into public.vocab_items (id, lang, term, reading, translation, level) values
  ('zh-1','zh','你好','nǐ hǎo','{"vi":"xin chào"}','HSK1'),
  ('zh-2','zh','谢谢','xiè xie','{"vi":"cảm ơn"}','HSK1'),
  ('zh-3','zh','再见','zài jiàn','{"vi":"tạm biệt"}','HSK1'),
  ('zh-4','zh','对不起','duì bu qǐ','{"vi":"xin lỗi"}','HSK1'),
  ('zh-5','zh','请','qǐng','{"vi":"làm ơn / mời"}','HSK1'),
  ('es-1','es','hola',null,'{"vi":"xin chào"}','A1'),
  ('es-2','es','gracias',null,'{"vi":"cảm ơn"}','A1'),
  ('es-3','es','adiós',null,'{"vi":"tạm biệt"}','A1'),
  ('es-4','es','perdón',null,'{"vi":"xin lỗi"}','A1'),
  ('es-5','es','por favor',null,'{"vi":"làm ơn"}','A1'),
  ('en-1','en','hello',null,'{"vi":"xin chào"}','A1'),
  ('en-2','en','thank you',null,'{"vi":"cảm ơn"}','A1'),
  ('en-3','en','goodbye',null,'{"vi":"tạm biệt"}','A1'),
  ('en-4','en','sorry',null,'{"vi":"xin lỗi"}','A1'),
  ('en-5','en','please',null,'{"vi":"làm ơn"}','A1')
on conflict (id) do nothing;

insert into public.lessons (id, lang, title, description, position) values
  ('zh-l1','zh','Chào hỏi cơ bản','Những câu chào thông dụng.',1),
  ('es-l1','es','Chào hỏi cơ bản','Những câu chào thông dụng.',1),
  ('en-l1','en','Chào hỏi cơ bản','Những câu chào thông dụng.',1)
on conflict (id) do nothing;

insert into public.lesson_vocab (lesson_id, vocab_id, position) values
  ('zh-l1','zh-1',1),('zh-l1','zh-2',2),('zh-l1','zh-3',3),('zh-l1','zh-4',4),('zh-l1','zh-5',5),
  ('es-l1','es-1',1),('es-l1','es-2',2),('es-l1','es-3',3),('es-l1','es-4',4),('es-l1','es-5',5),
  ('en-l1','en-1',1),('en-l1','en-2',2),('en-l1','en-3',3),('en-l1','en-4',4),('en-l1','en-5',5)
on conflict (lesson_id, vocab_id) do nothing;
