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
  loadNotifications,
} from './storage.js'
import { getVapidPublicKey, sendToAll, sendToDevice } from './push.js'
import { startWatcher, rebuild } from './watcher.js'
import { LINK_CLIENTS, type LinkClient } from '../types.js'

// Node's happy-eyeballs default gives each connect attempt 250ms; push endpoints
// (e.g. web.push.apple.com) often sit above that RTT, making sends fail on jitter.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.NH_PORT || 3200

app.use(cors())
app.use(express.json())

// --- config ---

app.get('/api/config', (_req, res) => {
  const config = loadConfig()
  res.json({ npub: config.npub, relays: config.relays, linkClient: config.linkClient, vapidPublicKey: getVapidPublicKey() })
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
  saveConfig({ pubkey, npub: npub.trim(), relays, linkClient: linkClient as LinkClient })
  rebuild()
  res.json({ npub: npub.trim(), relays, linkClient })
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
  await sendToDevice(device, { title: 'notif hub', body: 'notifications enabled on this device' })
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

app.post('/api/test', async (_req, res) => {
  const pushed = await sendToAll({ title: 'notif hub', body: 'test notification' })
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
