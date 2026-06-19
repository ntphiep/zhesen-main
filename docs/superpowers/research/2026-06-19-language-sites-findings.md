# Language Lookup Sites — UX Research Findings
**Date:** 2026-06-19  
**Researcher:** UX Research agent (Playwright browser — working)  
**Purpose:** Inform the design of a `/tra-cuu` word-lookup feature for Chesen

---

## 1. hanzii.net — PRIMARY REFERENCE

### Screenshots
- `C:\Users\Hiep\Desktop\chesen\.playwright-mcp\hanzii-hao-top.png` (好 — word page top viewport)
- `C:\Users\Hiep\Desktop\chesen\.playwright-mcp\hanzii-xuexi.png` (学习 — word page top viewport)

### Lookup page anatomy — single character 好 (hǎo / hào)

Two sub-pages under one search: **Từ vựng** (vocabulary) and **Hán tự** (character detail). Navigation tabs also expose: Ví dụ, Ngữ pháp, Kết hợp từ, Trung-Trung, Trung-Anh.

#### Tab: Từ vựng (vocabulary)

1. **Header bar** — headword (simplified + traditional in brackets), reading-mode audio AI button, Hán-Việt reading in brackets `[ hǎo ][ ㄏㄠˇ ][ hảo ]`, add-to-notebook icon.
2. **Multiple pinyin tabs** — 好 has two readings: `hǎo` and `hào`; switching tabs changes all definitions below. Critical for polyphonic characters.
3. **Quick-action row** — Phát âm (pronunciation), Kết hợp từ (collocations), Video, Tin tức; links to rich sub-pages.
4. **Radical + level badge** — "Bộ: NỮ 女" and HSK 1 / TOCFL 1 chip, clickable (filter by level).
5. **In-page anchor menu** — Tính từ, Phó từ, Giới từ, Danh từ, Từ ghép, Từ trái nghĩa, Từ cận nghĩa, Hình ảnh, Độ phổ biến, Góp ý — all anchors within the same page.
6. **Definitions by PoS** — numbered senses, each with: Vietnamese gloss, Chinese explanation (simplified + traditional), example sentence (simplified + traditional) with pinyin and Vietnamese translation, audio button per sentence. Senses 2+ require premium ("Mở khóa").
7. **Từ ghép (compound words)** — numbered list of compounds that contain this character, each with Hán-Việt reading, clickable to their own lookup pages. Preview shows 4; rest locked.
8. **Từ cận nghĩa (near-synonyms)** — list with Hán-Việt: 美 MĨ, 佳 GIAI, 良 LƯƠNG, 吉 CÁT.
9. **Từ trái nghĩa (antonyms)** — 差 SAI, 坏 HOẠI, 糟 TAO, 恶 ÁC.
10. **Stroke animation panel** (right sidebar) — animated stroke order GIF, stroke sequence in notation (`フノ一フ丨一`), 手 writing practice link.
11. **Các từ gợi ý (suggested words)** — 3 related compound words shown as cards with pinyin + Vietnamese gloss; rest locked.

#### Tab: Hán tự (character detail page)

1. **Stroke animation + metadata** — bính âm with audio, hình thái (⿰,女,子), lục thư type (hội ý = ideograph), bộ (radical), số nét (stroke count), nét bút sequence, popularity rating.
2. **Bộ thành phần (component breakdown)** — 1. NỮ 女 / 2. TỬ 子 — each component is a clickable link.
3. **Thành phần của (appears in)** — which larger characters contain this one: NẠO 孬.
4. **Hán Việt readings** — separate collapsible sections per reading (HẢO / HIẾU), each with: từ điển phổ thông (common), từ điển trích dẫn (annotated), từ điển Thiều Chửu (classical); and a Từ ghép list in Hán-Việt.
5. **Ví dụ (examples)** — short usage examples with pinyin and translation.
6. **Góp ý (community notes)** — 15 user-submitted mnemonic stories (up/down voted), e.g. "Phụ nữ bế trẻ con là tốt".
7. **Tự hình (character evolution)** — historical glyphs: Giáp Cốt (~1200 TCN), Kim Văn (~1000 TCN), Chữ lụa thời Sở (~400 TCN), Chữ thẻ tre thời Tần (~300 TCN), Tiểu Triện (~220 TCN). Each is a clickable thumbnail.

