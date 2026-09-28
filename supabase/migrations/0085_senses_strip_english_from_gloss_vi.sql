-- 0085_senses_strip_english_from_gloss_vi.sql
-- Removes English words left inside the Vietnamese gloss (#53).
--
-- The machine translation that filled lex.senses.gloss_vi was stored without being compared
-- with its input, so a `;`-separated element of gloss_vi could equal an element of gloss_en:
-- zh:一个 read "a; an; một" and ranked first for "an" in lex.search_vi. Measured on
-- production on 2026-09-29, over senses without a lex.sense_labels row whose fixed_at is set
-- and without provenance.learner_fix, the learner layer's reviewed gloss (0076).
--
-- | Path | en | es | zh | Total |
-- | --- | --- | --- | --- | --- |
-- | Restore provenance.gloss_vi_before, the value before the AI rewrite made it English | 3 | 21 | 0 | 24 |
-- | Strip: the English elements are removed, the Vietnamese ones kept | 17 | 1 | 7 | 25 |
-- | Retranslate gloss_en through Azure AI Translator | 8 | 15 | 16 | 39 |
-- | Left unchanged: Azure answered the English itself, or worse | 42 | 84 | 31 | 157 |
--
-- gloss_vi_before is restored only when no element of it equals an element of gloss_en.
-- A strip result that was punctuation, under 3 characters or still English, and the Spanish
-- Greek-letter senses ("eta; chữ Hy Lạp η"), were retranslated instead. An element of Azure's
-- answer equal to an element of gloss_en, ignoring case, was dropped, so names such as
-- Afghanistan, Wikipedia and York keep their gloss.
--
-- The update skips a sense whose gloss_vi changed since it was measured, or that the learner
-- layer has fixed since, so it is idempotent against the target state. lex.gloss_terms is
-- rebuilt by its triggers.
--
-- TO ROLL BACK: run s3://zhesen-infra-assets-014498663963/data-loads/issue53-undo.sql, which
-- sets each gloss_vi back to its value before this migration where it still holds the value
-- written here, and restores gloss_vi_is_mt.
update lex.senses s set gloss_vi = v.after, gloss_vi_is_mt = true
from (values
('en:CAT#3d8fded747', 'Canadian Achievement Tests', 'Bài kiểm tra thành tích Canada'),
('en:CAT#b0f14afcd5', 'Cambridge Antibody Technology', 'Công nghệ Kháng thể Cambridge'),
('en:CAT#f76e9a6766', 'Citizens Area Transit', 'Giao thông Khu vực Công dân'),
('en:Manila#86890fd86a', 'Venerupis philippinarum; một loài nghêu Thái Bình Dương.', 'một loài nghêu Thái Bình Dương.'),
('en:b#10', 'barn', 'bácnơ'),
('en:blah#1', 'Vô nghĩa; drivel; nhàn rỗi, nói chuyện vô nghĩa.', 'Vô nghĩa; nhàn rỗi, nói chuyện vô nghĩa.'),
('en:bubbles#2', 'Rượu vang sủi tăm; champagne.', 'Rượu vang sủi tăm'),
('en:ethiopia#2', 'Đế quốc Ethiopia, từ khoảng năm 1270 đến 1974; Abyssinia.', 'Đế quốc Ethiopia, từ khoảng năm 1270 đến 1974'),
('en:ethiopia#4', 'Chính phủ Quân sự Lâm thời của Ethiopia Xã hội chủ nghĩa, từ năm 1974 đến 1987; Derg.', 'Chính phủ Quân sự Lâm thời của Ethiopia Xã hội chủ nghĩa, từ năm 1974 đến 1987'),
('en:fist#14', 'Hành động xì hơi; fise.', 'Hành động xì hơi'),
('en:heath#1', 'Một vùng đất hoang hoá bằng phẳng với đất cát và thảm thực vật bụi bặm; heathland.', 'Một vùng đất hoang hoá bằng phẳng với đất cát và thảm thực vật bụi bặm'),
('en:indianapolis#2', 'IMS; Ellipsis của Indianapolis Motor Speedway ("The Brickyard").', 'Ellipsis của Indianapolis Motor Speedway ("The Brickyard").'),
('en:ki#2', 'Một loài thực vật bản địa của các đảo Thái Bình Dương và Trung Quốc (Cordyline fruticosa); ti.', 'Một loài thực vật bản địa của các đảo Thái Bình Dương và Trung Quốc (Cordyline fruticosa)'),
('en:min#10', 'minoxidil', 'thuốc minoxidil'),
('en:mont#1', 'mount; ) Tôi không biết.', 'núi'),
('en:picky#1', 'Fussy; đặc biệt; Đòi hỏi những điều đúng đắn.', 'đặc biệt; Đòi hỏi những điều đúng đắn.'),
('en:putin#2', 'Vladimir Putin', 'Tổng thống Nga, 2012–nay'),
('en:quo#1', 'quoth', 'nói'),
('en:raj#1', 'Reign; Quy tắc.', 'Quy tắc.'),
('en:reps#1', 'Rep.', 'Dân biểu'),
('en:sketch#14', 'Phát xít hoặc có liên hệ cánh hữu hoặc tân phát xít; NSBM.', 'Phát xít hoặc có liên hệ cánh hữu hoặc tân phát xít'),
('en:stars in one''s eyes#8b88f9fba3', 'The state of being overly or extremely impressed with something; enchanted with romance', 'Trạng thái bị ấn tượng quá mức hoặc cực kỳ ấn tượng với một điều gì đó; bị mê hoặc bởi sự lãng mạn.'),
('en:tearing#6', 'Liên tục rơi nước mắt; epiphora', 'Liên tục rơi nước mắt'),
('en:unto#3', 'To; chỉ ra một đối tượng gián tiếp.', 'chỉ ra một đối tượng gián tiếp.'),
('en:vent#5', 'Lỗ tiết của các loài động vật có xương sống thấp hơn; cloaca.', 'Lỗ tiết của các loài động vật có xương sống thấp hơn'),
('en:w#6', 'watt', 'oát'),
('en:wacky#1', 'Zany; lập dị.', 'lập dị.'),
('en:zip#2', 'Năng lượng; sức sống; vim.', 'Năng lượng; sức sống'),
('es:Benjamín#1', 'Benjamin', 'Ben-gia-min'),
('es:Cáucaso#1', 'Caucasus', 'Kavkaz'),
('es:Isis#1', 'Isis', 'nữ thần Isis'),
('es:Lutero#1', 'Luther', 'Luthơ'),
('es:Platón#1', 'Plato', 'Platon'),
('es:Zeus#1', 'Zeus', 'thần Zeus'),
('es:ajá#1', 'aha', 'a ha'),
('es:alfa#1', 'alpha', 'chữ cái Hy Lạp Α, α'),
('es:aurora#3', 'Aurora', 'Cực quang'),
('es:bolos#1', 'bowling', 'chơi bowling'),
('es:caballo#3', 'heroin', 'hê-rô-in'),
('es:capitolio#1', 'Capitol', 'Điện Capitol'),
('es:celta#2', 'Celt', 'người Celt'),
('es:cocaína#1', 'cocaine', 'cocain'),
('es:eta#1', 'eta; chữ Hy Lạp η', 'chữ cái Hy Lạp Η, η'),
('es:flechero#1', 'fletcher', 'người làm lông vỗ'),
('es:gamma#1', 'gamma', 'chữ cái Hy Lạp Γ, γ'),
('es:gorja#1', 'gorge; gullet; cổ họng', 'cổ họng'),
('es:harina#2', 'cocaine', 'cô-ca-in'),
('es:heroína#2', 'heroin', 'hêrôin'),
('es:hormona#1', 'hormone', 'hoocmon'),
('es:jazz#1', 'jazz', 'nhạc jazz'),
('es:jerez#1', 'sherry', 'rượu sherry'),
('es:lux#1', 'lux', 'luxơ'),
('es:macro#1', 'macro', 'vĩ lệnh'),
('es:mesías#2', 'Messiah', 'Đấng Cứu Thế, Đấng Messiah'),
('es:modernillo#1', 'hipster', 'người theo phong cách hipster'),
('es:mordaza#1', 'gag', 'bịt miệng'),
('es:módem#1', 'modem', 'bộ điều giải'),
('es:nova#1', 'nova', 'tân tinh'),
('es:odisea#2', 'Odyssey', 'sử thi Odyssey, chuyến phiêu lưu mạo hiểm, cuộc gian truân'),
('es:omega#1', 'omega; chữ Hy Lạp Ω, ω', 'chữ cái Hy Lạp Ω, ω'),
('es:paltón#1', 'snob', 'người kiêu căng'),
('es:pizarrero#1', 'slater', 'thợ slater'),
('es:plasma#1', 'plasma', 'huyết tương'),
('es:reggae#1', 'reggae', 'nhạc reggae'),
('es:tenor#1', 'tenor', 'giọng nam cao'),
('zh:一个:s1', 'a; an; một', 'một'),
('zh:住宅:s1', 'nơi cư trú; đang ở; abode', 'nơi cư trú; đang ở'),
('zh:你好:s1', 'Xin chào; hi', 'Xin chào'),
('zh:勘误表:s1', 'corrigenda', 'bản đính chính'),
('zh:可:s1', '(tiền tố) có thể; có thể; -able', '(tiền tố) có thể; có thể'),
('zh:咖啡店:s1', 'café', 'quán cà phê'),
('zh:噢:s1', 'oh; ah (dùng để chỉ hiện thực hoá)', 'ah (dùng để chỉ hiện thực hoá)'),
('zh:如:s1', 'as', 'như vậy'),
('zh:射流:s1', 'jet (math.)', 'Jet (toán học)'),
('zh:小袋鼠:s1', 'wallaby', 'chuột túi wallaby'),
('zh:干部:s1', 'cadre', 'cán bộ'),
('zh:意大利:s1', 'Italy', 'Ý'),
('zh:本人:s1', 'I; tôi; Bản thân tôi', 'tôi; Bản thân tôi'),
('zh:案件:s1', 'case', 'vụ án'),
('zh:棉花:s1', 'cotton', 'bông'),
('zh:湾:s1', 'bay', 'vịnh'),
('zh:澳大利亚:s1', 'Australia', 'Úc'),
('zh:澳洲:s1', 'Australia', 'Úc'),
('zh:码:s1', '(archaic) agate', '(cổ xưa) mã não'),
('zh:磨坊:s1', 'mill', 'cối xay'),
('zh:邪恶:s1', 'sinister', 'hiểm ác'),
('zh:集市:s1', 'thị trường; bazaar; công bằng', 'thị trường; công bằng'),
('zh:魔兽世界:s1', 'World of Warcraft (video game)', 'World of Warcraft (trò chơi điện tử)')
) as v(id, before, after)
where s.id = v.id and s.gloss_vi = v.before and not (s.provenance ? 'learner_fix');

insert into supabase_migrations.schema_migrations (version, name)
values ('20260929000002', 'senses_strip_english_from_gloss_vi')
on conflict (version) do nothing;
