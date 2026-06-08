// Inline test-run: send the script in the job (no 1337 publish). Mirrors the UI "run & test".
// Usage: RELAY=ws://dvm-test-relay:7777 SOURCE=wss://relay.relaying.earth node test/inline.mjs
import { SimplePool, finalizeEvent, generateSecretKey } from 'nostr-tools'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'

useWebSocketImplementation(WebSocket)

const RELAY = process.env.RELAY
const SOURCE = process.env.SOURCE || 'wss://relay.relaying.earth'
if (!RELAY) { console.error('set RELAY'); process.exit(1) }

const CODE = `
async function main(inputs, nostr) {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const events = await nostr.query([{ kinds: [4223], '#t': ['weather'], since }]);
  const temps = events.map((e) => e.tags.find((t) => t[0] === 'temp')).filter(Boolean).map((t) => parseFloat(t[1])).filter((n) => !Number.isNaN(n));
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  return { avg_temp: avg, samples: temps.length, since };
}
`

const sk = generateSecretKey()
const pool = new SimplePool()
const now = () => Math.floor(Date.now() / 1000)
const job = finalizeEvent({ kind: 5910, created_at: now(), tags: [['exec', 'inline'], ['relays', SOURCE], ['ttl', '60']], content: CODE }, sk)

const run = async () => {
  await Promise.allSettled(pool.publish([RELAY], job))
  console.log('inline job id:', job.id, '\nwaiting...')
  const sub = pool.subscribeMany([RELAY], { kinds: [6910, 7000], '#e': [job.id] }, {
    onevent(ev) {
      if (ev.kind === 7000) {
        const s = ev.tags.find((t) => t[0] === 'status')
        console.log('feedback:', s?.[1], s?.[2] ?? '')
      } else {
        console.log('RESULT:', ev.content)
        sub.close(); pool.close([RELAY]); process.exit(0)
      }
    },
  })
  setTimeout(() => { console.error('timed out after 40s'); process.exit(1) }, 40000)
}
run()
