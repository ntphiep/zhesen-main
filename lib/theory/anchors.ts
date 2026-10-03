import type { LangCode } from '@/lib/languages'

/**
 * What the theory pages document, for the word page to link into without the theory text:
 * importing `./content` put 40 KiB gzip into every word page's initial JS.
 * `test/theory-content.test.ts` holds both lists equal to the content.
 */

/** The word classes with a page of their own. */
export const DOCUMENTED_WORD_CLASSES: Partial<Record<LangCode, readonly string[]>> = {
  en: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'determiner', 'article', 'preposition', 'conjunction', 'interjection'],
}

export function hasWordClass(lang: LangCode, key: string): boolean {
  return DOCUMENTED_WORD_CLASSES[lang]?.includes(key) ?? false
}

/** Every symbol a transcription can carry, British and General American, mapped to the
 *  phoneme card it opens. */
export const PHONEME_ANCHORS: Partial<Record<LangCode, Readonly<Record<string, string>>>> = {
  en: {
    'ɪ': 'ɪ', 'e': 'e', 'æ': 'æ', 'ɒ': 'ɒ', 'ɑ': 'ɒ', 'ʌ': 'ʌ', 'ʊ': 'ʊ', 'ə': 'ə', 'iː': 'iː', 'ɑː': 'ɑː',
    'ɑːr': 'ɑː', 'ɔː': 'ɔː', 'ɔːr': 'ɔː', 'uː': 'uː', 'ɜː': 'ɜː', 'ɜr': 'ɜː', 'i': 'i', 'u': 'u', 'eɪ': 'eɪ',
    'aɪ': 'aɪ', 'ɔɪ': 'ɔɪ', 'əʊ': 'əʊ', 'oʊ': 'əʊ', 'aʊ': 'aʊ', 'ɪə': 'ɪə', 'ɪr': 'ɪə', 'eə': 'eə', 'ɛr': 'eə',
    'ʊə': 'ʊə', 'ʊr': 'ʊə', 'p': 'p', 'b': 'b', 't': 't', 'd': 'd', 'k': 'k', 'ɡ': 'ɡ', 'tʃ': 'tʃ', 'dʒ': 'dʒ',
    'f': 'f', 'v': 'v', 'θ': 'θ', 'ð': 'ð', 's': 's', 'z': 'z', 'ʃ': 'ʃ', 'ʒ': 'ʒ', 'h': 'h', 'm': 'm', 'n': 'n',
    'ŋ': 'ŋ', 'l': 'l', 'r': 'r', 'w': 'w', 'j': 'j',
  },
}
