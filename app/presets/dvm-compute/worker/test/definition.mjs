import { SimplePool, generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools'

const RELAY = process.env.RELAY_URL || 'ws://stirfry-556lem-strfry-1:7777'
const sk = generateSecretKey()
const pk = getPublicKey(sk)
const pool = new SimplePool()
const now = Math.floor(Date.now() / 1000)
const id = 'test-fn-' + now

// 1) code (kind:1337)
const code = finalizeEvent(
  { kind: 1337, created_at: now, tags: [['d', id]], content: 'async function main(inputs){ return { hello: inputs.params.name || "world" } }' },
  sk,
)
// 2) definition (kind:31337) referencing the code
const def = finalizeEvent(
  {
    kind: 31337,
    created_at: now,
    tags: [
      ['d', id],
      ['code', `1337:${pk}:${id}`],
      ['param', 'name', 'relaykit'],
      ['ttl', '600'],
    ],
    content: '',
  },
  sk,
)
// 3) job (kind:5910) pointing at the definition
const job = finalizeEvent(
  { kind: 5910, created_at: now + 1, tags: [['a', `31337:${pk}:${id}`, RELAY]], content: '' },
  sk,
)

console.log('publishing code + definition…')
await Promise.allSettled(pool.publish([RELAY], code))
await Promise.allSettled(pool.publish([RELAY], def))
await new Promise((r) => setTimeout(r, 500))
console.log('publishing job', job.id.slice(0, 8))
await Promise.any(pool.publish([RELAY], job))

const result = await new Promise((resolve) => {
  const sub = pool.subscribeMany([RELAY], { kinds: [6910, 7000], '#e': [job.id] }, {
    onevent(ev) {
      if (ev.kind === 7000) {
        const s = ev.tags.find((t) => t[0] === 'status')
        console.log('feedback:', s?.[1], s?.[2] ?? '')
      } else if (ev.kind === 6910) {
        console.log('RESULT:', ev.content)
        const a = ev.tags.find((t) => t[0] === 'a')
        console.log('cache pointer:', a?.[1] ?? '(none)')
        resolve(ev.content)
      }
    },
  })
  setTimeout(() => { sub.close(); resolve(null) }, 15000)
})

console.log(result ? 'DEFINITION ROUND TRIP OK' : 'TIMEOUT')
pool.close([RELAY])
process.exit(result ? 0 : 1)
