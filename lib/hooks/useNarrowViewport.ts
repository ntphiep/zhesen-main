'use client'
import { useSyncExternalStore } from 'react'

/** Tailwind's `sm` breakpoint. Measured rather than assumed because the table's sticky
 *  offsets are arithmetic, and a phone cannot hold the widths a laptop can. */
const NARROW_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(NARROW_QUERY).matches

/** The server renders the wide layout, as `useStoredView` does, so the first client
 *  render agrees with it. */
const getServerSnapshot = () => false

export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
