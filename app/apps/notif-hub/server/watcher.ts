import WebSocket from 'ws'
import crypto from 'crypto'
import dns from 'dns'
import { verifyEvent, nip19 } from 'nostr-tools'
import type { Event as NostrEvent, Filter } from 'nostr-tools'
import { loadConfig, loadRules, addNotification, loadWatcherState, saveWatcherState } from './storage.js'
import { sendToAll } from './push.js'
import { LINK_CLIENTS } from '../types.js'
import type { LinkClient, NotificationRule, RuleType } from '../types.js'

const TRAEFIK_HOST = process.env.TRAEFIK_HOST || 'dokploy-traefik-dev'
const RECONNECT_BASE_MS = 5_000
const RECONNECT_MAX_MS = 60_000
const SEEN_IDS_CAP = 5_000
const PERSISTED_IDS_CAP = 1_000
const CATCHUP_MAX_S = 24 * 60 * 60
const SINCE_OVERLAP_S = 60
const FUTURE_TOLERANCE_S = 300
const META_TIMEOUT_MS = 1_500
const META_CACHE_MS = 60 * 60 * 1000
const CONTENT_TRUNCATE = 100
// Relay connections can die at the TCP level (idle proxy/NAT timeout) without a close frame —
// the socket looks OPEN forever but nothing arrives again. Ping on an interval and force-close
// if nothing (not even a pong) has been heard back within a couple of intervals.
const HEARTBEAT_INTERVAL_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 35_000

// --- helpers ---

const canResolve = (hostname: string): Promise<boolean> =>
  new Promise((resolve) => {
    dns.lookup(hostname, (err) => resolve(!err))
  })

/** Local-dev relays on fake domains aren't DNS-resolvable in the container; route via traefik with a Host header. */
const rewriteUrlThroughTraefik = (url: string): { url: string; headers: Record<string, string> } => {
  const parsed = new URL(url)
  const originalHost = parsed.host
  parsed.protocol = 'ws:'
  parsed.host = `${TRAEFIK_HOST}:80`
  return { url: parsed.toString(), headers: { Host: originalHost } }
}

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

// --- state ---

type Sub = { id: string; filters: Filter[] }

type Conn = {
  url: string
  ws: WebSocket | null
  reconnectMs: number
  closed: boolean
  /** last time any frame (event, EOSE, pong, ...) was seen; used to detect a dead-but-not-closed socket */
  lastActivityAt: number
}

const conns = new Map<string, Conn>()
let subs: Sub[] = []
let rules: NotificationRule[] = []
let ownerPubkey: string | null = null
let linkClient: LinkClient = 'njump'
let lastSeenTs = 0
const seenIds = new Set<string>()
type Meta = { name: string | null; picture: string | null }
const metaCache = new Map<string, Meta & { ts: number }>()
const metaPending = new Map<string, Array<(meta: Meta) => void>>()

// --- subscription building ---

const RULE_KINDS: Partial<Record<RuleType, number[]>> = {
  mention: [1],
  reply: [1, 1111],
  quote: [1],
  reaction: [7],
  repost: [6, 16],
  zap: [9735],
  dm: [1059],
  'dm-legacy': [4],
}

/** Resume from the last processed event (capped at 24h back) so downtime doesn't lose notifications. */
const subscribeSince = (): number => {
  const now = Math.floor(Date.now() / 1000)
  if (lastSeenTs === 0) return now
  return Math.max(lastSeenTs - SINCE_OVERLAP_S, now - CATCHUP_MAX_S)
}

const buildSubs = (pubkey: string, activeRules: NotificationRule[]): Sub[] => {
  const since = subscribeSince()
  const result: Sub[] = []
  const kinds = new Set<number>()
  for (const rule of activeRules) {
    if (rule.type === 'custom') {
      result.push({ id: `custom-${rule.id}`, filters: [{ ...(rule.filter as Filter), since }] })
    } else {
      for (const k of RULE_KINDS[rule.type] ?? []) kinds.add(k)
    }
  }
  if (kinds.size > 0) {
    result.push({ id: 'tagged', filters: [{ kinds: [...kinds].sort((a, b) => a - b), '#p': [pubkey], since }] })
  }
  return result
}

// --- event classification + formatting ---

const hasTag = (ev: NostrEvent, name: string): boolean => ev.tags.some((t) => t[0] === name)

