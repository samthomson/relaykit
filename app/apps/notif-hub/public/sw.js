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
    self.registration.showNotification(data.title || 'pulse', {
      body: data.body || '',
      icon: data.icon || './icon-512.png',
      badge: './icon-512.png',
      data: { url: data.url, entryId: data.entryId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url, entryId } = event.notification.data || {}
  const tasks = []
  // Tapping the push counts as seeing it — tell the hub so every device agrees.
  if (entryId) {
    tasks.push(fetch(`${self.registration.scope}seen/${entryId}`, { method: 'POST' }).catch(() => {}))
  }
  if (url) {
    // openWindow can't handle custom schemes; bounce nostr: URIs through the hub
    // page, which hands them to the OS-registered nostr client.
    const target = url.startsWith('nostr:')
      ? `${self.registration.scope}?open=${encodeURIComponent(url)}`
      : url
    tasks.push(self.clients.openWindow(target))
  }
  event.waitUntil(Promise.all(tasks))
})
