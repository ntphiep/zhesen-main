/**
 * The columns and embeds that `toPreview` (lib/dictionary/rows.ts) needs to build
 * a search-result preview.
 *
 * A single definition shared by the search query, the tap-to-lookup token
 * resolver and the entry-detail query, so adding a column to the preview means
 * changing one place. `entryDetail.ts` appends its own embeds to this base.
 */
export const PREVIEW_SELECT =
  'id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)'
