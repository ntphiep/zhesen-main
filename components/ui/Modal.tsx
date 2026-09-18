'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A native <dialog> driven by an `open` prop, with the shared header.
 *
 * The `el.open` guard is the point: showModal() throws if the dialog is already
 * open, which React Strict Mode causes by invoking the effect twice. The `open`
 * attribute must not be set in JSX either, as that opens the dialog non-modally.
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
      // `margin: auto`, and Tailwind preflight resets `margin: 0` on every element.
      // The scrim is not a utility here: bg-black would follow the ink token and turn
      // the overlay white in dark mode. dialog::backdrop in globals.css keeps it dark.
      className={`m-auto rounded-xl bg-white shadow-xl p-0 w-full ${widthClass}`}
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
