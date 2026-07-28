import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { LINK_CLIENTS } from '../types.js'
import type { HubConfig, NotificationEntry, NotificationRule, NtfyConfig, PushDevice, RuleType } from '../types.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

const MAX_NOTIFICATIONS = 200

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

const readJson = <T>(file: string, fallback: T): T => {
  ensureDir()
  const full = path.join(DATA_DIR, file)
  if (!fs.existsSync(full)) return fallback
  return JSON.parse(fs.readFileSync(full, 'utf-8'))
}

const writeJson = (file: string, data: unknown) => {
  ensureDir()
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2))
}

// --- config ---

// Deliberately empty: watching a guessed relay set silently produces no notifications and looks
// like a broken hub. The settings ui offers the owner's own nip-65 relays to pick from instead.
const DEFAULT_RELAYS: string[] = []

// Profile aggregators: where author kind-0s are looked up when the watch relays lack them.
const DEFAULT_DISCOVERY_RELAYS = ['wss://purplepag.es', 'wss://relay.nostr.band']

// Deployed via the preset, NTFY_DEFAULT_SERVER points at the bundled self-hosted ntfy.
const DEFAULT_NTFY: NtfyConfig = { enabled: false, server: process.env.NTFY_DEFAULT_SERVER || 'https://ntfy.sh', topic: '' }

const DEFAULT_CONFIG: HubConfig = {
  pubkey: null,
  npub: null,
  relays: DEFAULT_RELAYS,
  discoveryRelays: DEFAULT_DISCOVERY_RELAYS,
  linkClient: 'njump',
  ntfy: DEFAULT_NTFY,
}

export const loadConfig = (): HubConfig => {
  const config = { ...DEFAULT_CONFIG, ...readJson<Partial<HubConfig>>('config.json', {}) }
  // A saved client that no longer exists (removed option) falls back to the default.
  if (!(config.linkClient in LINK_CLIENTS)) config.linkClient = 'njump'
  config.ntfy = { ...DEFAULT_NTFY, ...config.ntfy }
  return config
}

export const saveConfig = (config: HubConfig) => {
  writeJson('config.json', config)
}

/** Keeps the last ntfy delivery outcome on the config so failures surface in the ui. */
export const recordNtfyResult = (result: { ok: true } | { ok: false; error: string }) => {
  const config = loadConfig()
  const now = new Date().toISOString()
  config.ntfy = result.ok
    ? { ...config.ntfy, lastOkAt: now, lastError: undefined, lastErrorAt: undefined }
    : { ...config.ntfy, lastError: result.error, lastErrorAt: now }
  saveConfig(config)
}

// --- rules ---

const PRESET_TYPES: RuleType[] = ['mention', 'reply', 'reaction', 'repost', 'quote', 'zap', 'dm', 'dm-legacy']

/** Seeds preset rules on first run; also appends presets added in later versions to existing installs. */
export const loadRules = (): NotificationRule[] => {
  const rules = readJson<NotificationRule[]>('rules.json', [])
  const existing = new Set(rules.map((r) => r.type))
  const missing = PRESET_TYPES.filter((type) => !existing.has(type))
  if (missing.length > 0) {
    for (const type of missing) {
      rules.push({ id: type, type, enabled: true, createdAt: new Date().toISOString() })
    }
    writeJson('rules.json', rules)
  }
  return rules
}

export const updateRule = (id: string, updates: Partial<NotificationRule>): NotificationRule | null => {
  const rules = loadRules()
  const idx = rules.findIndex((r) => r.id === id)
  if (idx === -1) return null
  rules[idx] = { ...rules[idx], ...updates, id: rules[idx].id, type: rules[idx].type }
  writeJson('rules.json', rules)
  return rules[idx]
}

export const addCustomRule = (label: string, filter: Record<string, unknown>): NotificationRule => {
  const rules = loadRules()
  const rule: NotificationRule = {
    id: crypto.randomUUID(),
    type: 'custom',
    enabled: true,
    label,
    filter,
    createdAt: new Date().toISOString(),
  }
  rules.push(rule)
  writeJson('rules.json', rules)
  return rule
}

