'use client'
import { useEffect, useRef } from 'react'

/**
 * Drives a native <dialog> from an `open` flag with showModal(), which gives Escape, the
 * focus trap and focus restore. The `el.open` guard is the point: showModal() throws if
 * the dialog is already open, which React Strict Mode causes by invoking the effect
 * twice. The `open` attribute must not be set in JSX either, as that opens it non-modally.
 */
export function useModalDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  return ref
}
