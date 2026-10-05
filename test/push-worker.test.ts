import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'

type Listener = (event: unknown) => void

/** public/sw.js in a bare context, with the worker globals it touches. */
function loadWorker() {
  const listeners = new Map<string, Listener>()
  const showNotification = vi.fn(async () => {})
  const openWindow = vi.fn(async () => null)
  const skipWaiting = vi.fn(async () => {})
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    registration: { showNotification },
    clients: { openWindow },
    skipWaiting,
  }
  runInNewContext(readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8'), { self, Number })
  return { listeners, showNotification, openWindow, skipWaiting }
}

/** A push event whose payload reads as `json` returns or throws. */
function push(json: () => unknown) {
  const waits: Promise<unknown>[] = []
  return { event: { data: { json }, waitUntil: (p: Promise<unknown>) => waits.push(p) }, waits }
}

describe('service worker', () => {
  it('listens to install, push and notificationclick, and never to fetch', () => {
    const { listeners, skipWaiting } = loadWorker()
    expect([...listeners.keys()].sort()).toEqual(['install', 'notificationclick', 'push'])
    listeners.get('install')?.({})
    expect(skipWaiting).toHaveBeenCalled()
  })

  it('names the due count in the notification', () => {
    const { listeners, showNotification } = loadWorker()
    const { event, waits } = push(() => ({ due: 12 }))
    listeners.get('push')?.(event)
    expect(waits).toHaveLength(1)
    expect(showNotification).toHaveBeenCalledWith('12 từ đến hạn ôn hôm nay.', {
      body: 'Ôn ngay.', tag: 'review', icon: '/apple-icon.png',
    })
  })

  it.each([
    ['an unreadable payload', () => { throw new SyntaxError('bad json') }],
    ['a missing count', () => ({})],
    ['a count of 0', () => ({ due: 0 })],
    ['a count sent as text', () => ({ due: '3' })],
  ])('still shows a notification for %s', (_, json) => {
    const { listeners, showNotification } = loadWorker()
    const { event, waits } = push(json)
    listeners.get('push')?.(event)
    expect(waits).toHaveLength(1)
    expect(showNotification).toHaveBeenCalledWith('Có từ đến hạn ôn hôm nay.', expect.objectContaining({ tag: 'review' }))
  })

  it('shows a notification for a push with no payload', () => {
    const { listeners, showNotification } = loadWorker()
    const waits: Promise<unknown>[] = []
    listeners.get('push')?.({ data: null, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    expect(showNotification).toHaveBeenCalledWith('Có từ đến hạn ôn hôm nay.', expect.anything())
  })

  it('opens the review session on a click', () => {
    const { listeners, openWindow } = loadWorker()
    const close = vi.fn()
    const waits: Promise<unknown>[] = []
    listeners.get('notificationclick')?.({ notification: { close }, waitUntil: (p: Promise<unknown>) => waits.push(p) })
    expect(close).toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/practice/review')
    expect(waits).toHaveLength(1)
  })
})
