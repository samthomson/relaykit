import { SERVICE_TYPE } from '../../../shared/serviceType'

export type EmbeddableAppId = 'relay-explorer' | 'blossom-explorer' | 'nsite-explorer' | 'grasp-explorer' | 'hello-world'

export type EmbeddableApp = {
  id: EmbeddableAppId
  label: string
  description: string
  /** Service type this app represents; drives the loader cube colour when launched without a service. */
  serviceType: string
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

export const EMBEDDABLE_APP_IDS: EmbeddableAppId[] = ['relay-explorer', 'blossom-explorer', 'nsite-explorer', 'grasp-explorer', 'hello-world']

export const EMBEDDABLE_APPS: Record<EmbeddableAppId, EmbeddableApp> = {
  'relay-explorer': {
    id: 'relay-explorer',
    label: 'relay explorer',
    description: 'inspect live nostr relay events',
    serviceType: SERVICE_TYPE.RELAY,
    devPort: 5174,
    basePath: '/apps/relay-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', relay: ctx.relay, relays: ctx.relays, standalone: ctx.standalone, session: ctx.session, npub: ctx.npub }),
  },
  'blossom-explorer': {
    id: 'blossom-explorer',
    label: 'blossom explorer',
    description: 'browse and verify blossom blobs',
    serviceType: SERVICE_TYPE.BLOSSOM,
    devPort: 5175,
    basePath: '/apps/blossom-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', server: ctx.server, standalone: ctx.standalone, session: ctx.session }),
  },
  'nsite-explorer': {
    id: 'nsite-explorer',
    label: 'nPanel',
    description: 'inspect and debug nsite data',
    serviceType: SERVICE_TYPE.NPANEL,
    devPort: 5176,
    basePath: '/apps/nsite-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', gateway: ctx.gateway, pubkey: ctx.pubkey, siteD: ctx.siteD, relays: ctx.relays, owner: ctx.owner, standalone: ctx.standalone, session: ctx.session }),
  },
  'grasp-explorer': {
    id: 'grasp-explorer',
    label: 'grasp explorer',
    description: 'browse git repos hosted on a grasp server',
    serviceType: SERVICE_TYPE.TOOLS,
    devPort: 5178,
    basePath: '/apps/grasp-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', relay: ctx.relay, server: ctx.server, standalone: ctx.standalone, session: ctx.session }),
  },
  'hello-world': {
    id: 'hello-world',
    label: 'hello world',
    description: 'scheduled nostr posting',
    serviceType: 'hello-world',
    devPort: 5177,
    basePath: '/apps/hello-world/',
    buildContext: (ctx) => qs({ embedded: '1', relays: ctx.relays, npub: ctx.npub, standalone: ctx.standalone, session: ctx.session }),
  },
}

const isDev = ((import.meta as unknown) as { env?: { DEV?: boolean } }).env?.DEV ?? false

export const buildEmbeddedAppSrc = (appId: EmbeddableAppId, ctx: Record<string, string | undefined>): string => {
  const app = EMBEDDABLE_APPS[appId]
  const base = isDev ? `http://localhost:${app.devPort}${app.basePath}` : app.basePath
  return `${base}${app.buildContext(ctx)}`
}
