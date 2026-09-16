'use client'
import { Modal } from '@/components/ui/Modal'

/**
 * A confirmation step in place of `window.confirm`.
 *
 * Same reasons as `useNotice`, plus one of its own: confirm() returns a boolean
 * synchronously, so the caller cannot show which rows are about to go or label
 * the button with the action. Built on Modal so it inherits the `m-auto`
 * centring and the Strict Mode guard rather than repeating them.
 */
export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} titleId="confirm-title" widthClass="max-w-sm">
      <div className="p-5">
        <p className="text-sm text-black/70">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
