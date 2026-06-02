# relaykit dvm-compute

A programmable, caching DVM worker. Clients ask it to run a whitelisted **code snippet** (NIP-C0, `kind:1337`) against Nostr data; it runs the script in a sandboxed JS VM and publishes a **cached result** that clients read instead of crawling raw events.

It's a NIP-90 DVM, but generic (the job picks which script to run) and cache-first (results are content-addressed and reused until they expire).

## Event kinds

| kind | name | who publishes | role |
|------|------|---------------|------|
| `1337` | code snippet (NIP-C0) | script author | the script to run; referenced by jobs |
| `5910` | job request (NIP-90) | client | "run script S with these inputs" |
| `7000` | job feedback (NIP-90) | worker | status: processing / success / error |
| `6910` | job result (NIP-90) | worker | notifies requester; points at the cached event |
| `31337` | cached result (custom, addressable) | worker | the actual payload; `d = sha256(script + inputs + relays)` |

Read path = `31337` (or `6910`). Compute trigger = `5910`. Code = `1337`.

## Writing a script

A snippet is a `kind:1337` event whose `content` defines `main`:

```js
// counts top-level comments (NIP-22, kind 1111) for the subject event id
async function main(inputs, nostr) {
  const target = inputs.subject.value
  const comments = await nostr.query([{ kinds: [1111], '#E': [target] }])
  return { comment_cnt: comments.length, ids: comments.map((e) => e.id) }
}
```

- `inputs.subject` = `{ value, type }` from the job's `i` tag (e.g. an event id).
- `inputs.params` = key/value map from the job's `param` tags.
- `nostr.query(filters)` is the **only** capability: it queries the source relays (no fs/net/process/timers).
- Return any JSON-serializable value; it becomes the cached result `content`.

## Job request shape (`kind:5910`)

```json
{
  "kind": 5910,
  "tags": [
    ["a", "1337:<author_pubkey>:<d>"],
    ["i", "<event_id>", "event"],
    ["param", "max", "500"],
    ["relays", "wss://relay.example.com"],
    ["ttl", "3600"]
  ],
  "content": ""
}
```

Use `["e", "<id>"]` instead of `a` to pin a specific (non-updateable) script version.

## Config (env vars)

| var | required | default | description |
|-----|----------|---------|-------------|
| `RELAY_URL` | yes | – | relay the worker listens on and publishes results/caches to |
| `DVM_SECRET_KEY` | yes | – | worker signing key (`nsec...` or hex) |
| `SOURCE_RELAYS` | no | `RELAY_URL` | comma-separated relays scripts pull data from |
| `AUTHOR_WHITELIST` | no | (open) | comma-separated hex pubkeys whose scripts may run |
| `REQUESTER_WHITELIST` | no | (anyone) | comma-separated hex pubkeys allowed to submit jobs |
| `MAX_RUNTIME_MS` | no | `5000` | per-script wall-clock budget |
| `MAX_MEMORY_MB` | no | `128` | per-script memory cap |
| `MAX_CONCURRENT` | no | `4` | scripts running at once |
| `MAX_EVENTS_PER_JOB` | no | `5000` | events a script may fetch |
| `MAX_OUTPUT_BYTES` | no | `524288` | max serialized result size |
| `DEFAULT_TTL_SEC` / `MAX_TTL_SEC` | no | `3600` / `86400` | cache freshness window |

## Dev

```bash
npm install
RELAY_URL=wss://your.relay DVM_SECRET_KEY=nsec1... npm run dev
```

## Safety

Defense in depth: quickjs VM (no ambient access; only `nostr.query` is injected) + memory/time/output limits + author whitelist + container resource limits. For fully untrusted code, also run behind OS isolation (per-job container / gVisor).
