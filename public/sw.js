// The review reminder's service worker (issue #91), registered only by the reminder panel on
// /account. No fetch listener and no Cache Storage: every request still goes to the network.

self.addEventListener('install', () => self.skipWaiting())

// Every push must show a notification: Safari revokes the permission after a silent one.
self.addEventListener('push', (event) => {
  let due = null
  try {
    const n = event.data ? event.data.json().due : null
    if (Number.isInteger(n) && n > 0) due = n
  } catch {
    // An unreadable payload still gets the general line below.
  }
  event.waitUntil(self.registration.showNotification(
    due ? `${due} từ đến hạn ôn hôm nay.` : 'Có từ đến hạn ôn hôm nay.',
    { body: 'Ôn ngay.', tag: 'review', icon: '/apple-icon.png' },
  ))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/practice/review'))
})
