import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools'
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import type { EventTemplate } from 'nostr-tools'

const TOKEN_KEY = 'nh:token'

const NIP98_KIND = 27235

type SignedEvent = { id: string; sig: string; pubkey: string }

type Nip07 = {
  getPublicKey: () => Promise<string>
  signEvent: (event: EventTemplate) => Promise<SignedEvent>
}

export const nostrSigner = (): Nip07 | null => (window as unknown as { nostr?: Nip07 }).nostr ?? null

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY)

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

const SIGN_REQUEST = 'relaykit:sign-event'
const SIGN_RESULT = 'relaykit:sign-event:result'
const SIGN_TIMEOUT_MS = 60_000

export const embedded = (): boolean => window.parent !== window

/** Asks the relaykit parent frame to sign, since extensions don't inject into cross-origin iframes. */
const signViaParent = (event: EventTemplate): Promise<SignedEvent> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('relaykit did not respond to the signing request'))
    }, SIGN_TIMEOUT_MS)
    const onMessage = (message: MessageEvent) => {
      if (message.data?.type !== SIGN_RESULT || message.data.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (message.data.error) reject(new Error(String(message.data.error)))
      else resolve(message.data.event)
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: SIGN_REQUEST, id, event }, '*')
  })

const authEvent = (method: string, url: string): EventTemplate => ({
  kind: NIP98_KIND,
  created_at: Math.floor(Date.now() / 1000),
  content: '',
  tags: [
    ['u', url],
    ['method', method.toUpperCase()],
  ],
})

/** Signing happens once, to mint a token — so no key or signer connection is ever persisted. */
export type LoginMethod =
  | { via: 'extension' }
  | { via: 'relaykit' }
  | { via: 'nsec'; nsec: string }
  | { via: 'bunker'; uri: string }

const signWith = async (method: LoginMethod, template: EventTemplate): Promise<SignedEvent> => {
  if (method.via === 'extension') {
    const signer = nostrSigner()
    if (!signer) throw new Error('no nostr extension found in this browser')
    return signer.signEvent(template)
  }
  if (method.via === 'relaykit') return signViaParent(template)
  if (method.via === 'nsec') {
    const decoded = nip19.decode(method.nsec.trim())
    if (decoded.type !== 'nsec') throw new Error('that is not an nsec')
    return finalizeEvent(template, decoded.data)
  }
  const pointer = await parseBunkerInput(method.uri.trim())
  if (!pointer) throw new Error('could not read that bunker uri')
  const bunker = BunkerSigner.fromBunker(generateSecretKey(), pointer)
  try {
    await bunker.connect()
    return await bunker.signEvent(template)
  } finally {
    await bunker.close()
  }
}

/** Builds a nip-98 Authorization header value: base64 of an event signed for this exact method + url. */
export const nip98Header = async (login: LoginMethod, method: string, url: string): Promise<string> =>
  btoa(JSON.stringify(await signWith(login, authEvent(method, url))))
