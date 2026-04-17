export type EmbeddableAppId = 'relay-explorer' | 'blossom-explorer' | 'nsite-explorer'

export type EmbeddableApp = {
  id: EmbeddableAppId
  label: string
  devUrl: string
  prodPath: string
  buildContext: (ctx: Record<string, string | undefined>) => string
}

const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '')
  const pairs = entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
  return pairs.length ? `?${pairs.join('&')}` : ''
}

export const EMBEDDABLE_APPS: Record<EmbeddableAppId, EmbeddableApp> = {
  'relay-explorer': {
    id: 'relay-explorer',
    label: 'relay explorer',
    devUrl: 'http://localhost:5174/apps/relay-explorer/',
    prodPath: '/apps/relay-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', relay: ctx.relay }),
  },
  'blossom-explorer': {
    id: 'blossom-explorer',
    label: 'blossom explorer',
    devUrl: 'http://localhost:5175/apps/blossom-explorer/',
    prodPath: '/apps/blossom-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', server: ctx.server }),
  },
  'nsite-explorer': {
    id: 'nsite-explorer',
    label: 'nsite explorer',
    devUrl: 'http://localhost:5176/apps/nsite-explorer/',
    prodPath: '/apps/nsite-explorer/',
    buildContext: (ctx) => qs({ embedded: '1', gateway: ctx.gateway, pubkey: ctx.pubkey }),
  },
}

const isDev = ((import.meta as unknown) as { env?: { DEV?: boolean } }).env?.DEV ?? false

export const buildEmbeddedAppSrc = (appId: EmbeddableAppId, ctx: Record<string, string | undefined>): string => {
  const app = EMBEDDABLE_APPS[appId]
  const base = isDev ? app.devUrl : app.prodPath
  return `${base}${app.buildContext(ctx)}`
}
