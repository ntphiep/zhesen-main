'use client'
import { useEffect, useRef, useState } from 'react'

export type Poll<T> =
  | { state: 'loading' }
  | { state: 'ok'; data: T; at: number }
  | { state: 'error'; message: string; data?: T; at?: number }

/**
 * GETs `url` every `everyMs` while the tab is visible, and once more on return to it.
 * A failed poll keeps the last good data beside the error, so a blip does not blank the
 * screen. `onData` sees every good response in order, for turning counters into rates.
 */
export function usePoll<T>(url: string, everyMs: number, parse: (raw: unknown) => T, onData?: (d: T) => void): Poll<T> {
  const [poll, setPoll] = useState<Poll<T>>({ state: 'loading' })
  const parseRef = useRef(parse)
  const onDataRef = useRef(onData)
  useEffect(() => {
    parseRef.current = parse
    onDataRef.current = onData
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let alive = true
    let inFlight = false

    async function tick() {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible' || inFlight) return
      inFlight = true
      const fail = (message: string) =>
        setPoll((p) => ({ state: 'error', message, data: p.state === 'loading' ? undefined : p.data, at: p.state === 'loading' ? undefined : p.at }))
      try {
        const res = await fetch(url, { cache: 'no-store' })
        const body: unknown = await res.json()
        if (!alive) return
        if (!res.ok) {
          fail(typeof body === 'object' && body && 'error' in body && typeof body.error === 'string' ? body.error : `Error ${res.status}`)
        } else {
          let data: T
          try {
            data = parseRef.current(body)
          } catch {
            fail('Server returned data in the wrong shape.')
            return
          }
          onDataRef.current?.(data)
          setPoll({ state: 'ok', data, at: Date.now() })
        }
      } catch {
        if (alive) fail('Lost connection to the server.')
      } finally {
        inFlight = false
        if (alive) timer = setTimeout(() => void tick(), everyMs)
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, everyMs])

  return poll
}
