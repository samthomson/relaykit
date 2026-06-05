import { nip19, getPublicKey } from 'nostr-tools'

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) throw new Error('invalid hex secret key')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

const num = (key: string, fallback: number): number => {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

const csv = (key: string): string[] =>
  (process.env[key] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

const bool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

const required = (key: string): string => {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var ${key}`)
  return v
}

// Accepts an nsec or raw hex secret key.
const decodeSecretKey = (raw: string): Uint8Array => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('nsec')) {
    const { type, data } = nip19.decode(trimmed)
    if (type !== 'nsec') throw new Error('DVM_SECRET_KEY is not a valid nsec')
    return data as Uint8Array
  }
  return hexToBytes(trimmed)
}

const secretKey = decodeSecretKey(required('DVM_SECRET_KEY'))

const dvmRelay = required('RELAY_URL')

export const config = {
  // Relay the DVM listens on for jobs and publishes results/caches to.
  dvmRelay,
  // Where scripts pull their source data from (defaults to the DVM relay).
  sourceRelays: csv('SOURCE_RELAYS').length ? csv('SOURCE_RELAYS') : [dvmRelay],
  secretKey,
  publicKey: getPublicKey(secretKey),
  // Only scripts authored by these pubkeys may run. Empty = allow any (not recommended in prod).
  authorWhitelist: csv('AUTHOR_WHITELIST'),
  // Optional: only these pubkeys may submit jobs. Empty = anyone.
  requesterWhitelist: csv('REQUESTER_WHITELIST'),
  limits: {
    maxRuntimeMs: num('MAX_RUNTIME_MS', 5000),
    maxMemoryMb: num('MAX_MEMORY_MB', 128),
    maxConcurrent: num('MAX_CONCURRENT', 4),
    maxEventsPerJob: num('MAX_EVENTS_PER_JOB', 0), // 0 = unlimited
    maxOutputBytes: num('MAX_OUTPUT_BYTES', 524288),
    sourceQueryTimeoutMs: num('SOURCE_QUERY_TIMEOUT_MS', 8000),
  },
  cache: {
    defaultTtlSec: num('DEFAULT_TTL_SEC', 3600),
    maxTtlSec: num('MAX_TTL_SEC', 86400),
  },
  // When on, log a line per job (received / cache hit-miss / outcome) to stdout (the logs tab).
  logJobs: bool('LOG_JOBS', false),
} as const

export type Config = typeof config
