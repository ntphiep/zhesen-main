import { headwordSerif } from '@/components/lookup/fonts'

/** Latin headwords are set in Newsreader, as on `/`. Declared in this layout so the word
 *  page preloads it and the rest of the dictionary does not. */
export default function WordLayout({ children }: { children: React.ReactNode }) {
  return <div className={headwordSerif.variable}>{children}</div>
}
