// Example: average weather-station temperature (kind 4223, `temp` tag) over the last week.
// Publishes the script (1337) + a job request (5910) to the DVM relay, then prints the result.
//
// Usage:
//   RELAY=wss://relay.local SOURCE=wss://relay.relaying.earth AUTHOR_NSEC=nsec1... \
//     node dvm-compute/test/weather.mjs
//
// - RELAY:  the DVM relay url (same as the worker's "DVM relay url").
// - SOURCE: relay the weather events live on (default wss://relay.relaying.earth).
// - AUTHOR_NSEC: script author key; its pubkey must be in the worker's "allowed script authors"
//   (or leave the worker's whitelist empty). Omit to auto-generate (prints the pubkey to whitelist).
// For self-signed/mkcert relays (e.g. relay.local): prefix with NODE_TLS_REJECT_UNAUTHORIZED=0.
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'

useWebSocketImplementation(WebSocket)

const RELAY = process.env.RELAY
const SOURCE = process.env.SOURCE || 'wss://relay.relaying.earth'
if (!RELAY) {
  console.error('set RELAY (the DVM relay url)')
  process.exit(1)
}

const sk = process.env.AUTHOR_NSEC ? nip19.decode(process.env.AUTHOR_NSEC).data : generateSecretKey()
const pk = getPublicKey(sk)
console.log('author pubkey (must be whitelisted, or leave whitelist empty):', pk)

const SCRIPT_SRC = `
async function main(inputs, nostr) {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const events = await nostr.query([{ kinds: [4223], '#t': ['weather'], since }]);
  const temps = events
    .map((e) => e.tags.find((t) => t[0] === 'temp'))
    .filter(Boolean)
    .map((t) => parseFloat(t[1]))
    .filter((n) => !Number.isNaN(n));
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  return { avg_temp: avg, samples: temps.length, since };
}
`

const pool = new SimplePool()
const now = () => Math.floor(Date.now() / 1000)
const scriptD = 'avg-weekly-temp'

const script = finalizeEvent({ kind: 1337, created_at: now(), tags: [['d', scriptD]], content: SCRIPT_SRC }, sk)
const jobReq = finalizeEvent({
  kind: 5910,
  created_at: now(),
  tags: [
    ['a', `1337:${pk}:${scriptD}`],
    ['relays', SOURCE],
    ['ttl', '3600'],
  ],
  content: '',
}, sk)

const run = async () => {
  console.log(`publishing script + job to ${RELAY} (source: ${SOURCE})...`)
  await Promise.allSettled(pool.publish([RELAY], script))
  await Promise.allSettled(pool.publish([RELAY], jobReq))
  console.log('job id:', jobReq.id, '\nwaiting for result...')

  const sub = pool.subscribeMany([RELAY], { kinds: [6910, 7000], '#e': [jobReq.id] }, {
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
