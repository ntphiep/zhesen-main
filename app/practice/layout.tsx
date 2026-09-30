import { headwordItalic, headwordSerif } from '@/components/lookup/fonts'

/** Headwords are set in Newsreader, as on the word page. Declared in a layout because
 *  next/font runs only under the Next compiler, and test/practice-guard.test.ts imports
 *  every practice page. */
export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${headwordSerif.variable} ${headwordItalic.variable} flex flex-1 flex-col`}>{children}</div>
}
