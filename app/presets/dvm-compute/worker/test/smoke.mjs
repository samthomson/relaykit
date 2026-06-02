// End-to-end smoke test for the compute DVM.
// Publishes a code snippet (1337) + a job request (5910), then waits for the result.
//
// Usage:
//   RELAY=wss://your-dvm-relay AUTHOR_NSEC=nsec1... SUBJECT=<event_id_to_count_comments_for> \
//     node dvm-compute/test/smoke.mjs
//
// - RELAY: the DVM relay url (same as the deployed worker's "DVM relay url").
// - AUTHOR_NSEC: the script author key. Its pubkey MUST be in the worker's
//   "allowed script authors" list. Omit to auto-generate one (it prints the pubkey to whitelist).
// - SUBJECT: an event id that has NIP-22 comments (kind 1111) on your source relays.
import { SimplePool, finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { useWebSocketImplementation } from 'nostr-tools/pool'
import WebSocket from 'ws'

useWebSocketImplementation(WebSocket)

const RELAY = process.env.RELAY
const SUBJECT = process.env.SUBJECT
if (!RELAY || !SUBJECT) {
  console.error('set RELAY and SUBJECT env vars (see header)')
  process.exit(1)
}

const sk = process.env.AUTHOR_NSEC ? nip19.decode(process.env.AUTHOR_NSEC).data : generateSecretKey()
const pk = getPublicKey(sk)
console.log('author pubkey (must be whitelisted):', pk)

const pool = new SimplePool()
const now = () => Math.floor(Date.now() / 1000)

// A sample script: count NIP-22 comments (kind 1111) referencing the subject event.
const SCRIPT_SRC = `
async function main(inputs, nostr) {
  const target = inputs.subject.value
  const comments = await nostr.query([{ kinds: [1111], '#E': [target] }])
  return { comment_cnt: comments.length, ids: comments.map((e) => e.id) }
}
`

const scriptD = 'comment-counter'
const script = finalizeEvent({ kind: 1337, created_at: now(), tags: [['d', scriptD]], content: SCRIPT_SRC }, sk)

const jobReq = finalizeEvent({
  kind: 5910,
  created_at: now(),
  tags: [
    ['a', `1337:${pk}:${scriptD}`],
    ['i', SUBJECT, 'event'],
    ['relays', RELAY],
    ['ttl', '3600'],
  ],
  content: '',
}, sk)

const run = async () => {
  console.log('publishing script (1337) and job request (5910)...')
  await Promise.allSettled(pool.publish([RELAY], script))
  await Promise.allSettled(pool.publish([RELAY], jobReq))
  console.log('job id:', jobReq.id, '\nwaiting for result (6910 / feedback 7000)...')

  const sub = pool.subscribeMany([RELAY], { kinds: [6910, 7000], '#e': [jobReq.id] }, {
    onevent(ev) {
      if (ev.kind === 7000) {
        const status = ev.tags.find((t) => t[0] === 'status')
        console.log('feedback:', status?.[1], status?.[2] ?? '')
      } else {
        console.log('RESULT:', ev.content)
        sub.close()
        pool.close([RELAY])
        process.exit(0)
      }
    },
  })

  setTimeout(() => {
    console.error('timed out after 30s (is the worker deployed and connected to this relay?)')
    process.exit(1)
  }, 30000)
}

run()