### Lookup — compound word 学习 (xuéxí)

Structure is the same as single character, with these differences:
- No polyphonic tab (single reading).
- **Phân biệt từ** section added — "Phân biệt '学' và '学习'" comparing similar words (premium).
- Each component character (学, 习, 學, 習) shown as clickable tabs in the character panel — drilling down into each component's own character page.
- Suggested words are collocations of 学习 (e.g. 终身学习, 学习用功).

---

## 2. dictionary.cambridge.org — English reference

### Screenshot
- `C:\Users\Hiep\Desktop\chesen\.playwright-mcp\cambridge-run.png`

### Lookup page anatomy — "run" (verb)

1. **Headword + PoS** — "run verb", displayed prominently at the top.
2. **IPA with audio buttons** — UK `/rʌn/` 🔊 and US `/rʌn/` 🔊 side by side; separate audio buttons are the standard.
3. **Conjugation summary** — "present participle running | past tense ran | past participle run" inline under the IPA.
4. **Guide word** — semantic category label e.g. "(GO QUICKLY)" disambiguates polysemous entries; clickable sub-heading per sense group.
5. **CEFR level badge** — "A1" chip per sense; crucial for learners to gauge difficulty.
6. **Grammar codes** — `[I or T]` (intransitive or transitive), linked to help page.
7. **Sense definition** — full prose definition linking every content word to its own entry.
8. **Example sentences** — multiple per sense; phrasal verb variants shown inline (run away, run off, run up to, run against).
9. **Word list button** — "Add to word list" per sense — personalisation feature.
10. **Tabs within the page** — the word "run" has so many senses that Cambridge uses a scrollable in-page tab/anchor bar: GO QUICKLY, MANAGE, COMPUTER, etc.
11. *(Below fold, not captured in screenshot)* — Word family, Synonyms, Translations (other dictionaries), Phrasal verbs listed separately.

Key design principle: **guide words as semantic scoping** — never show a flat list of 50 senses; group them under guide words so the learner finds the right cluster fast.

---

## 3. bab.la — Spanish↔English (babla.vn/es.bab.la both redirected; used en.bab.la)

**Note:** babla.vn returned 404 for the Spanish-Vietnamese path; es.bab.la redirected to its translator page. Successfully accessed **en.bab.la/dictionary/spanish-english/hablar**. The Vietnamese-specific interface was not reachable via automation; findings reflect the English-facing version which shares the same structure.

### Screenshot
- `C:\Users\Hiep\Desktop\chesen\.playwright-mcp\babla-hablar.png`

### Lookup page anatomy — "hablar" (Spanish → English)

1. **Top summary line** — "hablar = to speak" with audio for both languages side by side; language code badges ES / EN.
2. **Sub-page tabs** — Translations | Definition | Conjugation | Pronunciation | Examples | Translator | Phrasebook — each a separate URL.
3. **PoS-split translation blocks** — separate h3 headings per PoS: `hablar {vb}`, `hablar {v.i.}`, `hablar {v.t.}` — each with its own numbered translation list, regional variants (Mexico), and audio per word.
4. **Oxford Languages block** — separate section "English translations powered by Oxford Languages" showing intransitive / transitive / pronominal verb senses with richer glosses.
5. **Sense labels / regional tags** — "tener relaciones, old-fashioned", "por teléfono, Mexico" — contextual qualification per sense.
6. **Idiomatic phrases as first-class entries** — "hablar por hablar" and "hablar monótonamente" each get their own translation block inline, not buried in a footnote.
7. **Monolingual examples** — "Spanish How to use hablar in a sentence" — real corpus sentences in the source language only, no bilingual pairing.
8. **Synonyms** — Spanish synonyms from OpenThesaurus-es.
9. **Cross-language other-dictionary links** — sidebar lists "hablar in [language]" for ~20 target languages.
10. **Conjugation link** — prominent tab leading to `/conjugation/spanish/hablar` (full table, not inline).
11. **Living abroad / Phrases promo** — content marketing blocks at the bottom.

