import { WordLayouts } from './WordLayouts'
import { buildWordView, type WordViewInput } from '@/lib/dictionary/wordView'

/**
 * The word page. Everything it draws is built here on the server into one plain object,
 * handed once to the client component that renders the layout the reader picked.
 */
export function LookupView(props: WordViewInput) {
  return <WordLayouts view={buildWordView(props)} />
}
