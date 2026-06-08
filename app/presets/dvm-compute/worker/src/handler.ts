import type { Event } from 'nostr-tools'
import { KIND } from './kinds.js'
import { config } from './config.js'
import { collect, queryOne, sign, publish } from './nostr.js'
import { runScript, type SandboxInputs } from './sandbox.js'
import { computeCacheKey, findCached, buildCachedEvent, type ScriptRef } from './cache.js'

const tag = (ev: Event, name: string): string[] | undefined => ev.tags.find((t) => t[0] === name)
const tagsAll = (ev: Event, name: string): string[][] => ev.tags.filter((t) => t[0] === name)

const log = (req: Event, msg: string) => {
  if (config.logJobs) console.log(`[job ${req.id}] ${msg}`)
}

const clampTtl = (raw: number): number =>
  Math.min(Number.isFinite(raw) ? raw : config.cache.defaultTtlSec, config.cache.maxTtlSec)

// Per-function limits are clamped to the operator's global ceiling; unset/invalid falls back to it.
const clampLimit = (raw: string | undefined, max: number): number => {
  const n = Number(raw)
  const v = Number.isFinite(n) && n > 0 ? n : max
  return Math.min(v, max)
}

type Overrides = {
  subject?: { value: string; type: string }
  params: Record<string, string>
  sourceRelays?: string[]
  ttlSec?: number
}

type ParsedJob = {
  // Inline code (for pre-publish testing), or a reference: `a` (a dataFunction:31337 or a
  // codeSnippet:1337 address) or `e` (a code event id). Inline skips cache + author whitelist.
  inlineCode?: string
  aRef?: string
  eRef?: string
  overrides: Overrides
  // `cache:no` forces a recompute; `cache:clear` deletes the cached result and returns.
  noCache: boolean
  clearCache: boolean
}

const parseJob = (req: Event): ParsedJob => {
  const inlineCode = tag(req, 'exec')?.[1] === 'inline' ? req.content : undefined
  const aRef = tag(req, 'a')?.[1]
  const eRef = tag(req, 'e')?.[1]
  if (!inlineCode && !aRef && !eRef) throw new Error('job has no reference (a or e tag, or inline exec)')

  const subjectTag = tag(req, 'i')
  const relayTag = tag(req, 'relays')
  const ttlTag = tag(req, 'ttl')?.[1]
  const cacheMode = tag(req, 'cache')?.[1]
  return {
    inlineCode,
    aRef,
    eRef,
    overrides: {
      subject: subjectTag ? { value: subjectTag[1], type: subjectTag[2] ?? 'text' } : undefined,
      params: Object.fromEntries(tagsAll(req, 'param').map((t) => [t[1], t[2] ?? ''])),
      sourceRelays: relayTag ? relayTag.slice(1).filter(Boolean) : undefined,
      ttlSec: ttlTag !== undefined ? clampTtl(Number(ttlTag)) : undefined,
    },
    noCache: cacheMode === 'no' || cacheMode === 'clear',
    clearCache: cacheMode === 'clear',
  }
}

// Resolved, effective job: the cache identity (functionRef), the code to run, and merged inputs.
type Resolved = {
  functionRef: ScriptRef
  codeRef: ScriptRef
  inputs: SandboxInputs
  sourceRelays: string[]
  ttlSec: number
  outputRelay: string
  runtimeMs: number
  memoryMb: number
}

const queryByAddress = async (address: string, kind: number): Promise<Event | null> => {
  const [k, pubkey, d] = address.split(':')
  if (Number(k) !== kind) throw new Error(`expected kind ${kind} address, got ${address}`)
  return queryOne(
    [config.dvmRelay],
    { kinds: [kind], authors: [pubkey], '#d': [d] },
    config.limits.sourceQueryTimeoutMs,
  )
}

// Reads a dataFunction:31337 definition into its effective config (before 5910 overrides).
const parseDefinition = (def: Event, defAddress: string): Resolved => {
  const codeTag = tag(def, 'code')?.[1]
  if (!codeTag) throw new Error('data function has no `code` reference')
  const relayTag = tag(def, 'relays')
  const subjectTag = tag(def, 'i')
  return {
    functionRef: { id: defAddress, address: defAddress },
    codeRef: { id: '', address: codeTag },
    inputs: {
      subject: subjectTag ? { value: subjectTag[1], type: subjectTag[2] ?? 'text' } : undefined,
      params: Object.fromEntries(tagsAll(def, 'param').map((t) => [t[1], t[2] ?? ''])),
    },
    sourceRelays: relayTag ? relayTag.slice(1).filter(Boolean) : config.sourceRelays,
    ttlSec: clampTtl(Number(tag(def, 'ttl')?.[1] ?? config.cache.defaultTtlSec)),
    outputRelay: tag(def, 'output')?.[1] || config.dvmRelay,
    runtimeMs: clampLimit(tag(def, 'runtime_ms')?.[1], config.limits.maxRuntimeMs),
    memoryMb: clampLimit(tag(def, 'memory_mb')?.[1], config.limits.maxMemoryMb),
  }
}

const applyOverrides = (base: Resolved, o: Overrides): Resolved => ({
  ...base,
  inputs: {
    subject: o.subject ?? base.inputs.subject,
    params: { ...base.inputs.params, ...o.params },
  },
  sourceRelays: o.sourceRelays ?? base.sourceRelays,
  ttlSec: o.ttlSec ?? base.ttlSec,
})

