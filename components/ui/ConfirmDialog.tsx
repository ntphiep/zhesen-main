'use client'
import { Modal } from '@/components/ui/Modal'

/**
 * A confirmation step in place of `window.confirm`, which returns a boolean
 * synchronously, so the caller cannot show which rows are about to go or label the
 * button with the action. Built on Modal, inheriting its `m-auto` centring and its
 * Strict Mode guard rather than repeating them.
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
        <p className="text-sm text-(--zs-ink)">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-full border-[1.5px] border-(--edge) bg-(--zs-bg) px-4 text-sm font-semibold text-(--zs-ink) transition-colors duration-150 ease-std hover:border-sea-400 hover:bg-(--tint-1)"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-10 rounded-full border-[1.5px] border-(--ink) bg-transparent px-4 text-sm font-bold text-(--ink) transition-colors duration-150 ease-std hover:bg-(--ink) hover:text-(--zs-bg)"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