Key design principle: **conjugation as a sibling page** (not inline) keeps the translation page clean; learner can opt in. The idiomatic phrase blocks are very strong — treating collocations as first-class entries.

---

## Patterns Worth Adopting — Prioritised

### Priority 1 — HIGH VALUE, data mostly already in lex schema

| Pattern | Source | Our lex table/column | Gap? |
|---|---|---|---|
| **Multiple pinyin readings per character with tab switching** | hanzii | `entries.attributes` (per-character pinyin stored) | Rendering gap: need UI tabs per reading |
| **Radical + stroke count + stroke order in a panel** | hanzii | `characters.radical`, `characters.stroke_count` | Stroke sequence notation (`フノ一フ丨一`) NOT stored; stroke-order animation GIF NOT stored |
| **Component breakdown → clickable sub-character links** | hanzii | `characters` table links to radicals | Need `character_components` relation (which chars compose this one); currently only radical stored, not full decomposition |
| **CEFR / HSK level badge per entry** | Cambridge, hanzii | `entries.level`, `entries.attributes` | Data exists; just needs to render as a badge |
| **Synonyms + antonyms as separate labelled sections** | hanzii, bab.la | `lex_relations` with `relation_type` | Types "synonym"/"antonym" need to be confirmed populated; currently "related words" relation_type observed |
| **IPA + audio button** | Cambridge | `pronunciations.ipa`, `pronunciations.audio_url` | Data exists; render with play button |
| **Example sentences with bilingual pairing (source + Vietnamese)** | hanzii | `examples.text`, `examples.translation_vi` | Data exists |
| **Compounds / collocations list** | hanzii, bab.la | `lex_relations` with relation_type "related words" | Need relation_type = "compound" distinct from synonyms |

### Priority 2 — HIGH VALUE, data gaps to fill

| Pattern | Source | Data gap |
|---|---|---|
| **Character evolution / Tự hình** | hanzii (Hán tự tab) | Historical glyph images per character — NOT in `characters` table; would need external source (e.g. chise-project, wikimedia) |
| **Community mnemonic notes (Góp ý)** | hanzii | No community content table; would need a `character_notes` table with votes |
| **"Appears in" — inverse component relation** | hanzii | Need `character_components(parent_char_id, component_char_id)` bidirectional query |
| **CEFR level badge per sense** (not just entry) | Cambridge | `senses` table has no level column; currently level is on `entries` only |
| **Guide words as semantic scoping** | Cambridge | `senses.gloss_vi` exists but no `guide_word` / sense-group column |
| **Regional / register tags per sense** | bab.la | No register/region column in `senses`; could be added to `senses.attributes` JSON |
| **Verb conjugation table** | bab.la | No conjugation data for Spanish verbs in lex schema; major gap for ES learners |

### Priority 3 — NICE TO HAVE

| Pattern | Source | Notes |
|---|---|---|
| Stroke-order animation GIF/SVG | hanzii | Requires licensed dataset (e.g. make-me-a-hanzi); significant effort |
| "Phân biệt từ" (word comparison) | hanzii | Editorial content; hard to auto-generate |
| Phrasal verbs as first-class entries | bab.la / Cambridge | For EN: would need separate `phrase_entries` type |
| Writing practice (手) interactive | hanzii | Canvas-based; out of scope for v1 |

---

## Recommended Lookup Feature for Chesen

### Page: `/tra-cuu/[lang]/[headword]`

