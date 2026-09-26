'use client'
import { useState } from 'react'
import Link from 'next/link'
import { LinkPending } from '@/components/ui/LinkPending'
import { RELATION_CAP } from '@/lib/dictionary/relations'
import type { RelatedTab } from '@/lib/dictionary/wordPage'

/** "Từ liên quan": every related-word source in one card, one tab per kind. */
export function RelatedTabs({ tabs }: { tabs: RelatedTab[] }) {
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  if (tabs.length === 0) return null
  const current = Math.min(active, tabs.length - 1)
  const tab = tabs[current]
  const shown = expanded ? tab.items : tab.items.slice(0, RELATION_CAP)

  function select(i: number) {
    setActive(i)
    setExpanded(false)
  }
  // Arrow keys, Home and End move between tabs, as the WAI-ARIA tabs pattern expects;
  // Tab itself leaves the list, because only the selected tab is focusable.
  function onKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
    const last = tabs.length - 1
    const next = ev.key === 'ArrowRight' ? (current === last ? 0 : current + 1)
      : ev.key === 'ArrowLeft' ? (current === 0 ? last : current - 1)
      : ev.key === 'Home' ? 0
      : ev.key === 'End' ? last
      : null
    if (next === null) return
    ev.preventDefault()
    select(next)
    ev.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <section id="related" className="flex flex-col gap-3 rounded-xl border border-black/10 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/55">Từ liên quan</h2>
      <div role="tablist" aria-label="Từ liên quan" onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`related-tab-${t.key}`}
            aria-selected={t === tab}
            aria-controls="related-panel"
            tabIndex={t === tab ? 0 : -1}
            onClick={() => select(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${t === tab ? 'bg-black text-white' : 'bg-black/5 text-black/75 hover:bg-black/10'}`}
          >
            {t.label} {t.items.length}
          </button>
        ))}
      </div>
      <div id="related-panel" role="tabpanel" aria-labelledby={`related-tab-${tab.key}`}>
        <ul className="flex flex-col gap-1.5">
          {shown.map((item) => (
            <li key={item.text} className="flex flex-wrap items-baseline gap-x-2">
              <Link href={item.href} className="font-medium text-blue-700 hover:underline">
                {item.text}
                {item.entry && <LinkPending />}
              </Link>
              {item.gloss && <span className="text-sm text-black/55">{item.gloss}</span>}
            </li>
          ))}
        </ul>
      </div>
      {!expanded && tab.items.length > RELATION_CAP && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-fit text-sm font-medium text-blue-700 hover:underline"
        >
          {`Xem cả ${tab.items.length}`}
        </button>
      )}
    </section>
  )
}
