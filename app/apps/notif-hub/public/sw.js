self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'notif hub', {
      body: data.body || '',
      icon: data.icon || './icon-512.png',
      badge: './icon-512.png',
      data: { url: data.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url
  if (!url) return
  // openWindow can't handle custom schemes; bounce nostr: URIs through the hub
  // page, which hands them to the OS-registered nostr client.
  const target = url.startsWith('nostr:')
    ? `${self.registration.scope}?open=${encodeURIComponent(url)}`
    : url
  event.waitUntil(self.clients.openWindow(target))
})
