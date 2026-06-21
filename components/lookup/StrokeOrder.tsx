'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Animated stroke-order for a single Han character (hanzii-style "Tập viết").
 * Uses hanzi-writer, loaded dynamically so it is code-split out of the main
 * bundle and never runs during SSR. Stroke data is fetched from the hanzi-writer
 * CDN at runtime; if a character has no data the widget hides itself rather than
 * erroring.
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
    import('hanzi-writer').then(({ default: HanziWriter }) => {
      if (cancelled || !ref.current) return
      const writer = HanziWriter.create(ref.current, char, {
        width: 88,
        height: 88,
        padding: 5,
        showCharacter: false,
        showOutline: true,
        strokeColor: '#111',
        outlineColor: '#d4d4d4',
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 280,
        onLoadCharDataError: () => { if (!cancelled) setFailed(true) },
      })
      writerRef.current = writer
      writer.animateCharacter()
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
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