const classify = (ev: NostrEvent): RuleType | null => {
  switch (ev.kind) {
    case 7:
      return 'reaction'
    case 6:
    case 16:
      return 'repost'
    case 9735:
      return 'zap'
    case 4:
      return 'dm-legacy'
    case 1059:
      return 'dm'
    case 1111:
      // NIP-22 comment; it p-tags the parent author, which is how it reached us.
      return 'reply'
    case 1:
      if (hasTag(ev, 'q')) return 'quote'
      if (hasTag(ev, 'e')) return 'reply'
      return 'mention'
    default:
      return null
  }
}

/** Reads the amount out of a bolt11 invoice's hrp (e.g. lnbc2500u1...) in sats. */
const bolt11Sats = (invoice: string): number | null => {
  const match = /^ln(?:bc|tb|bcrt)(\d+)([munp])?1/.exec(invoice.trim().toLowerCase())
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  // Multiplier is a fraction of a BTC (1e8 sats): m=1e-3, u=1e-6, n=1e-9, p=1e-12.
  const satsPerUnit = { m: 1e5, u: 1e2, n: 1e-1, p: 1e-4, '': 1e8 }[match[2] ?? '']
  const sats = value * satsPerUnit
  return Number.isInteger(sats) ? sats : Math.floor(sats)
}

/**
 * For zap receipts the real sender + amount live in the embedded zap request (description tag).
 * The request's amount tag is optional, so fall back to the invoice on the receipt itself —
 * that one is authoritative anyway, it's what was actually paid.
 */
const parseZap = (ev: NostrEvent): { sender: string; sats: number | null } => {
  const invoice = ev.tags.find((t) => t[0] === 'bolt11')?.[1]
  const invoiceSats = invoice ? bolt11Sats(invoice) : null
  try {
    const description = ev.tags.find((t) => t[0] === 'description')?.[1]
    if (!description) return { sender: ev.pubkey, sats: invoiceSats }
    const zapRequest = JSON.parse(description)
    const amountTag = (zapRequest.tags as string[][] | undefined)?.find((t) => t[0] === 'amount')?.[1]
    const requestSats = amountTag ? Math.floor(Number(amountTag) / 1000) : null
    return {
      sender: zapRequest.pubkey || ev.pubkey,
      sats: Number.isFinite(requestSats ?? NaN) ? requestSats : invoiceSats,
    }
  } catch {
    return { sender: ev.pubkey, sats: invoiceSats }
  }
}

const shortPubkey = (pk: string): string => {
  try {
    return `${nip19.npubEncode(pk).slice(0, 12)}…`
  } catch {
    return pk.slice(0, 8)
  }
}

// --- profile name resolution ---

/** One-shot kind-0 lookup on the configured discovery relays, for authors whose profiles aren't on the watch relays. */
const fetchDiscoveryMeta = (pubkey: string): Promise<NostrEvent | null> =>
  new Promise((resolve) => {
    const discoveryRelays = loadConfig().discoveryRelays
    if (discoveryRelays.length === 0) {
      resolve(null)
      return
    }
    let best: NostrEvent | null = null
    let remaining = discoveryRelays.length
    let done = false
    const sockets: WebSocket[] = []
    const finish = () => {
      if (done) return
      done = true
      for (const ws of sockets) {
        try { ws.close() } catch {}
      }
      resolve(best)
    }
    const oneDone = () => {
      remaining--
      if (remaining <= 0) finish()
    }
    setTimeout(finish, META_TIMEOUT_MS * 2)
    for (const url of discoveryRelays) {
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        oneDone()
        continue
      }
      sockets.push(ws)
      ws.on('open', () => ws.send(JSON.stringify(['REQ', 'meta', { kinds: [0], authors: [pubkey], limit: 1 }])))
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg[0] === 'EVENT' && msg[2]?.kind === 0 && msg[2].pubkey === pubkey) {
            if (!best || msg[2].created_at > best.created_at) best = msg[2]
          } else if (msg[0] === 'EOSE') {
            oneDone()
          }
        } catch {}
      })
      ws.on('error', oneDone)
    }
  })

