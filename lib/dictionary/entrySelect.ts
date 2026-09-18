/** The columns and embeds `toPreview` (lib/dictionary/rows.ts) needs. Shared by the search
 *  query, the token resolver and the entry-detail query, so a new preview column is one
 *  edit; `entryDetail.ts` appends its own embeds to this base. */
export const PREVIEW_SELECT =
  'id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)'
