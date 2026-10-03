'use client'
import { createContext, useContext } from 'react'

/**
 * Element ids and in-page links on the word page. Before hydration the server writes a
 * panel per layout the entry offers (components/lookup/WordLayouts.tsx), and each one but
 * the overview prefixes its links to keep them apart in the document; afterwards only
 * one layout is left and the prefix is empty.
 */
export const AnchorPrefix = createContext('')

/** `anchor('family')` is the id to set; `#${anchor('family')}` the link to it. */
export function useAnchor(): (id: string) => string {
  const prefix = useContext(AnchorPrefix)
  return (id) => prefix + id
}
