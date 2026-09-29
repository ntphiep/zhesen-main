import { headwordItalic, headwordSerif } from '@/components/lookup/fonts'

/** Latin headwords are set in Newsreader, as on `/`, on the lookup and on the word page.
 *  Declared in a layout because next/font runs only under the Next compiler, and the
 *  lookup page's own test renders the page. */
export default function DictionaryLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${headwordSerif.variable} ${headwordItalic.variable}`}>{children}</div>
}
