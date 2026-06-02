import { SimplePool, generateSecretKey, finalizeEvent } from 'nostr-tools'

const RELAY = process.env.RELAY_URL || 'ws://stirfry-556lem-strfry-1:7777'
const sk = generateSecretKey()
const pool = new SimplePool()

const req = finalizeEvent(
  {
    kind: 5910,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['exec', 'inline']],
    content: 'async function main(inputs, nostr) { return { ok: 42, ts: Date.now() } }',
  },
  sk,
)

console.log('publishing inline job', req.id.slice(0, 8))
await Promise.any(pool.publish([RELAY], req))

const result = await new Promise((resolve) => {
  const sub = pool.subscribeMany(
    [RELAY],
    { kinds: [6910, 7000], '#e': [req.id] },
    {
      onevent(ev) {
        if (ev.kind === 7000) {
          const s = ev.tags.find((t) => t[0] === 'status')
          console.log('feedback:', s?.[1], s?.[2] ?? '')
        } else if (ev.kind === 6910) {
          console.log('RESULT:', ev.content)
          resolve(ev.content)
        }
      },
    },
  )
  setTimeout(() => {
    sub.close()
    resolve(null)
  }, 15000)
})

console.log(result ? 'ROUND TRIP OK' : 'TIMEOUT (no result)')
pool.close([RELAY])
process.exit(result ? 0 : 1)