export const deleteRule = (id: string): boolean => {
  const rules = loadRules()
  const target = rules.find((r) => r.id === id)
  if (!target || target.type !== 'custom') return false
  writeJson('rules.json', rules.filter((r) => r.id !== id))
  return true
}

// --- devices ---

export const loadDevices = (): PushDevice[] => readJson<PushDevice[]>('devices.json', [])

export const addDevice = (input: { label: string; endpoint: string; keys: { p256dh: string; auth: string } }): PushDevice => {
  // Re-registering the same endpoint replaces the existing device.
  const devices = loadDevices().filter((d) => d.endpoint !== input.endpoint)
  const device: PushDevice = {
    id: crypto.randomUUID(),
    label: input.label,
    endpoint: input.endpoint,
    keys: input.keys,
    createdAt: new Date().toISOString(),
  }
  devices.push(device)
  writeJson('devices.json', devices)
  return device
}

export const deleteDevice = (id: string): boolean => {
  const devices = loadDevices()
  const filtered = devices.filter((d) => d.id !== id)
  if (filtered.length === devices.length) return false
  writeJson('devices.json', filtered)
  return true
}

export const deleteDeviceByEndpoint = (endpoint: string) => {
  const devices = loadDevices()
  writeJson('devices.json', devices.filter((d) => d.endpoint !== endpoint))
}

export const recordPushResult = (endpoint: string, result: { ok: true } | { ok: false; error: string }) => {
  const devices = loadDevices()
  const device = devices.find((d) => d.endpoint === endpoint)
  if (!device) return
  if (result.ok) {
    device.lastOkAt = new Date().toISOString()
    delete device.lastError
    delete device.lastErrorAt
  } else {
    device.lastError = result.error
    device.lastErrorAt = new Date().toISOString()
  }
  writeJson('devices.json', devices)
}

// --- auth ---

export type AuthStore = {
  /** long-lived bearer tokens, one per signed-in browser/pwa */
  tokens: Array<{ token: string; label: string; createdAt: string }>
}

const loadAuth = (): AuthStore => readJson<AuthStore>('auth.json', { tokens: [] })

const saveAuth = (store: AuthStore) => {
  writeJson('auth.json', store)
}

export const issueToken = (label: string): string => {
  const store = loadAuth()
  const token = crypto.randomBytes(32).toString('base64url')
  store.tokens.push({ token, label, createdAt: new Date().toISOString() })
  saveAuth(store)
  return token
}

export const tokenValid = (token: string): boolean => loadAuth().tokens.some((t) => t.token === token)

// --- watcher state ---

export type WatcherState = { lastSeenTs: number; seenIds: string[] }

export const loadWatcherState = (): WatcherState =>
  readJson<WatcherState>('state.json', { lastSeenTs: 0, seenIds: [] })

export const saveWatcherState = (state: WatcherState) => {
  writeJson('state.json', state)
}

// --- notification log ---

export const loadNotifications = (): NotificationEntry[] => readJson<NotificationEntry[]>('notifications.json', [])

export const addNotification = (entry: Omit<NotificationEntry, 'createdAt'>): NotificationEntry => {
  const notifications = loadNotifications()
  const full: NotificationEntry = {
    ...entry,
    createdAt: new Date().toISOString(),
  }
  notifications.unshift(full)
  writeJson('notifications.json', notifications.slice(0, MAX_NOTIFICATIONS))
  return full
}

export const markNotificationSeen = (id: string): boolean => {
  const notifications = loadNotifications()
  const entry = notifications.find((n) => n.id === id)
  if (!entry) return false
  if (!entry.seenAt) {
    entry.seenAt = new Date().toISOString()
    writeJson('notifications.json', notifications)
  }
  return true
}

export const markAllNotificationsSeen = (): number => {
  const notifications = loadNotifications()
  const now = new Date().toISOString()
  let marked = 0
  for (const entry of notifications) {
    if (!entry.seenAt) {
      entry.seenAt = now
      marked++
    }
  }
  if (marked > 0) writeJson('notifications.json', notifications)
  return marked
}
