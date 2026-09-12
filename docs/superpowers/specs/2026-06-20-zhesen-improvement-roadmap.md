# Zhesen — Lộ trình cải thiện (tổng hợp từ workflow audit, 2026-06-20)

> **Trạng thái, cập nhật 2026-09-12: cả mười hai mục F1-F12 đã làm xong.** Tài liệu
> này giữ lại làm hồ sơ của đợt khảo sát tháng Sáu, không còn là danh sách việc cần
> làm. Kiểm chứng từng mục trong mã hiện tại:
>
> | Mục | Ở đâu trong mã |
> | --- | --- |
> | F1 giọng đọc | `components/ui/AudioButton.tsx` (bộ nhớ đệm giọng qua Promise, `voiceschanged` + hạn 1s, chọn giọng theo BCP-47; từ 2026-09-12 còn từ chối đọc khi máy không có giọng đúng ngôn ngữ) |
> | F2 OGG/CORS | cùng file: `canPlay()` kiểm `canPlayType` cho `.ogg`, `crossOrigin`, vòng quay `aria-busy` |
> | F3, F5 giọng vùng | `lib/dictionary/pronunciation.ts` `pickAccentRows`, hiển thị ở `components/lookup/Pronunciation.tsx` |
> | F4 phông IPA | lớp `.ipa` trong `app/globals.css`, không dùng `font-mono` nữa |
> | F6 gom nghĩa | `components/lookup/SenseList.tsx` (hiện 3 nghĩa, còn lại sau một cú bấm) |
> | F7 lọc ví dụ hỏng | `lib/dictionary/textQuality.ts` `isCleanExample` |
> | F8 tách hai bảng | `components/lookup/RelatedWords.tsx` và `WordFamily.tsx` là hai thành phần riêng |
> | F9 thanh điều hướng | `components/layout/SiteHeader.tsx`, gắn ở `app/layout.tsx` |
> | F10 tìm ở trang chủ | `app/page.tsx` dùng `SearchBox`, nhận diện ngôn ngữ ở `lib/dictionary/detect.ts` |
> | F11 route có cache | `app/dictionary/search/route.ts` (`unstable_cache`), huỷ yêu cầu cũ ở `SearchBox.tsx:83` |
> | F12 nạp trước | `SearchBox.tsx:210` `router.prefetch` khi rê chuột |
>
> Việc tiếp theo không nằm ở đây. Xem `2026-09-12-zhesen-restart-design.md`.


Nguồn: 6 agent chẩn đoán (bám code+DB thật) + 5 agent nghiên cứu nền tảng + tổng hợp.

## Phát hiện chính
- Audio: chỉ 9.5% từ EN (es 0.9%, zh 0%) có audio thật; còn lại fallback TTS trình duyệt gọi sai cách (không chờ voiceschanged, không gán voice) → chập chờn. File audio là .ogg Wikimedia (Safari/iOS không phát). 1 dòng en-UK trỏ nhầm En-au-lord.ogg.
- Hiệu năng: search/tap gọi browser client thẳng lên Supabase (Seoul, ap-northeast-2) mỗi keystroke, không cache.
- Ví dụ: ~837 câu EN thiếu space (data pipeline).
- IPA: dùng font-mono (Geist Mono) → dấu phụ IPA lệch/xấu.
- Từ chi tiết: lex_relations 96% là derived (catch-all, related_entry_id rỗng); word-family thật nằm ở inflections; không có tín hiệu xếp hạng nghĩa.

## Fix tức thì (F1–F12)

### F1 [M] F1 Harden TTS engine
- Thay đổi: Module voice cache via Promise (voiceschanged+1s timeout); speak() picks BCP-47 voice; drive loading from onstart/onend/onerror not finally; cancel() only if active. Root AudioButton.tsx:11,12-14,20-31
- Files: components/AudioButton.tsx
- Verify: First play after hard-reload works; 3 rapid clicks not swallowed; ZH uses zh-CN voice

### F2 [M] F2 Fix recorded-audio OGG/CORS + spinner
- Thay đổi: crossOrigin=anonymous preload=metadata; canPlayType empty (OGG Safari) fallback TTS; spinner+aria-busy. Root :22-27 empty catch
- Files: components/AudioButton.tsx
- Verify: Safari .ogg falls back; Chrome plays file; spinner clears on real start

### F3 [M] F3 Real accent pick + UK/US buttons
- Thay đổi: Accent-aware picker replacing search.ts:50; add audioUrlUS/UK; LookupHero renders UK/US; ExampleList passes audioUrl/lang. Root en-UK row points En-au-lord.ogg
- Files: lib/dictionary/search.ts, lib/dictionary/types.ts, components/lookup/LookupHero.tsx, components/lookup/ExampleList.tsx
- Verify: Open development: UK and US rows play correct accent; example button plays sentence

### F4 [M] F4 Self-hosted IPA font over font-mono
- Thay đổi: SIL OFL via next/font/local subset; fonts.ts exports ipaFont; declare in theme inline; replace font-mono everywhere, wrap slashes. Root globals.css:12, LookupHero.tsx:22
- Files: app/fonts.ts, app/layout.tsx, app/globals.css, components/lookup/LookupHero.tsx, app/wordlist/WordlistClient.tsx, components/wordlist/WordDetail.tsx, app/dictionary/DictionarySearch.tsx, components/reader/WordPopover.tsx
- Verify: Open and/the/family: diacritics positioned correctly on Windows/Android

