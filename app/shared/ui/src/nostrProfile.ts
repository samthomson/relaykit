import { SimplePool, nip19 } from 'nostr-tools'

/** Relays that reliably hold kind-0 profiles. */
export const DISCOVERY_RELAYS = [
  'wss://purplepag.es',
  'wss://user.kindpag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

/** NIP-65 relay list metadata. */
const RELAY_LIST_KIND = 10002

export type NostrProfile = { name?: string; picture?: string }

export const npubToHex = (npub: string): string | null => {
  try {
    const decoded = nip19.decode(npub.trim())
    return decoded.type === 'npub' ? decoded.data : null
  } catch {
    return null
  }
}

const cache = new Map<string, Promise<NostrProfile>>()

/** Best-effort kind-0 lookup, cached per pubkey for the session. */
export const fetchNostrProfile = (pubkeyHex: string): Promise<NostrProfile> => {
  const cached = cache.get(pubkeyHex)
  if (cached) return cached
  const promise = (async () => {
    const pool = new SimplePool()
    try {
      const events = await pool.querySync(DISCOVERY_RELAYS, { authors: [pubkeyHex], kinds: [0], limit: 5 })
      let latest: (typeof events)[number] | undefined
      for (const ev of events) if (!latest || ev.created_at > latest.created_at) latest = ev
      if (!latest) return {}
      const meta = JSON.parse(latest.content) as Record<string, unknown>
      const name = ((meta.display_name as string) || (meta.name as string) || '').trim()
      const picture = typeof meta.picture === 'string' && /^https?:\/\//.test(meta.picture) ? meta.picture : undefined
      return { name: name || undefined, picture }
    } catch {
      return {}
    } finally {
      pool.close(DISCOVERY_RELAYS)
    }
  })()
  cache.set(pubkeyHex, promise)
  return promise
}

const relayListCache = new Map<string, Promise<string[]>>()

/** The user's own NIP-65 (kind 10002) relays, so they can pick from their real list instead of guesses. */
export const fetchRelayList = (pubkeyHex: string): Promise<string[]> => {
  const cached = relayListCache.get(pubkeyHex)
  if (cached) return cached
  const promise = (async () => {
    const pool = new SimplePool()
    try {
      const events = await pool.querySync(DISCOVERY_RELAYS, {
        authors: [pubkeyHex],
        kinds: [RELAY_LIST_KIND],
        limit: 5,
      })
      let latest: (typeof events)[number] | undefined
      for (const ev of events) if (!latest || ev.created_at > latest.created_at) latest = ev
      if (!latest) return []
      // 'r' tags are [url] or [url, 'read'|'write']; reading notifications only needs read relays.
      return latest.tags
        .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string' && tag[2] !== 'write')
        .map((tag) => tag[1])
    } catch {
      return []
    } finally {
      pool.close(DISCOVERY_RELAYS)
    }
  })()
  relayListCache.set(pubkeyHex, promise)
  return promise
}
