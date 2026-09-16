'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Notice {
  /** Bumped on every notify so repeating the same text restarts the timer. */
  id: number
  text: string
  tone: 'error' | 'info'
}

/**
 * A transient message, in place of `window.alert`.
 *
 * alert() freezes the whole tab until it is dismissed, cannot be styled, and is
 * exactly what the browser's "prevent this page from creating more dialogs"
 * checkbox silences -- after which the reader stops being told that a save
 * failed at all. This renders inside the page and clears itself.
 */
export function useNotice(timeoutMs = 5000) {
  const [notice, setNotice] = useState<Notice | null>(null)
  // A counter rather than Date.now(): react-hooks/purity forbids reading the
  // clock during render, and the value only has to be different each time.
  const seq = useRef(0)

  const notify = useCallback((text: string, tone: Notice['tone'] = 'error') => {
    seq.current += 1
    setNotice({ id: seq.current, text, tone })
  }, [])

  const dismiss = useCallback(() => setNotice(null), [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), timeoutMs)
    return () => clearTimeout(timer)
  }, [notice, timeoutMs])

  return { notice, notify, dismiss }
}

/**
 * The live region is always mounted, empty or not: a screen reader only
 * announces changes inside a region it was already watching, so one that
 * appears together with its own text is announced by nothing.
 */
export function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {notice && (
        <div
          key={notice.id}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${
            notice.tone === 'error' ? 'bg-red-600 text-white' : 'bg-black text-white'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Đóng thông báo"
            className="text-lg leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
