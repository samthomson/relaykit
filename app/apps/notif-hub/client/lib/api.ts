import type { LinkClient, NotificationEntry, NotificationRule, NtfyConfig, PushDeviceInfo } from '../../types'
import { clearToken, getToken, nip98Header, setToken, type LoginMethod } from './auth'

/** In dev Vite proxies /apps/notif-hub/api → Express; in prod Traefik strips the prefix. */
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export class UnauthorizedError extends Error {}

export type HubConfigResponse = {
  npub: string | null
  relays: string[]
  discoveryRelays: string[]
  linkClient: LinkClient
  ntfy: NtfyConfig
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
    if (res.status === 401 || res.status === 403) {
      clearToken()
      throw new UnauthorizedError(detail || 'not authorised')
    }
    throw new Error(`request failed (${res.status}${detail ? `: ${detail}` : ''})`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** Every api call carries the device's bearer token; the gate obtains it via nostr or pairing. */
const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return handle<T>(await fetch(`${API_BASE}${path}`, { ...init, headers }))
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const getAuthState = async (signal?: AbortSignal): Promise<{ unclaimed: boolean }> =>
  handle(await fetch(`${API_BASE}/api/auth/state`, { signal }))

/** Signs a nip-98 event with the chosen login method and swaps it for this device's token. */
export const signInWithNostr = async (login: LoginMethod, label: string): Promise<void> => {
  const url = `${window.location.origin}${API_BASE}/api/auth/nostr`
  const header = await nip98Header(login, 'POST', url)
  const { token } = await handle<{ token: string }>(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Nostr ${header}` },
      body: JSON.stringify({ label }),
    }),
  )
  setToken(token)
}

export const getConfig = async (signal?: AbortSignal): Promise<HubConfigResponse> =>
  call('/api/config', { signal })

export const saveConfig = async (
  npub: string,
  relays: string[],
  discoveryRelays: string[],
  linkClient: LinkClient,
): Promise<void> => call('/api/config', json('PUT', { npub, relays, discoveryRelays, linkClient }))

export const saveNtfy = async (ntfy: Pick<NtfyConfig, 'enabled' | 'server' | 'topic' | 'token'>): Promise<NtfyConfig> =>
  call('/api/ntfy', json('PUT', ntfy))

export const testNtfy = async (): Promise<{ ok: boolean; error?: string }> =>
  call('/api/ntfy/test', { method: 'POST' })

export const listRules = async (signal?: AbortSignal): Promise<NotificationRule[]> =>
  call('/api/rules', { signal })

export const setRuleEnabled = async (id: string, enabled: boolean): Promise<NotificationRule> =>
  call(`/api/rules/${encodeURIComponent(id)}`, json('PUT', { enabled }))

export const addCustomRule = async (label: string, filter: Record<string, unknown>): Promise<NotificationRule> =>
  call('/api/rules', json('POST', { label, filter }))

export const deleteRule = async (id: string): Promise<void> =>
  call(`/api/rules/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const listDevices = async (signal?: AbortSignal): Promise<PushDeviceInfo[]> =>
  call('/api/devices', { signal })

export const registerDevice = async (label: string, subscription: PushSubscriptionJSON): Promise<PushDeviceInfo> =>
  call('/api/devices', json('POST', { label, subscription }))

export const deleteDevice = async (id: string): Promise<void> =>
  call(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const listNotifications = async (signal?: AbortSignal): Promise<NotificationEntry[]> =>
  call('/api/notifications', { signal })

export const markSeen = async (id: string): Promise<void> =>
  call(`/api/notifications/${encodeURIComponent(id)}/seen`, { method: 'POST' })

export const markAllSeen = async (): Promise<{ marked: number }> =>
  call('/api/notifications/seen-all', { method: 'POST' })

export const sendTestNotification = async (): Promise<{ pushed: number }> =>
  call('/api/test', { method: 'POST' })
