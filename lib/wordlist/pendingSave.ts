/**
 * The entry a guest pressed save on before registering, kept for this tab so the word page
 * can save it once they return with an account. No zod here: the guest's save button
 * imports this, and the word page keeps zod off its path until an account is known.
 */

const KEY = 'zhesen:pending-save'
const TTL_MS = 30 * 60 * 1000

/** Remember `id`. Blocked or full storage only loses the save after registering. */
export function rememberPendingSave(id: string, now: number = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id, at: now }))
  } catch {
    /* storage blocked */
  }
}

function read(): { id: string; at: number } | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || !('id' in value) || !('at' in value)) return null
  const { id, at } = value
  return typeof id === 'string' && typeof at === 'number' ? { id, at } : null
}

/** True exactly once for an `id` remembered in the last 30 minutes, clearing the key. A
 *  stale or unreadable key is cleared too; another entry's key is left for its own page. */
export function takePendingSave(id: string, now: number = Date.now()): boolean {
  try {
    const pending = read()
    const fresh = pending !== null && now >= pending.at && now - pending.at <= TTL_MS
    if (fresh && pending.id !== id) return false
    sessionStorage.removeItem(KEY)
    return fresh
  } catch {
    return false
  }
}

/** Fired on `window` after a bulk save, with the entry ids now in the notebook, so each save
 *  button on the page stops offering a save its mount-time check missed. */
export const WORDS_SAVED_EVENT = 'zhesen:words-saved'

export function announceSaved(entryIds: string[]): void {
  window.dispatchEvent(new CustomEvent(WORDS_SAVED_EVENT, { detail: entryIds }))
}
