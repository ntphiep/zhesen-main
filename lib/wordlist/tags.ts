// Pure helpers for the free-text tag array on `user_words.tags`. No schema beyond
// that array is needed: a word can carry many tags, and "collections" or "decks" are
// just a tag someone filters by, so we don't introduce a separate table for them.
import type { UserWord } from './types'

/** Parse a comma-separated tag input into a clean, deduped tag list (case-sensitive). */
export function parseTagsInput(raw: string): string[] {
  return dedupeTags(raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0))
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Union an existing tag list with new tags to add, deduped, existing order preserved. */
export function mergeTags(existing: string[], toAdd: string[]): string[] {
  return dedupeTags([...existing, ...toAdd])
}

/** Remove one tag from a word's tag list. */
export function removeTag(existing: string[], tag: string): string[] {
  return existing.filter((t) => t !== tag)
}

export interface TagCount {
  tag: string
  count: number
}

/** Distinct tags across a wordlist with how many words carry each, sorted by count desc. */
export function tagCounts(words: UserWord[]): TagCount[] {
  const counts = new Map<string, number>()
  for (const w of words) {
    for (const t of w.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
