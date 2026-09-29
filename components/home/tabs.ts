import type { KeyboardEvent } from 'react'

/** Arrow keys move the selection along a tablist and focus the tab they land on. */
export function onTabKey(e: KeyboardEvent<HTMLElement>, index: number, count: number, pick: (i: number) => void): void {
  const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!d) return
  e.preventDefault()
  const next = (index + d + count) % count
  pick(next)
  e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
}