### F5 [M] F5 Multi-accent IPA rows in hero
- Thay đổi: PronunciationRows.tsx + buildPronunciations collapse UK/US/Pinyin; replace LookupHero.tsx:22 single IPA. Root pickIpa collapses, drops en-UK/US
- Files: components/lookup/PronunciationRows.tsx, components/lookup/LookupHero.tsx, lib/dictionary/search.ts
- Verify: development shows UK and US rows; ZH shows Pinyin; ES Spain row

### F6 [S] F6 Collapse to top 2-3 senses by POS
- Thay đổi: pickSenses(max=3) sort senseOrder, glossVi tiebreaker, keep POS; rest in details/summary. Root getEntryDetail:130 renders all (development 11; ranking NULL)
- Files: components/lookup/SenseList.tsx, lib/dictionary/search.ts
- Verify: development shows 2-3 then expander to 11

### F7 [S] F7 Defensive filter for corrupt examples
- Thay đổi: isLikelyCorrupt (camelCase, token>=19); tatoeba before cambridge, cap 3-5; not for ZH/ES. Root 1092 EN despaced (98.4% cambridge)
- Files: lib/dictionary/search.ts, components/lookup/ExampleList.tsx
- Verify: EN polysemy words show non-run-together sentences

### F8 [L] F8 Split RelatedWords + word family
- Thay đổi: family.ts getWordFamily (inflections); relations.ts classifyRelations (space/hyphen=compounds; same-stem single=derived; keep synonym/antonym); rewrite LookupView sections; chips searchPath. Root RelatedWords.tsx:22 lumps; related_entry_id 0%
- Files: lib/dictionary/family.ts, lib/dictionary/relations.ts, components/lookup/WordFamily.tsx, components/lookup/CompoundList.tsx, components/lookup/RelatedWords.tsx, components/lookup/LookupView.tsx
- Verify: development: word-family separate from derived and compounds; synonyms/antonyms own section

### F9 [S] F9 Global header + home/logo button
- Thay đổi: SiteHeader.tsx usePathname logo + nav active; mount in layout.tsx; remove back-link LookupView.tsx:18. Root layout.tsx:30 children-only
- Files: components/SiteHeader.tsx, app/layout.tsx, components/lookup/LookupView.tsx, app/dictionary/page.tsx
- Verify: Header on every page; logo returns home; nav shows active route

### F10 [M] F10 Home search + auto-detect
- Thay đổi: Extract SearchBox island (debounce 250ms, group by lang, drop autoFocus:47); searchAllLanguages + detect.ts (Han=zh, ES diacritics=es, else en) order groups; mount in page.tsx. Root DictionarySearch.tsx:15,38-47; search.ts:63 eq(lang)
- Files: components/search/SearchBox.tsx, app/dictionary/DictionarySearch.tsx, lib/dictionary/detect.ts, app/page.tsx
- Verify: Home has search; real shows EN/ES groups; Han shows ZH first; no focus steal

### F11 [L] F11 Cached search route + AbortController + index
- Thay đổi: search/route.ts unstable_cache (lang,prefix) tag lex + Cache-Control swr; SearchBox fetch()+AbortController+Map; ilike(headword_normalized); migration index headword_normalized text_pattern_ops + form_text. Root DictionarySearch.tsx:14,25 Seoul; search.ts:64 Seq Scan
- Files: app/dictionary/search/route.ts, components/search/SearchBox.tsx, lib/dictionary/search.ts, supabase/migrations/0004_lex_search_index.sql
- Verify: Retyped prefix no new request; fast typing no out-of-order; EXPLAIN Index Scan

### F12 [S] F12 Prefetch detail on hover
- Thay đổi: router.prefetch(entryPath(id)) onMouseEnter/onFocus on result rows and tappable words. Root only prefetched when Link in viewport
- Files: components/search/SearchBox.tsx, components/reader/TappableText.tsx
- Verify: Hover then click navigates near-instant

## Tính năng ngắn hạn (từ nghiên cứu)
- [M] guideWord+CEFR signposts; examples-to-senses+filter; LingQ reader coloring; FSRS via ts-fsrs; streak+XP; ZH stroke-order (Hanzi Writer); clickable chars+Han-Viet search; fill-in-blank/sentence-def quiz; audio everywhere — Distilled from Cambridge/Oxford/Longman/LingQ/Anki/Duolingo/Vocabulary.com/Hanzii/Pleco; reuse sense_id/user_words.status/audio_url/inflections so EN ships now, ES/ZH need data

## Ghi chú tổng hợp
Bigger bets: cloud-TTS MP3 (UK+US+ZH) in Supabase Storage (only reliable cross-device audio, only ZH coverage); OPUS EN-VI backfill via quality gate; aggregated Review hub + CEFR dashboard; Quizlet Match+Test. Data actions (zhesen-pipeline): fix Cambridge scraper (get_text separator) + ingest assertion; is_corrupt flag + backfill (wordninja high-freq, hide rest); quality gate (spacing/length-ratio/language-detect/dedupe/drop-vulgar); re-source Tatoeba/Kaikki; enrich real audio (re-host OGG to MP3, Forvo, cloud TTS incl ZH, fix en-UK row pointing En-au-lord.ogg); ZH pinyin + Simp/Trad normalize; enrich senses guideWord/CEFR/register (NULL across 15538) + gloss_vi for ES/ZH. Open questions: audio source choice; 837 corrupt examples reconstruct-vs-hide; pipeline repo access; headword_normalized key for accented Spanish; EN-first vs ES/ZH-first; confirm auto-detect search-all-3-and-group; null-out old .ogg URLs. Sequence: audio+IPA (F1-F5), then IA+nav (F6,F8,F9,F10), then performance (F11,F12) before corpus grows.
