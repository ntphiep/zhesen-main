'use client'
import { useEffect, useRef, useState } from 'react'
import { currentScheme, watchScheme } from '@/lib/theme'

/**
 * Animated stroke order for a single Han character. hanzi-writer is loaded
 * dynamically, so it is code-split out of the main bundle and never runs during SSR.
 * Stroke data comes from the hanzi-writer CDN; a character with none hides itself.
 */
export function StrokeOrder({ char }: { char: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const writerRef = useRef<{ animateCharacter: () => void } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    // hanzi-writer parses colours from strings and cannot take a CSS variable, so the
    // palette is read from the scheme in force and rebuilt on a flip: #023c85 vanishes on
    // dark. The values copy --sea-700, --sea-50 and the dark --edge of app/globals.css.
    // The reader's choice, not the OS setting: they disagree whenever one is made.
    function build(dark: boolean) {
      import('hanzi-writer').then(({ default: HanziWriter }) => {
        if (cancelled || !ref.current) return
        ref.current.innerHTML = ''
        const writer = HanziWriter.create(ref.current, char, {
          width: 88,
          height: 88,
          padding: 5,
          showCharacter: false,
          showOutline: true,
          strokeColor: dark ? '#fff' : '#023c85',
          outlineColor: dark ? '#10305a' : '#c3e7ef',
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 280,
          onLoadCharDataError: () => { if (!cancelled) setFailed(true) },
        })
        writerRef.current = writer
        writer.animateCharacter()
      }).catch(() => { if (!cancelled) setFailed(true) })
    }
    build(currentScheme() === 'dark')
    const unwatch = watchScheme((scheme) => build(scheme === 'dark'))
    return () => { cancelled = true; unwatch() }
  }, [char])

  if (failed) return null
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={ref} aria-label={`Thứ tự nét chữ ${char}`} className="rounded-lg border border-(--zs-line) bg-(--zs-bg)" style={{ width: 88, height: 88 }} />
      <button
        type="button"
        onClick={() => writerRef.current?.animateCharacter()}
        className="text-xs text-(--zs-pen) hover:underline"
      >
        ▶ Viết lại
      </button>
    </div>
  )
}
