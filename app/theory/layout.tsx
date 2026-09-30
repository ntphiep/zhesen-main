import { headwordItalic, headwordSerif } from '@/components/lookup/fonts'

/** Latin words and sentences under /theory are set in Newsreader, as on the word page.
 *  Declared in a layout because next/font runs only under the Next compiler, and the
 *  theory components are rendered by tests. */
export default function TheoryLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${headwordSerif.variable} ${headwordItalic.variable}`}>{children}</div>
}
