import express from 'express'
import cors from 'cors'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'
import { nip19 } from 'nostr-tools'
import {
  loadConfig, saveConfig,
  loadRules, updateRule, addCustomRule, deleteRule,
  loadDevices, addDevice, deleteDevice,
  loadNotifications, markNotificationSeen, markAllNotificationsSeen,
  issueToken,
} from './storage.js'
import { getVapidPublicKey, sendToAll, sendToDevice } from './push.js'
import { sendToNtfy } from './ntfy.js'
import { startWatcher, rebuild } from './watcher.js'
import { requireAuth, unclaimed, verifyNip98 } from './auth.js'
import { LINK_CLIENTS, type LinkClient } from '../types.js'

// Node's happy-eyeballs default gives each connect attempt 250ms; push endpoints
// (e.g. web.push.apple.com) often sit above that RTT, making sends fail on jitter.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.NH_PORT || 3200

app.use(cors())
app.use(express.json())

// --- auth ---

/** Public: tells the ui whether signing in will claim the hub or log in to it. */
app.get('/api/auth/state', (_req, res) => {
  res.json({ unclaimed: unclaimed() })
})

/**
 * Trades a nip-98 signature for a bearer token this browser can keep. The first signature
 * claims the hub, which also sets the identity it watches — no npub to type in.
 */
app.post('/api/auth/nostr', (req, res) => {
  const [scheme, value] = (req.headers.authorization ?? '').split(' ')
  if (!/^nostr$/i.test(scheme ?? '') || !value) {
    res.status(401).json({ error: 'expected a nostr authorization header' })
    return
  }
  const result = verifyNip98(value, req)
  if ('error' in result) {
    res.status(401).json({ error: result.error })
    return
  }
  const config = loadConfig()
  if (config.pubkey && result.pubkey !== config.pubkey) {
    res.status(403).json({ error: 'not the owner of this hub' })
    return
  }
  if (!config.pubkey) {
    saveConfig({ ...config, pubkey: result.pubkey, npub: nip19.npubEncode(result.pubkey) })
    rebuild()
  }
  res.json({ token: issueToken(typeof req.body?.label === 'string' ? req.body.label : 'browser') })
})

/**
 * Unauthenticated on purpose: the service worker fires this when a push notification is
 * tapped, and it has no bearer token. Entry ids are random uuids and the only effect is
 * flipping a seen flag, so there is nothing to protect.
 */
app.post('/seen/:id', (req, res) => {
  res.json({ ok: markNotificationSeen(req.params.id) })
})

app.use('/api', requireAuth)

// --- config ---

app.get('/api/config', (_req, res) => {
  const config = loadConfig()
  res.json({
    npub: config.npub,
    relays: config.relays,
    linkClient: config.linkClient,
    ntfy: config.ntfy,
    vapidPublicKey: getVapidPublicKey(),
  })
})

app.put('/api/config', (req, res) => {
  const { npub, relays, linkClient } = req.body
  if (typeof npub !== 'string' || !Array.isArray(relays) || relays.some((r) => typeof r !== 'string')) {
    res.status(400).json({ error: 'expected npub (string) and relays (string[])' })
    return
  }
  if (!(linkClient in LINK_CLIENTS)) {
    res.status(400).json({ error: 'invalid linkClient' })
    return
  }
  let pubkey: string
  try {
    const decoded = nip19.decode(npub.trim())
    if (decoded.type !== 'npub') throw new Error('not an npub')
    pubkey = decoded.data
  } catch {
    res.status(400).json({ error: 'invalid npub' })
    return
  }
  if (relays.length === 0) {
    res.status(400).json({ error: 'at least one relay is required' })
    return
  }
  saveConfig({ ...loadConfig(), pubkey, npub: npub.trim(), relays, linkClient: linkClient as LinkClient })
  rebuild()
  res.json({ npub: npub.trim(), relays, linkClient })
})

// --- ntfy ---

