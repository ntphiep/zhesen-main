import type { ReactNode } from 'react'

export interface LayoutOption<K extends string> {
  key: K
  label: string
}

/** A page's choice of layout, shared by the word page and the signed-in home.
 *
 *  `stored` is the choice this browser remembers, marked so the reader knows it sticks.
 *  Before hydration both are null and `app/globals.css` marks them from the boot script,
 *  through each button's `data-pick` and hint's `data-hint`. Under 640px the icons look
 *  alike, so a phone gets the names in a native select. */
export function LayoutPicker<K extends string>({ value, stored, options, icons, fallback, onPick }: {
  value: K | null
  stored: K | null
  options: readonly LayoutOption<K>[]
  icons: Record<K, ReactNode>
  /** What the select shows before hydration. */
  fallback: K
  onPick: (key: K) => void
}) {
  return (
    <>
      <label className="flex items-center gap-2 text-sm sm:hidden">
        {/* Read out only: shown, it pushed "Góp ý" onto a second row at 375 px. */}
        <span className="sr-only">Bố cục</span>
        <select
          value={value ?? fallback}
          onChange={(e) => {
            const next = options.find((l) => l.key === e.target.value)
            if (next) onPick(next.key)
          }}
          className="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-sm font-medium"
        >
          {options.map((l) => (
            <option key={l.key} value={l.key}>{l.key === stored ? `${l.label} (mặc định)` : l.label}</option>
          ))}
        </select>
      </label>
      <div role="group" aria-label="Bố cục" className="hidden flex-wrap rounded-lg bg-black/5 p-0.5 sm:flex">
        {options.map((l) => (
          <button
            key={l.key}
            type="button"
            data-pick={l.key}
            aria-pressed={value === l.key}
            onClick={() => onPick(l.key)}
            title={l.label}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${
              value === l.key ? 'bg-white text-black shadow-sm' : 'text-black/60 hover:text-black'
            }`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {icons[l.key]}
            </svg>
            <span>{l.label}</span>
            {(stored === null || l.key === stored) && (
              <span aria-hidden="true" data-hint={stored === null || undefined} className="text-[10.5px] font-normal text-black/60">mặc định</span>
            )}
          </button>
        ))}
      </div>
    </>
  )
}
