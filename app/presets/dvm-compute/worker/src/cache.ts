import { createHash } from 'node:crypto'
import type { Event, EventTemplate } from 'nostr-tools'
import { KIND } from './kinds.js'
import { config } from './config.js'
import { queryOne } from './nostr.js'
import type { SandboxInputs } from './sandbox.js'

export type ScriptRef = { id: string; address?: string }

// Deterministic address for a (script, inputs, source relays) tuple.
export const computeCacheKey = (
  scriptRef: ScriptRef,
  inputs: SandboxInputs,
  sourceRelays: string[],
): string => {
  const canonical = JSON.stringify({
    script: scriptRef.address ?? scriptRef.id,
    subject: inputs.subject ?? null,
    params: Object.fromEntries(Object.entries(inputs.params).sort(([a], [b]) => a.localeCompare(b))),
    relays: [...sourceRelays].sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export const findCached = async (key: string, ttlSec: number): Promise<Event | null> => {
  const event = await queryOne(
    [config.dvmRelay],
    { kinds: [KIND.cachedResult], authors: [config.publicKey], '#d': [key] },
    config.limits.sourceQueryTimeoutMs,
  )
  if (!event) return null
  const ageSec = Math.floor(Date.now() / 1000) - event.created_at
  return ageSec <= ttlSec ? event : null
}

export const buildCachedEvent = (
  key: string,
  scriptRef: ScriptRef,
  inputs: SandboxInputs,
  result: unknown,
  ttlSec: number,
): EventTemplate => {
  const tags: string[][] = [
    ['d', key],
    ['script', scriptRef.address ?? scriptRef.id],
    ['expiration', String(Math.floor(Date.now() / 1000) + ttlSec)],
  ]
  if (inputs.subject) tags.push(['i', inputs.subject.value, inputs.subject.type])
  return {
    kind: KIND.cachedResult,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(result ?? null),
  }
}
