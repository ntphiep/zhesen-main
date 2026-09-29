import type { ReactNode } from 'react'

/** A failure in the lookup. The palette has no red, so it is ink text behind a warning
 *  glyph, as the word page's FeedbackButton draws one. */
export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-(--zs-ink)">
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <path d="M8 1.75 15 14H1z" />
        <path d="M8 6.25v3.5M8 11.75v.25" />
      </svg>
      {children}
    </p>
  )
}
