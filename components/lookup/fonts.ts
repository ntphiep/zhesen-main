import { Newsreader } from 'next/font/google'

// The headword face of `/` at the one weight the word page sets it in, without the optical
// size axis: the full face of components/home/fonts.ts preloaded 279 kB here.
export const headwordSerif = Newsreader({
  variable: '--font-headword',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: '500',
})