const requestMeta = (pubkey: string): Promise<Meta> => {
  const cached = metaCache.get(pubkey)
  if (cached && Date.now() - cached.ts < META_CACHE_MS) {
    return Promise.resolve({ name: cached.name, picture: cached.picture })
  }

  const pending = metaPending.get(pubkey)
  if (pending) return new Promise((resolve) => pending.push(resolve))

  return new Promise((resolve) => {
    metaPending.set(pubkey, [resolve])
    const subId = `meta-${pubkey.slice(0, 8)}-${Date.now()}`
    let best: NostrEvent | null = null

    const finish = async () => {
      if (!best) best = await fetchDiscoveryMeta(pubkey)
      const meta: Meta = { name: null, picture: null }
      if (best) {
        try {
          const profile = JSON.parse(best.content)
          meta.name = profile.display_name || profile.name || null
          meta.picture = typeof profile.picture === 'string' && /^https?:\/\//.test(profile.picture) ? profile.picture : null
        } catch {}
      }
      metaCache.set(pubkey, { ...meta, ts: Date.now() })
      metaHandlers.delete(subId)
      for (const conn of conns.values()) {
        sendOn(conn, JSON.stringify(['CLOSE', subId]))
      }
      const waiters = metaPending.get(pubkey) ?? []
      metaPending.delete(pubkey)
      for (const w of waiters) w(meta)
    }

    metaHandlers.set(subId, (ev) => {
      if (ev.kind === 0 && ev.pubkey === pubkey && (!best || ev.created_at > best.created_at)) best = ev
    })

    const req = JSON.stringify(['REQ', subId, { kinds: [0], authors: [pubkey], limit: 1 }])
    let sent = 0
    for (const conn of conns.values()) {
      if (sendOn(conn, req)) sent++
    }
    if (sent === 0) {
      finish()
      return
    }
    setTimeout(finish, META_TIMEOUT_MS)
  })
}

const metaHandlers = new Map<string, (ev: NostrEvent) => void>()

// --- notification pipeline ---

const refToPubkey = (ref: string): string | null => {
  try {
    const decoded = nip19.decode(ref.slice('nostr:'.length))
    if (decoded.type === 'npub') return decoded.data
    if (decoded.type === 'nprofile') return decoded.data.pubkey
  } catch {}
  return null
}

