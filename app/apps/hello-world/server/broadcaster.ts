import WebSocket from 'ws'
import dns from 'dns'
import type { RelayResult } from '../types.js'

const RELAY_TIMEOUT_MS = 10_000
const TRAEFIK_HOST = process.env.TRAEFIK_HOST || 'dokploy-traefik-dev'

const canResolve = (hostname: string): Promise<boolean> =>
  new Promise((resolve) => {
    dns.lookup(hostname, (err) => resolve(!err))
  })

const rewriteUrlThroughTraefik = (url: string): { url: string; headers: Record<string, string> } => {
  const parsed = new URL(url)
  const originalHost = parsed.host
  parsed.protocol = 'ws:'
  parsed.host = `${TRAEFIK_HOST}:80`
  return { url: parsed.toString(), headers: { Host: originalHost } }
}

const publishToRelay = async (url: string, signedEvent: Record<string, unknown>): Promise<RelayResult> => {
  const parsed = new URL(url)
  const resolvable = await canResolve(parsed.hostname)

  let connectUrl = url
  let wsOptions: WebSocket.ClientOptions = {}

  if (!resolvable) {
    const rewritten = rewriteUrlThroughTraefik(url)
    connectUrl = rewritten.url
    wsOptions = { headers: rewritten.headers }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      resolve({ url, success: false, message: 'timeout' })
    }, RELAY_TIMEOUT_MS)

    let ws: WebSocket
    try {
      ws = new WebSocket(connectUrl, wsOptions)
    } catch (err) {
      clearTimeout(timeout)
      resolve({ url, success: false, message: String(err) })
      return
    }

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', signedEvent]))
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data))
        if (Array.isArray(msg) && msg[0] === 'OK') {
          clearTimeout(timeout)
          ws.close()
          resolve({ url, success: Boolean(msg[2]), message: msg[3] || undefined })
        }
      } catch {}
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      try { ws.close() } catch {}
      resolve({ url, success: false, message: String(err) })
    })
  })
}

export const broadcastEvent = async (
  signedEvent: Record<string, unknown>,
  relays: string[],
): Promise<RelayResult[]> => {
  return Promise.all(relays.map((url) => publishToRelay(url, signedEvent)))
}
