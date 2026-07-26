import { SimplePool, nip19 } from 'nostr-tools'

/** Relays that reliably hold kind-0 profiles. */
const DISCOVERY_RELAYS = [
  'wss://purplepag.es',
  'wss://user.kindpag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
]

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
