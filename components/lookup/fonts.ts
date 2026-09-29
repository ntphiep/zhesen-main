import { Newsreader } from 'next/font/google'

// The headword face of `/` from 500 to 700, without the optical size axis: the full face of
// components/home/fonts.ts preloaded 279 kB here. Only Spanish headwords are italic, so the
// italic is not preloaded and loads where a page sets it.
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
