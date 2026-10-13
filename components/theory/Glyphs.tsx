/** The glyphs the theory pages and the wordlist draw, all decorative. */
export function ArrowLeft() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 10H4M9 5l-5 5 5 5" /></svg>
}

export function ArrowRight() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

/** ArrowLeft against a bar: the first page. */
export function ArrowFirst() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v12M17 10H8M12 6l-4 4 4 4" /></svg>
}

/** ArrowRight against a bar: the last page. */
export function ArrowLast() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4v12M3 10h9M8 6l4 4-4 4" /></svg>
}

/** The mark on a button that opens a menu. */
export function ChevronDown() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
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
