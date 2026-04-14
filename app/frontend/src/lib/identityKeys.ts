import { nip19 } from 'nostr-tools'

export const getIdentityKeys = (key: string | null): { hex: string | null; npub: string | null } => {
  if (!key) return { hex: null, npub: null }

  if (key.startsWith('npub1')) {
    const bytes = nip19.decode(key).data as Uint8Array
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    return { hex, npub: key }
  }

  if (/^[a-f0-9]{64}$/i.test(key)) {
    return { hex: key, npub: nip19.npubEncode(key) }
  }

  return { hex: null, npub: null }
}
