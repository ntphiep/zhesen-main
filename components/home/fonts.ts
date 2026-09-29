import { Newsreader, Patrick_Hand } from 'next/font/google'

// Declared here, not in the root layout, so only `/` preloads them.
export const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
})

// Only the review demo's margin notes, far below the fold: not worth a preload.
export const patrickHand = Patrick_Hand({
  variable: '--font-patrick-hand',
  subsets: ['latin', 'vietnamese'],
  weight: '400',
  preload: false,
})
