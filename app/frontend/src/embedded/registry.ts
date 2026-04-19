export type EmbeddableAppId = 'relay-explorer' | 'blossom-explorer' | 'nsite-explorer'

export type EmbeddableApp = {
  id: EmbeddableAppId
  label: string
  description: string
  /** Each embed runs its own Vite dev server; prod serves the same path on this origin. */
  devPort: number
  basePath: string
  buildContext: (ctx: Record<string, string | undefined>) => string
}

const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '')
  const pairs = entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
  return pairs.length ? `?${pairs.join('&')}` : ''
}

export const EMBEDDABLE_APP_IDS: EmbeddableAppId[] = ['relay-explorer', 'blossom-explorer', 'nsite-explorer']

export const EMBEDDABLE_APPS: Record<EmbeddableAppId, EmbeddableApp> = {
  'relay-explorer': {
    id: 'relay-explorer',
    label: 'relay explorer',
    description: 'inspect live nostr relay events',
    devPort: 5174,
    basePath: '/apps/relay-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', relay: ctx.relay, relays: ctx.relays, standalone: ctx.standalone, session: ctx.session }),
  },
  'blossom-explorer': {
    id: 'blossom-explorer',
    label: 'blossom explorer',
    description: 'browse and verify blossom blobs',
    devPort: 5175,
    basePath: '/apps/blossom-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', server: ctx.server, standalone: ctx.standalone, session: ctx.session }),
  },
  'nsite-explorer': {
    id: 'nsite-explorer',
    label: 'nPanel',
    description: 'inspect and debug nsite data',
    devPort: 5176,
    basePath: '/apps/nsite-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', gateway: ctx.gateway, pubkey: ctx.pubkey, standalone: ctx.standalone, session: ctx.session }),
  },
}

const isDev = ((import.meta as unknown) as { env?: { DEV?: boolean } }).env?.DEV ?? false

export const buildEmbeddedAppSrc = (appId: EmbeddableAppId, ctx: Record<string, string | undefined>): string => {
  const app = EMBEDDABLE_APPS[appId]
  const base = isDev ? `http://localhost:${app.devPort}${app.basePath}` : app.basePath
  return `${base}${app.buildContext(ctx)}`
}
