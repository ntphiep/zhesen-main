import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/site'
import { entryPath } from './entryId'
import { formatPronunciation, pickAccentRows } from './pronunciation'
import type { DictEntryDetail } from './types'

/** Where Google cuts a result's snippet. */
const DESCRIPTION_MAX = 155

/** The pinyin the word page shows beside the headword: its pronunciation row, else the
 *  entry's own `pinyin` attribute. */
export function headwordPinyin(detail: DictEntryDetail): string | null {
  const row = formatPronunciation(pickAccentRows(detail.pronunciations, 'zh', detail.headword)[0]?.ipa ?? null, 'zh')
  if (row) return row
  const attr = detail.attributes.pinyin
  return typeof attr === 'string' && attr.trim() ? attr.trim() : null
}

/** Shaped on what Vietnamese searchers type: "take là gì", "casa tiếng tây ban nha là gì". */
function entryTitle(detail: DictEntryDetail): string {
  if (detail.lang === 'es') return `${detail.headword} tiếng Tây Ban Nha là gì? Nghĩa tiếng Việt`
  if (detail.lang === 'zh') {
    const pinyin = headwordPinyin(detail)
    return `${pinyin ? `${detail.headword} (${pinyin})` : detail.headword} là gì? Nghĩa tiếng Việt`
  }
  return `${detail.headword} là gì? Nghĩa tiếng Việt`
}

/** Up to three distinct Vietnamese meanings, lead meaning first. Never English: an English
 *  definition in a Vietnamese snippet reads as a broken page. */
export function vietnameseGlosses(detail: DictEntryDetail): string[] {
  const all = [detail.glossVi, ...detail.senses.map((s) => s.glossVi ?? s.pivotVi)]
    .map((g) => (g ?? '').replace(/\s*;\s*/g, ', ').replace(/[\s.,;:!?…]+$/, '').trim())
    .filter(Boolean)
  return [...new Set(all)].slice(0, 3)
}

/** Cut at the last space that leaves room for the ellipsis, so no word is broken. */
export function clip(text: string, max = DESCRIPTION_MAX): string {
  if (text.length <= max) return text
  const space = text.lastIndexOf(' ', max - 1)
  const head = text.slice(0, space > 0 ? space : max - 1)
  return `${head.replace(/[\s.,;:!?]+$/, '')}…`
}

/** The word page's head. An entry with no Vietnamese meaning is left out of the index; its
 *  links are still followed. */
export function entryMetadata(detail: DictEntryDetail): Metadata {
  const glosses = vietnameseGlosses(detail)
  return pageMetadata({
    title: entryTitle(detail),
    description: glosses.length
      ? clip(`Tra nghĩa tiếng Việt của ${detail.headword}: ${glosses.join(', ')}.`)
      : `Tra nghĩa của ${detail.headword}.`,
    canonical: entryPath(detail.id),
    noindex: glosses.length === 0,
  })
}
