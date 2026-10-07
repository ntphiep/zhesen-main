import { WordLayouts } from './WordLayouts'
import { buildWordView, type WordViewInput } from '@/lib/dictionary/wordView'
import { toeicPlace } from '@/lib/theory/content'
import { toeicGroupPath } from '@/lib/theory/path'

/**
 * The word page. Everything it draws is built here on the server into one plain object,
 * handed once to the client component that renders the layout the reader picked.
 * The TOEIC list is read here, not in a layout, so its 1,250 rows stay out of the bundle.
 */
export function LookupView(props: WordViewInput) {
  const { lang, headword } = props.detail
  const place = toeicPlace(lang, headword)
  const toeic = place && { rank: place.rank, href: toeicGroupPath(lang, place.group) }
  return <WordLayouts view={buildWordView({ ...props, toeic })} />
}
