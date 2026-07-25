import type { LinkClient, NotificationEntry, NotificationRule, PushDeviceInfo } from '../../types'

/** In dev Vite proxies /apps/notif-hub/api → Express; in prod Traefik strips the prefix. */
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export type HubConfigResponse = {
  npub: string | null
  relays: string[]
  linkClient: LinkClient
  vapidPublicKey: string
}

const handle = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.error || body?.message || JSON.stringify(body)
    } catch {
      detail = await res.text().catch(() => '')
    }
    throw new Error(`request failed (${res.status}${detail ? `: ${detail}` : ''})`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const getConfig = async (signal?: AbortSignal): Promise<HubConfigResponse> =>
  handle(await fetch(`${API_BASE}/api/config`, { signal }))

export const saveConfig = async (npub: string, relays: string[], linkClient: LinkClient): Promise<void> =>
  handle(await fetch(`${API_BASE}/api/config`, json('PUT', { npub, relays, linkClient })))

export const listRules = async (signal?: AbortSignal): Promise<NotificationRule[]> =>
  handle(await fetch(`${API_BASE}/api/rules`, { signal }))

export const setRuleEnabled = async (id: string, enabled: boolean): Promise<NotificationRule> =>
  handle(await fetch(`${API_BASE}/api/rules/${encodeURIComponent(id)}`, json('PUT', { enabled })))

export const addCustomRule = async (label: string, filter: Record<string, unknown>): Promise<NotificationRule> =>
  handle(await fetch(`${API_BASE}/api/rules`, json('POST', { label, filter })))

export const deleteRule = async (id: string): Promise<void> =>
  handle(await fetch(`${API_BASE}/api/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }))

export const listDevices = async (signal?: AbortSignal): Promise<PushDeviceInfo[]> =>
  handle(await fetch(`${API_BASE}/api/devices`, { signal }))

export const registerDevice = async (label: string, subscription: PushSubscriptionJSON): Promise<PushDeviceInfo> =>
  handle(await fetch(`${API_BASE}/api/devices`, json('POST', { label, subscription })))

export const deleteDevice = async (id: string): Promise<void> =>
  handle(await fetch(`${API_BASE}/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' }))

export const listNotifications = async (signal?: AbortSignal): Promise<NotificationEntry[]> =>
  handle(await fetch(`${API_BASE}/api/notifications`, { signal }))

export const sendTestNotification = async (): Promise<{ pushed: number }> =>
  handle(await fetch(`${API_BASE}/api/test`, { method: 'POST' }))
