/** The three glyphs the theory pages draw, all decorative. */
export function ArrowLeft() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
}

export function ArrowRight() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

/** The warning mark of components/search/ErrorLine.tsx: the palette has no red. */
export function Warn() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.75 15 14H1z" />
      <path d="M8 6.25v3.5M8 11.75v.25" />
    </svg>
  )
}
