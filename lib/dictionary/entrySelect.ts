const ENTRY_COLUMNS = 'id, lang, headword, traditional, level, frequency_rank, attributes'
const PRONUNCIATIONS = 'pronunciations(accent, ipa, audio_url)'
const LEARNER_LEAD = 'learner_entries(status, learner_senses(sense_order, vi_terms, en_definition))'

/** The columns and embeds `toPreview` (lib/dictionary/rows.ts) needs. Shared by the search
 *  query, the token resolver and the entry-detail query, so a new preview column is one
 *  edit; `entryDetail.ts` appends its own embeds to `DETAIL_SELECT`. */
export const PREVIEW_SELECT =
  `${ENTRY_COLUMNS}, senses(pos, gloss_vi, gloss_en, sense_order, sense_frequency), ${PRONUNCIATIONS}, ${LEARNER_LEAD}`

/** What a common-words chip draws, its headword and lead Vietnamese gloss, plus every
 *  column `toPreview` reads to pick that gloss. A third of `PREVIEW_SELECT`'s bytes for the
 *  same sixty English rows. */
export const CHIP_SELECT =
  'id, headword, senses(pos, gloss_vi, gloss_en, sense_order, sense_frequency), learner_entries(status, learner_senses(sense_order, vi_terms))'

/** The preview plus each sense's id, machine-translation flag and gloss source, which only
 *  the entry page reads. */
export const DETAIL_SELECT =
  `${ENTRY_COLUMNS}, senses(id, pos, gloss_vi, gloss_en, sense_order, sense_frequency, gloss_vi_is_mt, gloss_vi_source:provenance->>gloss_vi_source), ${PRONUNCIATIONS}, ${LEARNER_LEAD}`
