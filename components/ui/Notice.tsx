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
 * alert() freezes the whole tab, cannot be styled, and is what the browser's
 * "prevent this page from creating more dialogs" checkbox silences. This renders
 * inside the page and clears itself.
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
 * The live region stays mounted, empty or not: a screen reader announces changes
 * only inside a region it was already watching.
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
            notice.tone === 'error' ? 'bg-(--zs-ink) font-semibold text-(--zs-bg)' : 'bg-black text-white'
          }`}
        >
          {/* The palette has no red: an error carries the warning glyph of components/search/ErrorLine.tsx. */}
          {notice.tone === 'error' && (
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-4 shrink-0">
              <path d="M8 1.75 15 14H1z" />
              <path d="M8 6.25v3.5M8 11.75v.25" />
            </svg>
          )}
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
