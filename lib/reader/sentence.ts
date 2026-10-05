/** Sentence-ending punctuation in the three dictionary languages, plus a line break. */
const END = /[.!?…。！？\n]/u
/** Closing marks that stay with the sentence they end. */
const CLOSE = /["”’»」』)）]/u

/** The longest sentence a saved word keeps as its example: a flashcard has room for a line
 *  or two, and a passage without punctuation would otherwise be stored whole. */
export const MAX_SENTENCE_CHARS = 300

/** The sentence of `text` holding the characters `[from, to)`, trimmed. Null when that
 *  sentence runs past MAX_SENTENCE_CHARS. Abbreviations such as "Mr." end a sentence early,
 *  which only shortens the example. */
export function sentenceAt(text: string, from: number, to: number): string | null {
  let start = from
  while (start > 0 && !END.test(text[start - 1])) start--
  // The closing quote of the previous sentence.
  while (start < from && (CLOSE.test(text[start]) || /\s/u.test(text[start]))) start++
  let end = to
  while (end < text.length && !END.test(text[end])) end++
  while (end < text.length && (END.test(text[end]) && text[end] !== '\n')) end++
  while (end < text.length && CLOSE.test(text[end])) end++
  const sentence = text.slice(start, end).trim()
  return sentence.length > 0 && sentence.length <= MAX_SENTENCE_CHARS ? sentence : null
}
