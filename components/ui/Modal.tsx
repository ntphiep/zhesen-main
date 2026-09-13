'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A native <dialog> driven by an `open` prop, with the shared header.
 *
 * The guard on `el.open` is the point of this component. showModal() throws if
 * the dialog is already open, which React Strict Mode reliably causes by
 * invoking the effect twice, and the `open` attribute must not be set in JSX
 * either -- that opens the dialog non-modally and conflicts with showModal().
 * Three dialogs had copied that reasoning, two of them with the comment and one
 * without.
 */
export function Modal({
  open, onClose, title, titleId, widthClass = 'max-w-lg', children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** Kept explicit so each dialog's accessible name stays the one it had. */
  titleId: string
  widthClass?: string
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // `m-auto` is load-bearing: the UA stylesheet centres a modal dialog with
      // `margin: auto`, and Tailwind's preflight resets `margin: 0` on every
      // element, which pinned all three dialogs to the top-left corner.
      className={`m-auto rounded-xl bg-white shadow-xl p-0 w-full ${widthClass} backdrop:bg-black/30`}
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <button
          className="text-black/40 hover:text-black/70 text-xl leading-none"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
