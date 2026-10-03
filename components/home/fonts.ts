import { Patrick_Hand } from 'next/font/google'
import { headwordItalic, headwordSerif } from '@/components/lookup/fonts'

// The word page's Newsreader faces. A second Newsreader declaration shared the family name,
// so CSS chunk merging carried its opsz and italic files onto dictionary and theory pages too.
export const newsreader = { variable: `${headwordSerif.variable} ${headwordItalic.variable}` }

// Only the review demo's margin notes, far below the fold: not worth a preload.
export const patrickHand = Patrick_Hand({
  variable: '--font-patrick-hand',
  subsets: ['latin', 'vietnamese'],
  weight: '400',
  preload: false,
})