// Turn a parsed job into a fully resolved one (fetches the definition when referenced).
const resolveJob = async (job: ParsedJob): Promise<Resolved> => {
  // `a` pointing at a dataFunction definition (the normal path).
  if (job.aRef && Number(job.aRef.split(':')[0]) === KIND.dataFunction) {
    const def = await queryByAddress(job.aRef, KIND.dataFunction)
    if (!def) throw new Error('data function definition not found')
    return applyOverrides(parseDefinition(def, job.aRef), job.overrides)
  }
  // `a` pointing straight at a codeSnippet, or `e` at a code event id (no definition).
  const codeRef: ScriptRef = job.aRef ? { id: '', address: job.aRef } : { id: job.eRef! }
  const base: Resolved = {
    functionRef: codeRef,
    codeRef,
    inputs: { subject: job.overrides.subject, params: job.overrides.params },
    sourceRelays: job.overrides.sourceRelays ?? config.sourceRelays,
    ttlSec: job.overrides.ttlSec ?? config.cache.defaultTtlSec,
    outputRelay: config.dvmRelay,
    runtimeMs: config.limits.maxRuntimeMs,
    memoryMb: config.limits.maxMemoryMb,
  }
  return base
}

const fetchCode = async (ref: ScriptRef, sourceRelays: string[]): Promise<Event | null> => {
  const relays = [config.dvmRelay, ...sourceRelays]
  if (ref.address) {
    const [kind, pubkey, d] = ref.address.split(':')
    if (Number(kind) !== KIND.codeSnippet) throw new Error(`code ref must be kind ${KIND.codeSnippet}`)
    return queryOne(relays, { kinds: [KIND.codeSnippet], authors: [pubkey], '#d': [d] }, config.limits.sourceQueryTimeoutMs)
  }
  const [event] = await collect(relays, [{ ids: [ref.id] }], { timeoutMs: config.limits.sourceQueryTimeoutMs, max: 1 })
  return event ?? null
}

const feedback = async (req: Event, status: 'processing' | 'success' | 'error', message = '') => {
  const event = sign({
    kind: KIND.jobFeedback,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['status', status, message],
      ['e', req.id],
      ['p', req.pubkey],
    ],
    content: '',
  })
  await publish([config.dvmRelay], event)
}

const publishResult = async (req: Event, content: string, cacheEvent?: Event) => {
  const tags: string[][] = [
    ['e', req.id],
    ['p', req.pubkey],
  ]
  if (cacheEvent) {
    const cacheAddr = `${KIND.cachedResult}:${config.publicKey}:${tag(cacheEvent, 'd')?.[1] ?? ''}`
    tags.push(['a', cacheAddr, config.dvmRelay])
  }
  const result = sign({
    kind: KIND.jobResult,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  })
  await publish([config.dvmRelay], result)
}

export const handleJob = async (req: Event): Promise<void> => {
  if (config.requesterWhitelist.length && !config.requesterWhitelist.includes(req.pubkey.toLowerCase())) {
    return // silently ignore jobs from non-whitelisted requesters
  }

  try {
    await feedback(req, 'processing')
    const job = parseJob(req)

    // Inline test run: execute the provided code directly, return the result, no caching.
    if (job.inlineCode !== undefined) {
      const sourceRelays = job.overrides.sourceRelays ?? config.sourceRelays
      const inputs: SandboxInputs = { subject: job.overrides.subject, params: job.overrides.params }
      log(req, 'inline run')
      const result = await runScript(job.inlineCode, inputs, sourceRelays)
      await publishResult(req, JSON.stringify(result ?? null))
      await feedback(req, 'success', 'inline')
      return
    }

    const r = await resolveJob(job)
    const cacheKey = computeCacheKey(r.functionRef, r.inputs, r.sourceRelays)
    log(req, `${r.functionRef.address ?? r.functionRef.id} (${job.clearCache ? 'clear' : job.noCache ? 'recompute' : 'cached'})`)

    // clear: delete our cached result (NIP-09) for this key and stop.
    if (job.clearCache) {
      const addr = `${KIND.cachedResult}:${config.publicKey}:${cacheKey}`
      const del = sign({
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['a', addr]],
        content: 'cache cleared',
      })
      await publish([...new Set([config.dvmRelay, r.outputRelay])], del)
      log(req, 'cache cleared')
      await feedback(req, 'success', 'cache cleared')
      return
    }

    const cached = job.noCache ? null : await findCached(cacheKey, r.ttlSec)
    if (cached) {
      await publishResult(req, cached.content, cached)
      log(req, 'cache hit')
      await feedback(req, 'success', 'cache hit')
      return
    }

    const code = await fetchCode(r.codeRef, r.sourceRelays)
    if (!code) throw new Error('code event not found')
    if (config.authorWhitelist.length && !config.authorWhitelist.includes(code.pubkey.toLowerCase())) {
      throw new Error('code author not whitelisted')
    }

    const result = await runScript(code.content, r.inputs, r.sourceRelays, {
      maxRuntimeMs: r.runtimeMs,
      maxMemoryMb: r.memoryMb,
    })

    const cacheEvent = sign(buildCachedEvent(cacheKey, r.functionRef, r.inputs, result, r.ttlSec))
    await publish([...new Set([config.dvmRelay, r.outputRelay])], cacheEvent)
    await publishResult(req, cacheEvent.content, cacheEvent)
    log(req, 'computed & cached')
    await feedback(req, 'success')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[job ${req.id}] failed: ${message}`)
    await feedback(req, 'error', message)
  }
}
