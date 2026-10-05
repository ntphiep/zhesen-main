import type { DeviceKeys } from '@/lib/push/reminders'

/** What this browser can do about a reminder. */
export type PushSupport = 'ok' | 'install' | 'blocked' | 'none'

/** Browser only. iOS and iPadOS give push only to an app opened from the Home Screen
 *  (https://webkit.org/blog/13878/), and only there is `navigator.standalone` false. */
export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!capable) return Reflect.get(navigator, 'standalone') === false ? 'install' : 'none'
  return Notification.permission === 'denied' ? 'blocked' : 'ok'
}

/** `updateViaCache: 'none'` so a changed sw.js is picked up on the next visit. */
export function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
}

/** Must run inside the click, before any await: Safari asks for permission only from a gesture. */
export function subscribe(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
}

export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '='))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** The keys read from the subscription itself rather than `toJSON()`, whose padding varies. */
export function deviceKeys(subscription: PushSubscription): DeviceKeys {
  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!p256dh || !auth) throw new Error('push subscription has no keys')
  return { endpoint: subscription.endpoint, p256dh: bytesToBase64Url(p256dh), auth: bytesToBase64Url(auth) }
}
