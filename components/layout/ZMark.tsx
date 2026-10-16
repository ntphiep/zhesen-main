/** The brand mark of app/icon.svg and public/brand/: a Z folded from one strip, light to deep
 *  sea blue. Owner's choice, 2026-10-17. Fills are props because next/og reads no CSS variables. */
export function ZMark({ fills: [top, mid, bot], height, className }: {
  fills: readonly [string, string, string]
  height: number
  className?: string
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 48" width={(height * 44) / 48} height={height} className={className}>
      <polygon points="0 0 36.5 0 44 14 0 14" fill={top} />
      <polygon points="21.47 14 44 14 7.5 48 0 34" fill={mid} />
      {/* Where the strip passes under the top band, then over the bottom one. */}
      <polygon points="21.47 14 44 14 16.64 18.5" fill="#000" fillOpacity={0.16} />
      <polygon points="7.5 48 44 48 44 34 22.53 34" fill={bot} />
      <polygon points="7.5 48 22.53 34 28.53 34" fill="#000" fillOpacity={0.26} />
    </svg>
  )
}
