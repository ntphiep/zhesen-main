/** Shown on a result screen when at least one answer never reached the schedule. The
 *  palette has no red, so it is ink text behind a warning glyph, as components/search/ErrorLine.tsx. */
export function GradeSyncWarning({ failed }: { failed: boolean }) {
  if (!failed) return null
  return (
    <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-(--zs-ink)">
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <path d="M8 1.75 15 14H1z" />
        <path d="M8 6.25v3.5M8 11.75v.25" />
      </svg>
      Chưa lưu được tiến độ phiên này. Kiểm tra mạng rồi ôn lại.
    </p>
  )
}
