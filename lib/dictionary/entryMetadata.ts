import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { entryPath } from './entryId'
import { phrasalTail } from './phrases'
import { posGroup } from './pos'
import { formatPronunciation, pickAccentRows } from './pronunciation'
import type { DictEntryDetail, DictSense } from './types'

/** Where Google cuts a result's snippet. */
const DESCRIPTION_MAX = 155

/** Past this frequency rank an unlevelled word's machine translation is kept out of the index. */
const RARE_RANK = 50000

/** The pinyin the word page shows beside the headword: its pronunciation row, else the
 *  entry's own `pinyin` attribute. */
export function headwordPinyin(detail: DictEntryDetail): string | null {
  const row = formatPronunciation(pickAccentRows(detail.pronunciations, 'zh', detail.headword)[0]?.ipa ?? null, 'zh')
  if (row) return row
  const attr = detail.attributes.pinyin
  return typeof attr === 'string' && attr.trim() ? attr.trim() : null
}

/** Shaped on what Vietnamese searchers type: "take là gì", "casa tiếng tây ban nha là gì". A
 *  form whose page shows its lemma says so: "emitted là gì? Dạng của emit". */
function entryTitle(detail: DictEntryDetail, lemma: string | null): string {
  const answer = lemma ? `Dạng của ${lemma}` : 'Nghĩa tiếng Việt'
  if (detail.lang === 'es') return `${detail.headword} tiếng Tây Ban Nha là gì? ${answer}`
  if (detail.lang === 'zh') {
    const pinyin = headwordPinyin(detail)
    return `${pinyin ? `${detail.headword} (${pinyin})` : detail.headword} là gì? ${answer}`
  }
  // "give up là gì" and "cụm động từ give up" are what searchers type for a phrasal verb.
  const verb = detail.headword.split(' ')[0]
  if (!lemma && verb !== detail.headword && phrasalTail(verb, detail.headword) !== null
    && detail.senses.some((s) => posGroup(s.pos)?.key === 'verb')) {
    return `${detail.headword} là gì? Cụm động từ: nghĩa, cách dùng`
  }
  return `${detail.headword} là gì? ${answer}`
}

/** Up to three distinct Vietnamese meanings, lead meaning first. Never English: an English
 *  definition in a Vietnamese snippet reads as a broken page. */
export function vietnameseGlosses(detail: DictEntryDetail): string[] {
  const all = [detail.glossVi, ...detail.senses.map((s) => s.glossVi ?? s.pivotVi)]
    .map((g) => (g ?? '').replace(/\s*;\s*/g, ', ').replace(/[\s.,;:!?…]+$/, '').trim())
    .filter(Boolean)
  return [...new Set(all)].slice(0, 3)
}

/** A gloss that names something: two or more capitalised words, an acronym or an inner capital. */
const PROPER = /^(?:\p{Lu}[\p{Ll}\p{M}]*(?:[\s-]+\p{Lu}[\p{Ll}\p{M}]*)+|\p{Lu}{2,}|\p{L}+\p{Lu}\p{L}*)(?=$|[\s,;(])/u

/** Glosses joined into one line read as one sentence: each after the first starts lower-case
 *  unless it names something, and a proper-noun entry keeps every capital. */
export function joinedCase(parts: string[], detail: Pick<DictEntryDetail, 'pos' | 'senses'>): string[] {
  const proper = detail.senses.length > 0 ? detail.senses.every((s) => s.pos === 'proper_noun') : detail.pos === 'proper_noun'
  return parts.map((p, i) => (i === 0 || proper || PROPER.test(p) ? p : p.charAt(0).toLocaleLowerCase('vi') + p.slice(1)))
}

/** Cut at the last space that leaves room for the ellipsis, so no word is broken. */
export function clip(text: string, max = DESCRIPTION_MAX): string {
  if (text.length <= max) return text
  const space = text.lastIndexOf(' ', max - 1)
  const head = text.slice(0, space > 0 ? space : max - 1)
  return `${head.replace(/[\s.,;:!?]+$/, '')}…`
}

/** A Vietnamese meaning that may carry the page in search: a gloss `cleanMtGloss` kept that is
 *  not Google's translation of a rare word, or a pivot. The rule of `lex.gloss_terms_reload`
 *  (0107) and `lex.sitemap_entries` (0108). */
function indexableMeaning(sense: DictSense, detail: DictEntryDetail): boolean {
  if (sense.pivotVi) return true
  if (!sense.glossVi) return false
  return !(sense.glossViSource === 'mt:google' && detail.level === null && (detail.frequencyRank ?? Infinity) > RARE_RANK)
}

/** The word page's head. An entry with no indexable Vietnamese meaning is left out of the
 *  index; its links are still followed. A form whose page shows `lemma` names the lemma's
 *  page as canonical, since the two pages are one. The large card shows the 1200×630
 *  opengraph-image uncropped. */
export function entryMetadata(detail: DictEntryDetail, lemma: { id: string; headword: string } | null = null): Metadata {
  const glosses = vietnameseGlosses(detail)
  return {
    ...pageMetadata({
      title: entryTitle(detail, lemma?.headword ?? null),
      description: glosses.length
        ? clip(`Tra nghĩa tiếng Việt của ${detail.headword}: ${joinedCase(glosses, detail).join(', ')}.`)
        : `Tra nghĩa của ${detail.headword}.`,
      canonical: entryPath(lemma?.id ?? detail.id),
      noindex: !detail.senses.some((s) => indexableMeaning(s, detail)),
    }),
    twitter: { card: 'summary_large_image' },
  }
}
