export type RuleType = 'mention' | 'reply' | 'reaction' | 'repost' | 'quote' | 'zap' | 'dm' | 'dm-legacy' | 'custom'

export type NotificationRule = {
  id: string
  type: RuleType
  enabled: boolean
  /** custom rules only */
  label?: string
  /** custom rules only: raw nostr filter */
  filter?: Record<string, unknown>
  createdAt: string
}

export type PushDevice = {
  id: string
  label: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
  lastOkAt?: string
  /** last push delivery failure (cleared on success), so failures are visible in the ui */
  lastError?: string
  lastErrorAt?: string
}

/** Device as returned by the API (no push keys). */
export type PushDeviceInfo = {
  id: string
  label: string
  endpoint: string
  createdAt: string
  lastOkAt?: string
  lastError?: string
  lastErrorAt?: string
}

export type NotificationEntry = {
  id: string
  ruleType: RuleType
  title: string
  body: string
  eventId: string
  eventKind: number
  authorPubkey: string
  url?: string
  createdAt: string
  /** number of devices the push was delivered to */
  pushed: number
}

export type LinkClient = 'njump' | 'primal' | 'iris' | 'jumble' | 'ditto' | 'yakihonne' | 'native'

/**
 * Clients notification links can open in; the nevent goes into the url template.
 * 'native' produces a nostr: URI (NIP-21) which the OS hands to the registered
 * nostr app (damus, amethyst, …) — the service worker routes it via the hub origin.
 */
export const LINK_CLIENTS: Record<LinkClient, { label: string; eventUrl: (nevent: string) => string }> = {
  njump: { label: 'njump (web view)', eventUrl: (nevent) => `https://njump.me/${nevent}` },
  primal: { label: 'primal', eventUrl: (nevent) => `https://primal.net/e/${nevent}` },
  iris: { label: 'iris', eventUrl: (nevent) => `https://iris.to/${nevent}` },
  jumble: { label: 'jumble', eventUrl: (nevent) => `https://jumble.social/notes/${nevent}` },
  ditto: { label: 'ditto', eventUrl: (nevent) => `https://ditto.pub/${nevent}` },
  yakihonne: { label: 'yakihonne', eventUrl: (nevent) => `https://yakihonne.com/${nevent}` },
  native: { label: 'native app (damus, amethyst, …)', eventUrl: (nevent) => `nostr:${nevent}` },
}

export type HubConfig = {
  /** owner pubkey in hex (null until configured) */
  pubkey: string | null
  npub: string | null
  relays: string[]
  /** which client notification links open in */
  linkClient: LinkClient
}