app.put('/api/ntfy', (req, res) => {
  const { enabled, server, topic, token } = req.body ?? {}
  if (typeof enabled !== 'boolean' || typeof server !== 'string' || typeof topic !== 'string') {
    res.status(400).json({ error: 'expected enabled (boolean), server (string) and topic (string)' })
    return
  }
  if (!/^https?:\/\/.+/.test(server.trim())) {
    res.status(400).json({ error: 'server must be an http(s) url, e.g. https://ntfy.sh' })
    return
  }
  if (enabled && !topic.trim()) {
    res.status(400).json({ error: 'a topic is required to enable ntfy' })
    return
  }
  const config = loadConfig()
  const ntfy = {
    ...config.ntfy,
    enabled,
    server: server.trim().replace(/\/$/, ''),
    topic: topic.trim(),
    token: typeof token === 'string' && token.trim() ? token.trim() : undefined,
  }
  saveConfig({ ...config, ntfy })
  res.json(ntfy)
})

/** Publishes a one-off message so the topic can be verified while setting it up. */
app.post('/api/ntfy/test', async (_req, res) => {
  const ok = await sendToNtfy({ title: 'pulse', body: 'ntfy is wired up correctly' })
  res.json({ ok, error: ok ? undefined : loadConfig().ntfy.lastError })
})

// --- rules ---

app.get('/api/rules', (_req, res) => {
  res.json(loadRules())
})

app.put('/api/rules/:id', (req, res) => {
  const { enabled } = req.body
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'expected enabled (boolean)' })
    return
  }
  const rule = updateRule(req.params.id, { enabled })
  if (!rule) { res.status(404).json({ error: 'not found' }); return }
  rebuild()
  res.json(rule)
})

app.post('/api/rules', (req, res) => {
  const { label, filter } = req.body
  if (typeof label !== 'string' || !label.trim() || typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
    res.status(400).json({ error: 'expected label (string) and filter (object)' })
    return
  }
  const rule = addCustomRule(label.trim(), filter)
  rebuild()
  res.status(201).json(rule)
})

app.delete('/api/rules/:id', (req, res) => {
  if (!deleteRule(req.params.id)) { res.status(404).json({ error: 'not found or not a custom rule' }); return }
  rebuild()
  res.json({ ok: true })
})

// --- devices ---

app.get('/api/devices', (_req, res) => {
  res.json(loadDevices().map(({ id, label, endpoint, createdAt, lastOkAt, lastError, lastErrorAt }) =>
    ({ id, label, endpoint, createdAt, lastOkAt, lastError, lastErrorAt })))
})

app.post('/api/devices', async (req, res) => {
  const { label, subscription } = req.body
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (typeof label !== 'string' || typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    res.status(400).json({ error: 'expected label and subscription { endpoint, keys: { p256dh, auth } }' })
    return
  }
  const device = addDevice({ label, endpoint, keys: { p256dh, auth } })
  await sendToDevice(device, { title: 'pulse', body: 'notifications enabled on this device' })
  res.status(201).json({ id: device.id, label: device.label, endpoint: device.endpoint, createdAt: device.createdAt })
})

app.delete('/api/devices/:id', (req, res) => {
  if (!deleteDevice(req.params.id)) { res.status(404).json({ error: 'not found' }); return }
  res.json({ ok: true })
})

// --- notifications ---

app.get('/api/notifications', (_req, res) => {
  res.json(loadNotifications())
})

app.post('/api/notifications/seen-all', (_req, res) => {
  res.json({ marked: markAllNotificationsSeen() })
})

app.post('/api/notifications/:id/seen', (req, res) => {
  if (!markNotificationSeen(req.params.id)) { res.status(404).json({ error: 'not found' }); return }
  res.json({ ok: true })
})

app.post('/api/test', async (_req, res) => {
  const pushed = await sendToAll({ title: 'pulse', body: 'test notification' })
  res.json({ pushed })
})

// --- Static SPA (prod) ---

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

startWatcher()

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`notif-hub server on port ${PORT}`)
})
