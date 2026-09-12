/**
 * The columns and embeds that `toPreview` (lib/dictionary/rows.ts) needs to build
 * a search-result preview.
 *
 * It lives in its own module because it was hand-typed in three places -- the
 * search query, the tap-to-lookup token resolver and the entry-detail query --
 * with no compiler link between them, so adding a column to the preview meant
 * remembering all three. `entryDetail.ts` appends its own embeds to this base.
 */
export const PREVIEW_SELECT =
  'id, lang, headword, traditional, level, frequency_rank, attributes, senses(pos, gloss_vi, gloss_en, sense_order), pronunciations(accent, ipa, audio_url)'
