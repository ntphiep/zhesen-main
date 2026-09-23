'use client'
import { useEffect } from 'react'
import { useStoredPref } from '@/lib/hooks/useStoredPref'
import {
  DARK_QUERY, parseTheme, resolveTheme, THEME_KEY, THEME_OPTIONS, type ThemeChoice,
} from '@/lib/theme'

const serialize = (c: ThemeChoice) => c

/**
 * Sáng, Tối or Theo hệ thống. The boot script in `app/layout.tsx` applies the stored
 * choice on every page load; this control applies a change immediately, and follows the
 * operating system while the choice is "Theo hệ thống".
 */
export function ThemeToggle() {
  const [choice, setChoice] = useStoredPref<ThemeChoice>(THEME_KEY, parseTheme, serialize)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(choice, media.matches)
    }
    apply()
    // Only "Theo hệ thống" tracks the system, but the listener is cheap and attaching it
    // conditionally would need a second effect.
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-black/15" role="group" aria-label="Giao diện">
      {THEME_OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setChoice(value)}
          aria-pressed={choice === value}
          className={`px-3 py-2 text-sm ${choice === value ? 'bg-black text-white' : 'bg-white text-black/60 hover:bg-black/5'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