Reuse and extend the existing `WordDetail` React component. Proposed section order:

#### Section 1 — Hero header (always visible)
- Headword (simplified + traditional for ZH)
- Hán-Việt reading / pronunciation key
- Pinyin tabs (if multiple readings) → switching tab filters all sections below
- IPA + audio play buttons (UK/US for EN, single for ZH/ES)
- Level badge (HSK/TOCFL for ZH, CEFR for EN/ES)
- "Thêm vào sổ tay" (Add to notebook) icon

#### Section 2 — Definitions (core of WordDetail, already exists)
- Per PoS heading (Tính từ / Động từ / etc.)
- Numbered senses with: gloss_vi (primary) + gloss_en (secondary, smaller)
- 1 example sentence per sense (text + translation_vi + pinyin)
- Show 3 senses free; collapse rest with "Xem thêm"

#### Section 3 — Character/Component breakdown (ZH only, NEW)
- For single character: radical, stroke count, component breakdown (e.g. NỮ 女 + TỬ 子) with each component clickable
- For compound: each character in the compound shown as a clickable chip → navigates to that character's own `/tra-cuu` page
- Data source: `characters` table + new `character_components` relation (data gap — needs filling)

#### Section 4 — Same word in other languages (NEW, via cross_language_links)
- Section title: "Từ này trong ngôn ngữ khác"
- Query `cross_language_links` by `concept_id` of this entry
- Show sibling entries: e.g. 学习 (ZH) → "learn" (EN) → "aprender" (ES)
- Each shown as a small card: headword + language flag + gloss_vi + link to that word's `/tra-cuu` page
- **This is the cross-language panel the owner wants** — it's directly powered by `cross_language_links.concept_id`

#### Section 5 — Related words (already partially in WordDetail)
- Sub-sections: Từ ghép (compounds), Từ cận nghĩa (synonyms), Từ trái nghĩa (antonyms)
- Source: `lex_relations` filtered by `relation_type`
- Show 4 per category free; "Mở khóa" or paginate for more
- Each item is a clickable chip navigating to that word's lookup page

#### Section 6 — Example sentences (expanded)
- Pull remaining `examples` rows not shown in Section 2
- Show source text + Vietnamese translation + pinyin
- Audio button if `audio_url` present

#### Section 7 — For ES: Conjugation (link-out, not inline)
- "Xem chia động từ" button → `/tra-cuu/es/[verb]/chia-dong-tu`
- Conjugation table data NOT in schema — this is a significant data gap for Spanish

---

## Open Questions for the Owner

1. **Stroke order / animation**: Should we invest in a stroke-order animation dataset (make-me-a-hanzi or similar) for Chinese characters? This is one of hanzii's most distinctive features.

2. **Character component decomposition**: The `characters` table stores `radical` but not the full component tree (e.g. 好 = 女 + 子). Do we have or plan to source this data? It powers the "drill into component" navigation the owner admires.

3. **Relation types in `lex_relations`**: What values of `relation_type` are actually populated? Are "synonym", "antonym", "compound" distinct, or all stored as "related words"? This affects how we render the Related Words section.

4. **Cross-language concept coverage**: How complete is `cross_language_links`? For example, does every ZH entry have a linked EN and ES entry? If coverage is partial, the "same word in other languages" panel should gracefully degrade.

5. **Conjugation for Spanish**: bab.la's strongest feature for ES learners is verb conjugation tables. Do we plan to add conjugation data to Chesen? If so, should it be a separate table or part of `entries.attributes`?

6. **Community notes / Góp ý**: hanzii's community mnemonic feature is loved by Vietnamese learners of Chinese. Is this in scope for Chesen?

7. **Premium / freemium**: hanzii locks senses 2+ and most related words behind a paywall. Should Chesen follow a similar model, or show everything free?

8. **Guide words**: For polysemous words (especially EN "run"), should we add a `guide_word` column to `senses` to enable Cambridge-style sense grouping?
