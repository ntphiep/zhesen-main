'use client'
import { useEffect } from 'react'
import { useStoredPref } from '@/lib/hooks/useStoredPref'
import {
  DARK_QUERY, parseTheme, resolveTheme, THEME_KEY, THEME_OPTIONS, type ThemeChoice,
} from '@/lib/theme'

const serialize = (c: ThemeChoice) => c

/**
 * Sáng, Tối or Theo máy. The boot script in `app/layout.tsx` applies the stored
 * choice on every page load; this control applies a change immediately, and follows the
 * operating system while the choice is "Theo máy".
 */
export function ThemeToggle() {
  const [choice, setChoice] = useStoredPref<ThemeChoice>(THEME_KEY, parseTheme, serialize)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(choice, media.matches)
    }
    apply()
    // Only "Theo máy" tracks the system, but the listener is cheap and attaching it
    // conditionally would need a second effect.
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])

  return (
    // The chosen scheme is filled like the primary button, as components/ui/LayoutPicker.tsx does.
    <div className="inline-flex rounded-xl bg-(--zs-chip) p-[3px]" role="group" aria-label="Giao diện">
      {THEME_OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setChoice(value)}
          aria-pressed={choice === value}
          className={`min-h-9 rounded-[9px] px-3.5 text-sm font-semibold transition-colors duration-150 ease-std motion-reduce:transition-none ${
            choice === value ? 'bg-(--zs-btn) text-(--zs-btn-ink) shadow-sm' : 'text-(--zs-soft) hover:text-(--zs-ink)'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
