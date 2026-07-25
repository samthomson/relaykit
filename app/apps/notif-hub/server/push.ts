import fs from 'fs'
import path from 'path'
import webpush from 'web-push'
import { loadDevices, deleteDeviceByEndpoint, recordPushResult } from './storage.js'
import type { PushDevice } from '../types.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json')
// Apple rejects JWTs whose subject has a bogus TLD (e.g. .local) with 403 BadJwtToken.
// Prefer the instance's real domain; fall back to a valid-TLD placeholder.
const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  (process.env.RELAYKIT_HOST ? `https://${process.env.RELAYKIT_HOST}` : 'mailto:admin@relaykit.dev')
const NOTIFICATION_TTL = 86_400

type VapidKeys = { publicKey: string; privateKey: string }

const loadOrCreateVapidKeys = (): VapidKeys => {
  if (fs.existsSync(VAPID_FILE)) {
    return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'))
  }
  const keys = webpush.generateVAPIDKeys()
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2))
  return keys
}

const vapidKeys = loadOrCreateVapidKeys()
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey)

export const getVapidPublicKey = (): string => vapidKeys.publicKey

export type PushPayload = {
  title: string
  body: string
  url?: string
  /** notification icon (e.g. author avatar); shown on android/desktop, ignored on ios */
  icon?: string
}

const errorDetail = (err: unknown): string => {
  const statusCode = (err as { statusCode?: number }).statusCode
  if (statusCode) return `${statusCode} ${(err as { body?: string }).body || ''}`.trim()
  if (err instanceof AggregateError && err.errors.length > 0) {
    const first = err.errors[0] as NodeJS.ErrnoException
    return `network: ${first.code || first.message} (${first.syscall || 'connect'} ${first.address || ''})`.trim()
  }
  return (err as Error).message || String(err)
}

const NETWORK_RETRY_DELAY_MS = 5_000

export const sendToDevice = async (device: PushDevice, payload: PushPayload, attempt = 0): Promise<boolean> => {
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: device.keys },
      JSON.stringify(payload),
      { TTL: NOTIFICATION_TTL, urgency: 'high' },
    )
    recordPushResult(device.endpoint, { ok: true })
    return true
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      // Endpoint is gone (uninstalled/expired) — drop the device.
      deleteDeviceByEndpoint(device.endpoint)
      console.log(`push endpoint gone (${statusCode}), removed device ${device.id} (${device.label})`)
      return false
    }
    // Routes to push services can flap for seconds; without a retry the
    // notification is lost for good (the event is already marked processed).
    if (!statusCode && attempt === 0) {
      console.error(`push to ${device.label} network error (${errorDetail(err)}), retrying once`)
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
      return sendToDevice(device, payload, 1)
    }
    recordPushResult(device.endpoint, { ok: false, error: errorDetail(err) })
    console.error(`push to ${device.label} failed:`, err)
    return false
  }
}

/** Send a payload to all registered devices. Returns the number of successful deliveries. */
export const sendToAll = async (payload: PushPayload): Promise<number> => {
  const devices = loadDevices()
  const results = await Promise.all(devices.map((d) => sendToDevice(d, payload)))
  return results.filter(Boolean).length
}
