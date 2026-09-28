const ENTRY_COLUMNS = 'id, lang, headword, traditional, level, frequency_rank, attributes'
const PRONUNCIATIONS = 'pronunciations(accent, ipa, audio_url)'

/** The columns and embeds `toPreview` (lib/dictionary/rows.ts) needs. Shared by the search
 *  query, the token resolver and the entry-detail query, so a new preview column is one
 *  edit; `entryDetail.ts` appends its own embeds to `DETAIL_SELECT`. */
export const PREVIEW_SELECT =
  `${ENTRY_COLUMNS}, senses(pos, gloss_vi, gloss_en, sense_order), ${PRONUNCIATIONS}`

/** The preview plus each sense's id, rank and machine-translation flag, which only the
 *  entry page reads. */
export const DETAIL_SELECT =
  `${ENTRY_COLUMNS}, senses(id, pos, gloss_vi, gloss_en, sense_order, sense_frequency, gloss_vi_is_mt), ${PRONUNCIATIONS}`
