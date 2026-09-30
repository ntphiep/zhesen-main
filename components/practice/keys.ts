import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** The key a practice shortcut may act on, or null when the press belongs to something
 *  else: an open dialog, a control outside the card, a field being typed in, a chord, or
 *  Space and Enter on a control that already answers them itself. */
export function onlyKey(e: KeyboardEvent, card: HTMLElement | null): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null
  if (document.querySelector('dialog[open]')) return null
  const t = e.target instanceof Element ? e.target : null
  if (!card || !t || (t !== document.body && !card.contains(t))) return null
  if (t.closest('input, textarea, select, [contenteditable="true"]')) return null
  if ((e.key === ' ' || e.key === 'Enter') && t.closest('button, a, summary')) return null
  return e.key
}

/** Space on the page itself may stand in for a button only when the card is fully in
 *  view and the page has little left to scroll, so it never takes over scrolling. */
export function spaceIsFree(e: KeyboardEvent, card: HTMLElement): boolean {
  if (e.target !== document.body) return true
  const r = card.getBoundingClientRect()
  const left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY
  return r.top >= 0 && r.bottom <= window.innerHeight && left < window.innerHeight / 4
}

/** Keeps Enter, and Space on a control, from acting on a card that has not settled. */
export function holdBack(e: ReactKeyboardEvent, settled: (e: ReactKeyboardEvent) => boolean): void {
  const onControl = e.target instanceof Element && e.target.closest('button, a') !== null
  if ((e.key === 'Enter' || (e.key === ' ' && onControl)) && !settled(e)) e.preventDefault()
}
