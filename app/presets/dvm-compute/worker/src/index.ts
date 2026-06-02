import type { Event } from 'nostr-tools'
import { KIND } from './kinds.js'
import { config } from './config.js'
import { subscribe } from './nostr.js'
import { handleJob } from './handler.js'

// Bounded concurrency: at most `maxConcurrent` scripts run at once; the rest queue.
const createLimiter = (max: number) => {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (active >= max || queue.length === 0) return
    active++
    queue.shift()!()
  }
  return (task: () => Promise<void>) => {
    queue.push(() => {
      task().finally(() => {
        active--
        next()
      })
    })
    next()
  }
}

const main = () => {
  const limit = createLimiter(config.limits.maxConcurrent)
  const seen = new Set<string>()

  console.log('relaykit dvm-compute starting')
  console.log(`  pubkey:        ${config.publicKey}`)
  console.log(`  dvm relay:     ${config.dvmRelay}`)
  console.log(`  source relays: ${config.sourceRelays.join(', ')}`)
  console.log(`  authors:       ${config.authorWhitelist.length ? config.authorWhitelist.join(', ') : 'ANY (open)'}`)
  console.log(`  max concurrent: ${config.limits.maxConcurrent}, runtime ${config.limits.maxRuntimeMs}ms, mem ${config.limits.maxMemoryMb}MB`)
  console.log(`  job logging:   ${config.logJobs ? 'on' : 'off'}`)

  const since = Math.floor(Date.now() / 1000)
  subscribe([config.dvmRelay], { kinds: [KIND.jobRequest], since }, (ev: Event) => {
    if (seen.has(ev.id)) return
    seen.add(ev.id)
    limit(() => handleJob(ev))
  })
}

main()
