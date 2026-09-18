'use client'
import { useEffect, useRef, useState } from 'react'

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
    // palette is read from the scheme and rebuilt on a flip: #111 vanishes on dark.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
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
          strokeColor: dark ? '#ededed' : '#111',
          outlineColor: dark ? '#404040' : '#d4d4d4',
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 280,
          onLoadCharDataError: () => { if (!cancelled) setFailed(true) },
        })
        writerRef.current = writer
        writer.animateCharacter()
      }).catch(() => { if (!cancelled) setFailed(true) })
    }
    build(media.matches)
    const onScheme = (e: MediaQueryListEvent) => build(e.matches)
    media.addEventListener('change', onScheme)
    return () => { cancelled = true; media.removeEventListener('change', onScheme) }
  }, [char])

  if (failed) return null
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={ref} aria-label={`Thứ tự nét chữ ${char}`} className="rounded-lg border border-black/10 bg-white" style={{ width: 88, height: 88 }} />
      <button
        type="button"
        onClick={() => writerRef.current?.animateCharacter()}
        className="text-xs text-blue-700 hover:underline"
      >
        ▶ Viết lại
      </button>
    </div>
  )
}
