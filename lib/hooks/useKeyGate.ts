'use client'
import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Keyboard presses a practice card must see before it acts on one: a new card or a new
 *  step of one ignores the key still held from the step before, every auto-repeat, and
 *  any press in its first `SETTLE_MS`, so a held or hurried Enter never grades a card
 *  the reader has not seen. Pointer clicks are not gated. */
export const SETTLE_MS = 300

let held = false
let tracking = false
function track() {
  if (tracking || typeof window === 'undefined') return
  tracking = true
  window.addEventListener('keydown', () => { held = true }, true)
  window.addEventListener('keyup', () => { held = false }, true)
  window.addEventListener('blur', () => { held = false })
}

export function useKeyGate(step: unknown): (e: KeyboardEvent | ReactKeyboardEvent) => boolean {
  const since = useRef(0)
  const armed = useRef(false)
  useEffect(() => {
    track()
    since.current = performance.now()
    armed.current = !held
    const up = () => { armed.current = true }
    window.addEventListener('keyup', up)
    return () => window.removeEventListener('keyup', up)
  }, [step])
  return useCallback(
    (e) => !e.repeat && armed.current && performance.now() - since.current >= SETTLE_MS,
    [],
  )
}
