import { dedupeRelays } from '@relaykit/ui'

export type HubParams = {
  /** owner hint from ?npub= */
  npub: string | null
  /** wss relay urls from ?relays= (comma-separated) */
  relays: string[]
  /** when true (?embedded=1), running inside the relaykit iframe */
  embedded: boolean
}

export const parseParams = (search: string = window.location.search): HubParams => {
  const p = new URLSearchParams(search)
  const embeddedRaw = p.get('embedded')
  return {
    npub: p.get('npub'),
    relays: dedupeRelays((p.get('relays') ?? '').split(',')),
    embedded: embeddedRaw === '1' || embeddedRaw === 'true',
  }
}
