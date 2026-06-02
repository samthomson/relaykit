import { SimplePool, finalizeEvent, type Event, type EventTemplate, type Filter } from 'nostr-tools'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'
import { config } from './config.js'

useWebSocketImplementation(WebSocket)

const pool = new SimplePool()

// Collect events for the given filters until EOSE or timeout, capped at `max`.
export const collect = async (
  relays: string[],
  filters: Filter[],
  opts: { timeoutMs: number; max: number },
): Promise<Event[]> => {
  const events: Event[] = []
  return new Promise((resolve) => {
    let done = false
    let eoseCount = 0
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      subs.forEach((s) => s.close())
      resolve(events)
    }
    const timer = setTimeout(finish, opts.timeoutMs)
    const subs = filters.map((filter) =>
      pool.subscribeMany(relays, filter, {
        onevent(ev) {
          events.push(ev)
          if (events.length >= opts.max) finish()
        },
        oneose() {
          eoseCount += 1
          if (eoseCount >= filters.length) finish()
        },
      }),
    )
  })
}

export const queryOne = async (relays: string[], filter: Filter, timeoutMs: number): Promise<Event | null> => {
  const events = await collect(relays, [{ ...filter, limit: 1 }], { timeoutMs, max: 1 })
  return events[0] ?? null
}

export const sign = (template: EventTemplate): Event => finalizeEvent(template, config.secretKey)

export const publish = async (relays: string[], event: Event): Promise<void> => {
  await Promise.allSettled(pool.publish(relays, event))
}

export const subscribe = (relays: string[], filter: Filter, onevent: (ev: Event) => void) =>
  pool.subscribeMany(relays, filter, { onevent })
