import s from './Account.module.css'

/** The glyph a failure carries: the palette has no red (components/search/ErrorLine.tsx). */
export function WarnGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.75 15 14H1z" />
      <path d="M8 6.25v3.5M8 11.75v.25" />
    </svg>
  )
}

/** What a submit on the account pages came to: ink text behind a check or a warning. */
export function Said({ tone, text }: { tone: 'ok' | 'bad'; text: string }) {
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} data-tone={tone} className={s.said}>
      {tone === 'bad' ? <WarnGlyph /> : (
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 8.5 3.2 3L13 4.5" />
        </svg>
      )}
      {text}
    </p>
  )
}
