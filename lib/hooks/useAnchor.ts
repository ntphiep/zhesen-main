'use client'
import { createContext, useContext } from 'react'

/**
 * Element ids and in-page links on the word page. Before hydration the server draws every
 * layout the entry offers side by side (components/lookup/WordLayouts.tsx), so each one
 * but the overview prefixes its ids to keep them unique in the document; afterwards only
 * one layout is left and the prefix is empty.
 */
export const AnchorPrefix = createContext('')

/** `anchor('family')` is the id to set; `#${anchor('family')}` the link to it. */
export function useAnchor(): (id: string) => string {
  const prefix = useContext(AnchorPrefix)
  return (id) => prefix + id
}
