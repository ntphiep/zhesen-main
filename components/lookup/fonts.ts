import { Newsreader } from 'next/font/google'

// The one Newsreader declaration, from 500 to 700, without the optical size axis: the full
// face with it preloaded 279 kB. Only Spanish headwords are italic, so the italic is not
// preloaded and loads where a page sets it.
export const headwordSerif = Newsreader({
  variable: '--font-headword',
  subsets: ['latin'],
  weight: ['500', '700'],
})

export const headwordItalic = Newsreader({
  variable: '--font-headword-italic',
  subsets: ['latin'],
  style: 'italic',
  weight: ['500', '700'],
  preload: false,
})