/** Make raw note content readable in a one-line notification: profile refs → @name, event refs → [note]. */
const renderContent = async (text: string): Promise<string> => {
  const profileRefs = [...new Set(text.match(/nostr:(?:npub|nprofile)1[a-z0-9]+/g) ?? [])].slice(0, 5)
  const names = await Promise.all(
    profileRefs.map(async (ref) => {
      const pubkey = refToPubkey(ref)
      if (!pubkey) return null
      const { name } = await requestMeta(pubkey)
      return name ?? shortPubkey(pubkey)
    }),
  )
  for (let i = 0; i < profileRefs.length; i++) {
    if (names[i]) text = text.split(profileRefs[i]).join(`@${names[i]}`)
  }
  return text
    .replace(/nostr:(?:nevent|note|naddr)1[a-z0-9]+/g, '[note]')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ntfy renders these emoji shortcodes in front of the push title. */
const NTFY_TAGS: Partial<Record<RuleType, string>> = {
  mention: 'speech_balloon',
  reply: 'speech_balloon',
  quote: 'speech_balloon',
  reaction: 'heart',
  repost: 'repeat',
  zap: 'zap',
  dm: 'envelope',
  'dm-legacy': 'envelope',
}

type Formatted = { title: string; body: string; author: string; icon?: string }

const formatNotification = async (
  ruleType: RuleType,
  rule: NotificationRule,
  ev: NostrEvent,
): Promise<Formatted> => {
  if (ruleType === 'dm') {
    // NIP-17 gift wraps have an ephemeral author; there is nothing more to say.
    return { title: 'private message', body: 'new private message', author: ev.pubkey }
  }
  if (ruleType === 'dm-legacy') {
    const meta = await requestMeta(ev.pubkey)
    const name = meta.name ?? shortPubkey(ev.pubkey)
    return { title: 'private message', body: `${name} sent you a message`, author: ev.pubkey, icon: meta.picture ?? undefined }
  }
  if (ruleType === 'zap') {
    const { sender, sats } = parseZap(ev)
    const meta = await requestMeta(sender)
    const name = meta.name ?? shortPubkey(sender)
    return { title: 'zap', body: `${name} zapped you ${sats ?? '?'} sats`, author: sender, icon: meta.picture ?? undefined }
  }

  const meta = await requestMeta(ev.pubkey)
  const name = meta.name ?? shortPubkey(ev.pubkey)
  const icon = meta.picture ?? undefined
  const content = truncate(await renderContent(ev.content), CONTENT_TRUNCATE)
  switch (ruleType) {
    case 'mention':
      return { title: 'mention', body: `${name}: ${content}`, author: ev.pubkey, icon }
    case 'reply':
      return { title: 'reply', body: `${name}: ${content}`, author: ev.pubkey, icon }
    case 'quote':
      return { title: 'quote', body: `${name} quoted you: ${content}`, author: ev.pubkey, icon }
    case 'reaction': {
      // NIP-30 custom emoji: content is :shortcode: and the image lives in an emoji tag.
      // Notification text can't show the image, so name the emoji instead of leaking colons.
      const custom = /^:([\w+-]+):$/.exec(ev.content.trim())
      const body =
        ev.content === '+' || ev.content === ''
          ? `${name} liked your note`
          : custom
            ? `${name} reacted with ${custom[1]}`
            : `${name} reacted ${truncate(ev.content, 20)}`
      return { title: 'reaction', body, author: ev.pubkey, icon }
    }
    case 'repost':
      return { title: 'repost', body: `${name} reposted your note`, author: ev.pubkey, icon }
    default:
      return { title: rule.label || 'notification', body: `${name}: ${content}`, author: ev.pubkey, icon }
  }
}

/** Advance the persisted cursor so a restart resumes where we left off instead of missing events. */
const markProcessed = (ev: NostrEvent) => {
  const now = Math.floor(Date.now() / 1000)
  // Ignore bogus future timestamps so one broken client can't jump the cursor past real events.
  if (ev.created_at <= now + FUTURE_TOLERANCE_S) {
    lastSeenTs = Math.max(lastSeenTs, ev.created_at)
  }
  saveWatcherState({ lastSeenTs, seenIds: [...seenIds].slice(-PERSISTED_IDS_CAP) })
}

const handleEvent = async (subId: string, ev: NostrEvent) => {
  const metaHandler = metaHandlers.get(subId)
  if (metaHandler) {
    metaHandler(ev)
    return
  }

  if (!verifyEvent(ev)) return
  if (seenIds.has(ev.id)) return
  seenIds.add(ev.id)
  if (seenIds.size > SEEN_IDS_CAP) {
    for (const id of seenIds) {
      seenIds.delete(id)
      if (seenIds.size <= SEEN_IDS_CAP / 2) break
    }
  }
  markProcessed(ev)
  if (ev.pubkey === ownerPubkey) return

  let rule: NotificationRule | undefined
  if (subId === 'tagged') {
    const ruleType = classify(ev)
    if (!ruleType) return
    rule = rules.find((r) => r.type === ruleType && r.enabled)
  } else if (subId.startsWith('custom-')) {
    rule = rules.find((r) => `custom-${r.id}` === subId && r.enabled)
  }
  if (!rule) return

  const { title, body, author, icon } = await formatNotification(rule.type, rule, ev)

  let url: string | undefined
  if (rule.type !== 'dm' && rule.type !== 'dm-legacy') {
    try {
      url = LINK_CLIENTS[linkClient].eventUrl(nip19.neventEncode({ id: ev.id, author: ev.pubkey, kind: ev.kind }))
    } catch {}
  }

  const entryId = crypto.randomUUID()
  const pushed = await sendToAll({ title, body, url, icon, entryId, tags: [NTFY_TAGS[rule.type] ?? 'bell'] })
  addNotification({
    id: entryId,
    ruleType: rule.type,
    title,
    body,
    eventId: ev.id,
    eventKind: ev.kind,
    authorPubkey: author,
    url,
    pushed,
  })
  console.log(`notified [${rule.type}] ${body} → ${pushed} device(s)`)
}

// --- relay connections ---

const sendOn = (conn: Conn, message: string): boolean => {
  if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(message)
    return true
  }
  return false
}

const sendSubs = (conn: Conn) => {
  for (const sub of subs) {
    sendOn(conn, JSON.stringify(['REQ', sub.id, ...sub.filters]))
  }
}

