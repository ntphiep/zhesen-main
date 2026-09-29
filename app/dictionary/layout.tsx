import { headwordSerif } from '@/components/lookup/fonts'

/** Latin headwords are set in Newsreader, as on `/`. Declared in a layout because
 *  next/font only runs under the Next compiler, and the page's own test renders it. */
export default function DictionaryLayout({ children }: { children: React.ReactNode }) {
  return <div className={headwordSerif.variable}>{children}</div>
}
