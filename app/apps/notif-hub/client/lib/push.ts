const SW_URL = `${import.meta.env.BASE_URL}sw.js`

export const pushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isIos = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  // iPadOS reports as Mac but has touch support
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)

export const isInstalledPwa = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export const getExistingSubscription = async (): Promise<PushSubscription | null> => {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration(SW_URL)
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/** A subscription bound to an old VAPID key is useless — pushes signed with the current key get rejected. */
export const subscriptionMatchesKey = (subscription: PushSubscription, vapidPublicKey: string): boolean =>
  sameKey(subscription.options.applicationServerKey, urlBase64ToUint8Array(vapidPublicKey))

const sameKey = (existing: ArrayBuffer | null, wanted: Uint8Array): boolean => {
  if (!existing) return false
  const a = new Uint8Array(existing)
  return a.length === wanted.length && a.every((byte, i) => byte === wanted[i])
}

export const subscribeToPush = async (vapidPublicKey: string): Promise<PushSubscriptionJSON> => {
  const registration = await navigator.serviceWorker.register(SW_URL)
  await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('notification permission denied')
  }
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
  // subscribe() returns any existing subscription regardless of the key passed in,
  // so a subscription bound to an old VAPID key must be dropped first — otherwise
  // the push service rejects our pushes (Apple: 403 BadJwtToken).
  const existing = await registration.pushManager.getSubscription()
  if (existing && !sameKey(existing.options.applicationServerKey, applicationServerKey)) {
    await existing.unsubscribe()
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  })
  // Firefox resolves with null (instead of rejecting) when its push service can't
  // register the subscription — usually the browser lacks os-level notification access.
  if (!subscription) {
    throw new Error('the browser returned no push subscription — check that the browser itself is allowed to send notifications in android settings, then retry')
  }
  return subscription.toJSON()
}

export const defaultDeviceLabel = (): string => {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : 'device'
  const browser = /Firefox/.test(ua) ? 'firefox' : /Edg\//.test(ua) ? 'edge' : /Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'browser'
  return `${os} · ${browser}`
}