const connect = async (conn: Conn) => {
  if (conn.closed) return
  const parsed = new URL(conn.url)
  const resolvable = await canResolve(parsed.hostname)

  let connectUrl = conn.url
  let wsOptions: WebSocket.ClientOptions = {}
  if (!resolvable) {
    const rewritten = rewriteUrlThroughTraefik(conn.url)
    connectUrl = rewritten.url
    wsOptions = { headers: rewritten.headers }
  }

  let ws: WebSocket
  try {
    ws = new WebSocket(connectUrl, wsOptions)
  } catch (err) {
    console.error(`watcher: failed to open ${conn.url}:`, err)
    scheduleReconnect(conn)
    return
  }
  conn.ws = ws

  ws.on('open', () => {
    conn.reconnectMs = RECONNECT_BASE_MS
    conn.lastActivityAt = Date.now()
    console.log(`watcher: connected to ${conn.url}`)
    sendSubs(conn)
  })

  ws.on('message', (data) => {
    conn.lastActivityAt = Date.now()
    try {
      const msg = JSON.parse(String(data))
      if (Array.isArray(msg) && msg[0] === 'EVENT' && typeof msg[1] === 'string' && msg[2]) {
        void handleEvent(msg[1], msg[2] as NostrEvent)
      }
    } catch {}
  })

  ws.on('pong', () => {
    conn.lastActivityAt = Date.now()
  })

  ws.on('error', (err) => {
    console.error(`watcher: ${conn.url} error:`, String(err))
  })

  ws.on('close', () => {
    conn.ws = null
    if (!conn.closed) scheduleReconnect(conn)
  })
}

/** Runs continuously: pings live connections and force-closes any that have gone silent. */
const startHeartbeat = () => {
  setInterval(() => {
    const now = Date.now()
    for (const conn of conns.values()) {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) continue
      if (now - conn.lastActivityAt > HEARTBEAT_TIMEOUT_MS) {
        console.error(`watcher: ${conn.url} went silent, forcing reconnect`)
        conn.ws.terminate()
        continue
      }
      try {
        conn.ws.ping()
      } catch {}
    }
  }, HEARTBEAT_INTERVAL_MS)
}
startHeartbeat()

const scheduleReconnect = (conn: Conn) => {
  const delay = conn.reconnectMs
  conn.reconnectMs = Math.min(conn.reconnectMs * 2, RECONNECT_MAX_MS)
  setTimeout(() => {
    if (!conn.closed && conns.get(conn.url) === conn) void connect(conn)
  }, delay)
}

const closeConn = (conn: Conn) => {
  conn.closed = true
  try {
    conn.ws?.close()
  } catch {}
}

// --- public API ---

/** (Re)load config + rules and reconcile relay connections and subscriptions. */
export const rebuild = () => {
  const config = loadConfig()
  rules = loadRules()
  ownerPubkey = config.pubkey
  linkClient = config.linkClient

  const activeRules = rules.filter((r) => r.enabled)
  const prevSubIds = subs.map((s) => s.id)
  subs = config.pubkey ? buildSubs(config.pubkey, activeRules) : []

  // Close subscriptions that no longer exist on live connections.
  const currentIds = new Set(subs.map((s) => s.id))
  for (const id of prevSubIds) {
    if (!currentIds.has(id)) {
      for (const conn of conns.values()) sendOn(conn, JSON.stringify(['CLOSE', id]))
    }
  }

  const wantedRelays = new Set(subs.length > 0 ? config.relays : [])

  for (const [url, conn] of conns) {
    if (!wantedRelays.has(url)) {
      closeConn(conn)
      conns.delete(url)
    }
  }

  for (const url of wantedRelays) {
    const existing = conns.get(url)
    if (existing) {
      // Replace subscriptions on the live connection.
      sendSubs(existing)
    } else {
      const conn: Conn = { url, ws: null, reconnectMs: RECONNECT_BASE_MS, closed: false, lastActivityAt: Date.now() }
      conns.set(url, conn)
      void connect(conn)
    }
  }

  console.log(`watcher: ${subs.length} subscription(s) across ${wantedRelays.size} relay(s)`)
}

export const startWatcher = () => {
  const state = loadWatcherState()
  lastSeenTs = state.lastSeenTs
  for (const id of state.seenIds) seenIds.add(id)
  if (lastSeenTs > 0) {
    console.log(`watcher: resuming from ${new Date(subscribeSince() * 1000).toISOString()}`)
  }
  rebuild()
}
