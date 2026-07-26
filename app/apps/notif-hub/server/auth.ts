import type { RequestHandler } from 'express'
import { verifyEvent, type Event } from 'nostr-tools'
import { loadConfig, tokenValid } from './storage.js'

/** nip-98 http auth events are only accepted this close to now, in seconds. */
const MAX_AGE_S = 60
const NIP98_KIND = 27235

const tagValue = (event: Event, name: string): string | null =>
  event.tags.find((tag) => tag[0] === name)?.[1] ?? null

const forwardedHost = (req: Parameters<RequestHandler>[0]): string =>
  (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.headers.host || ''

/**
 * Compares the signed `u` tag against this request's target. Scheme is deliberately excluded:
 * layered proxies rewrite x-forwarded-proto (caddy's https arrives at us as http), while host and
 * path are passed through, and those are what stop an event being replayed at another hub.
 */
const matchesRequest = (signed: string, req: Parameters<RequestHandler>[0]): boolean => {
  const target = new URL(`http://${forwardedHost(req)}${req.originalUrl}`)
  try {
    const claimed = new URL(signed)
    return claimed.host === target.host && claimed.pathname === target.pathname && claimed.search === target.search
  } catch {
    return false
  }
}

/**
 * Verifies a nip-98 (kind 27235) event from the Authorization header and returns its pubkey.
 * The event must be freshly signed for this exact method + url so it can't be replayed elsewhere.
 */
export const verifyNip98 = (header: string, req: Parameters<RequestHandler>[0]): { pubkey: string } | { error: string } => {
  let event: Event
  try {
    event = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'))
  } catch {
    return { error: 'auth event is not valid base64 json' }
  }
  if (event.kind !== NIP98_KIND) return { error: 'auth event must be kind 27235' }
  if (Math.abs(Math.floor(Date.now() / 1000) - event.created_at) > MAX_AGE_S) return { error: 'auth event expired' }
  if ((tagValue(event, 'method') ?? '').toUpperCase() !== req.method.toUpperCase()) return { error: 'auth event method mismatch' }
  const claimedUrl = tagValue(event, 'u')
  if (!claimedUrl || !matchesRequest(claimedUrl, req)) {
    return { error: `auth event url mismatch (signed ${claimedUrl ?? 'nothing'}, expected ${forwardedHost(req)}${req.originalUrl})` }
  }
  if (!verifyEvent(event)) return { error: 'auth event signature invalid' }
  return { pubkey: event.pubkey }
}

/** True until someone has signed in and claimed the hub as theirs. */
export const unclaimed = (): boolean => !loadConfig().pubkey

/** Guards the api: the owner's nip-98 signature, or a bearer token issued after one. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? ''
  const [scheme, value] = header.split(' ')
  if (/^bearer$/i.test(scheme ?? '') && value && tokenValid(value)) {
    next()
    return
  }
  if (/^nostr$/i.test(scheme ?? '') && value) {
    const result = verifyNip98(value, req)
    if ('error' in result) {
      res.status(401).json({ error: result.error })
      return
    }
    if (result.pubkey !== loadConfig().pubkey) {
      res.status(403).json({ error: 'not the owner of this hub' })
      return
    }
    next()
    return
  }
  res.status(401).json({ error: 'sign in with your nostr key to use this hub' })
}
