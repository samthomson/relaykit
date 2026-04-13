import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import dns from 'dns/promises'
import fs from 'fs/promises'
import path from 'path'
import http from 'http'
import { createAuthContext, requireAuth, AuthContext } from './auth/middleware'
import { getBootstrapKey, setBootstrapKey } from './db'
import {
  DOKPLOY_URL,
  PRESETS_DIR,
  DEFAULT_PROJECT_NAME,
  SERVER_INSIGHTS,
  SERVICE_INSIGHTS,
} from './constants'
import { isNpanelType } from '../../shared/serviceType'
import { applyNsiteHostnameToEnv, finalizeNsiteRouterEnv, normalizeNpanelNip05UsersEnv, NPANEL_NIP05_USERS_ENV_KEY } from '../../shared/nsite'
import { createServerInsightsCollector, type ServiceInsightsResponse } from '../../shared/insights'

const t = initTRPC.context<{ auth: AuthContext | null; noBootstrapKey?: boolean; host?: string }>().create()
const serverInsightsCollector = createServerInsightsCollector(SERVER_INSIGHTS)

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.noBootstrapKey) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'RelayKit is not configured. Run the setup script with your npub to set the Dokploy API key (see README).',
    })
  }
  const auth = requireAuth(ctx.auth)
  return next({ ctx: { ...ctx, auth } })
})

// Dokploy domain.create expects these; dev = no Traefik cert (Caddy/mkcert), prod = Let's Encrypt
enum CertificateType {
  None = 'none',
  LetsEncrypt = 'letsencrypt'
}
const getCertificateType = (): CertificateType =>
  process.env.NODE_ENV === 'development' ? CertificateType.None : CertificateType.LetsEncrypt

const parseServiceEnvVarsString = (env: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  if (!env) return out
  env.split('\n').forEach((line: string) => {
    const [key, ...values] = line.split('=')
    if (key && values.length > 0) {
      out[key.trim()] = values.join('=').trim()
    }
  })
  return out
}

const parseCsvList = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

type PresetFieldType = 'string' | 'boolean'
type PresetField = {
  id: string
  name: string
  type?: PresetFieldType
  required?: boolean
  default?: string
  description?: string
  placeholder?: string
}
type PresetMetadata = {
  id: string
  label: string
  description?: string
  type?: string
  serviceName?: string
  internalPort: number
  domainConfigKey?: string
  requiredConfig: PresetField[]
  repo?: string
  icon?: string
}

const stringifyEnvVars = (envVars: Record<string, string>): string =>
  Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

const coerceConfigValueToString = (field: PresetField, value: unknown): string => {
  const fieldType = field.type ?? 'string'
  if (fieldType === 'boolean') {
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    const str = String(value ?? '').trim().toLowerCase()
    return str === 'true' || str === '1' || str === 'yes' ? 'true' : 'false'
  }
  return String(value ?? '')
}

const getEditablePresetFields = (preset: PresetMetadata): PresetField[] => {
  const domainKey = preset.domainConfigKey ?? 'RELAY_HOST'
  return (preset.requiredConfig || []).filter((f) => f.id !== domainKey)
}

const getPresetMetadata = async (presetId: string) => {
  const metadata = await fs.readFile(path.join(PRESETS_DIR, presetId, 'metadata.json'), 'utf-8')
  return JSON.parse(metadata) as PresetMetadata
}

const ensureADefaultProjectExistsForServices = async (): Promise<{ projectId: string; environmentId: string }> => {
  const projects = await dokployFetch('/api/project.all')
  
  if (!Array.isArray(projects)) {
    throw new Error(`Expected array from project.all, got: ${typeof projects}`)
  }
  
  let project = projects.find((p: { name: string }) => p.name === DEFAULT_PROJECT_NAME)
  if (project) {
    const envId = project.environments?.[0]?.environmentId
    if (!envId) throw new Error(`No environment in project ${project.projectId}`)
    return { projectId: project.projectId, environmentId: envId }
  }
  
  const created = await dokployFetch('/api/project.create', {
    method: 'POST',
    body: JSON.stringify({ name: DEFAULT_PROJECT_NAME, description: 'Ungrouped services deployed via RelayKit' }),
  })
  
  const all = await dokployFetch('/api/project.all')
  project = all.find((p: { projectId: string }) => p.projectId === created.projectId)
  const environmentId = project?.environments?.[0]?.environmentId
  if (!environmentId) {
    throw new Error(`No environment after project create. Project: ${JSON.stringify(project)}`)
  }
  return { projectId: created.projectId, environmentId }
}

const registerDomain = async (composeId: string, host: string, presetData: { internalPort: number; serviceName?: string }) => {
  const certificateType = getCertificateType()
  const domainPayload = {
    composeId,
    host,
    https: certificateType !== CertificateType.None,
    path: '/',
    port: presetData.internalPort,
    certificateType,
    serviceName: presetData.serviceName,
  }
  
  console.log('Creating domain with payload:', JSON.stringify(domainPayload, null, 2))
  
  try {
    const response = await dokployFetch('/api/domain.create', {
      method: 'POST',
      body: JSON.stringify(domainPayload),
    })
    console.log('Domain creation successful:', JSON.stringify(response, null, 2))
    return response
  } catch (error) {
    console.error('Domain creation failed:', error)
    throw error
  }
}

/** Traefik needs a router (and cert) per Host; nsite may use a short public host plus the canonical NIP-5A host. */
const syncNsiteDokployDomains = async (composeId: string, envVars: Record<string, string>, presetData: PresetMetadata) => {
  const router = (envVars.NSITE_ROUTER_HOST || envVars.NSITE_DOMAIN || '').trim()
  const canon = (envVars.NSITE_DOMAIN || '').trim()
  const targets = new Set<string>()
  if (router) targets.add(router)
  if (canon && canon !== router) targets.add(canon)
  if (targets.size === 0) return

  const compose = await dokployFetch(`/api/compose.one?composeId=${composeId}`)
  let domains = (compose.domains || []) as { domainId: string; host: string }[]
  for (const dom of domains) {
    if (targets.has(dom.host)) continue
    await dokployFetch('/api/domain.delete', {
      method: 'POST',
      body: JSON.stringify({ domainId: dom.domainId }),
    })
  }

  const composeAfter = await dokployFetch(`/api/compose.one?composeId=${composeId}`)
  domains = (composeAfter.domains || []) as { domainId: string; host: string }[]
  const existing = new Set(domains.map((d) => d.host))
  for (const host of targets) {
    if (!existing.has(host)) await registerDomain(composeId, host, presetData)
  }
}

const diagnoseDokployAuthFailure = async (): Promise<{
  likelyInfraIssue: boolean
  detail: string
}> => {
  try {
    const res = await fetch(`${DOKPLOY_URL}/api/auth/session`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    if (res.status >= 500) {
      return {
        likelyInfraIssue: true,
        detail: `Dokploy auth/session endpoint returned ${res.status}.`,
      }
    }
    return {
      likelyInfraIssue: false,
      detail: `Dokploy auth/session endpoint returned ${res.status}.`,
    }
  } catch (e: any) {
    return {
      likelyInfraIssue: true,
      detail: `Dokploy auth/session probe failed: ${e?.message || 'unknown error'}.`,
    }
  }
}

const dokployFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${DOKPLOY_URL}${endpoint}`
  const key = await getBootstrapKey()
  if (!key) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'RelayKit is not configured. Run the install/setup script (see README).',
    })
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'x-api-key': key,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const text = await response.text()

  if (!response.ok) {
    console.error(`Dokploy API error on ${endpoint}:`, {
      status: response.status,
      statusText: response.statusText,
      body: text.substring(0, 500)
    })
    if (response.status === 401) {
      const diag = await diagnoseDokployAuthFailure()
      if (diag.likelyInfraIssue) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message:
            `Dokploy rejected the API key, but Dokploy auth appears unhealthy right now (${diag.detail}) ` +
            `This often indicates Dokploy internal DB connectivity issues, not just an invalid key.`,
        })
      }
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Dokploy API key was rejected (401). Key may be invalid/revoked. Update the bootstrap key (see README).',
      })
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Dokploy API error (${response.status}): ${text.substring(0, 200)}`,
    })
  }

  try {
    return JSON.parse(text)
  } catch (e) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Invalid JSON from Dokploy: ${text.substring(0, 100)}`,
    })
  }
}

const toFiniteNumber = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const estimateSampleIntervalMs = (history: { ts: number }[]): number => {
  if (history.length < 2) return 5000
  let totalDelta = 0
  let count = 0
  for (let i = 1; i < history.length; i += 1) {
    const delta = history[i].ts - history[i - 1].ts
    if (delta > 0) {
      totalDelta += delta
      count += 1
    }
  }
  if (count === 0) return 5000
  return Math.max(1000, Math.round(totalDelta / count))
}

const serviceInsightsHistory = new Map<string, ServiceInsightsResponse['history']>()
const DOCKER_SOCKET_PATH = '/var/run/docker.sock'

const dockerSocketGetJson = async (pathWithQuery: string): Promise<any> =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: DOCKER_SOCKET_PATH,
        path: pathWithQuery,
        method: 'GET',
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`Docker API ${res.statusCode}: ${body.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error(`Invalid JSON from Docker API: ${body.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.end()
  })

const toOneDecimal = (n: number): number => Math.round(n * 10) / 10

const getCpuPctFromStats = (stats: any): number => {
  const cpuTotal = toFiniteNumber(stats?.cpu_stats?.cpu_usage?.total_usage)
  const preCpuTotal = toFiniteNumber(stats?.precpu_stats?.cpu_usage?.total_usage)
  const systemTotal = toFiniteNumber(stats?.cpu_stats?.system_cpu_usage)
  const preSystemTotal = toFiniteNumber(stats?.precpu_stats?.system_cpu_usage)
  const onlineCpus =
    toFiniteNumber(stats?.cpu_stats?.online_cpus) ||
    toFiniteNumber(stats?.cpu_stats?.cpu_usage?.percpu_usage?.length) ||
    1

  const cpuDelta = cpuTotal - preCpuTotal
  const systemDelta = systemTotal - preSystemTotal
  if (cpuDelta <= 0 || systemDelta <= 0) return 0
  return toOneDecimal((cpuDelta / systemDelta) * onlineCpus * 100)
}

const getNetworkTotals = (stats: any): { inBytes: number; outBytes: number } => {
  const networks = stats?.networks || {}
  let inBytes = 0
  let outBytes = 0
  for (const net of Object.values(networks) as any[]) {
    inBytes += toFiniteNumber(net?.rx_bytes)
    outBytes += toFiniteNumber(net?.tx_bytes)
  }
  return { inBytes, outBytes }
}

const getBlockIoTotals = (stats: any): { readBytes: number; writeBytes: number } => {
  const entries = Array.isArray(stats?.blkio_stats?.io_service_bytes_recursive)
    ? stats.blkio_stats.io_service_bytes_recursive
    : []
  let readBytes = 0
  let writeBytes = 0
  for (const item of entries) {
    const op = String(item?.op || '').toLowerCase()
    const value = toFiniteNumber(item?.value)
    if (op === 'read') readBytes += value
    if (op === 'write') writeBytes += value
  }
  return { readBytes, writeBytes }
}

const getRunningComposeProjects = async (): Promise<Set<string> | null> => {
  try {
    await fs.access(DOCKER_SOCKET_PATH)
    const containers = await dockerSocketGetJson('/containers/json?all=0')
    if (!Array.isArray(containers)) return null
    const runningProjects = new Set<string>()
    for (const container of containers) {
      const project = String(container?.Labels?.['com.docker.compose.project'] || '').trim()
      if (project) runningProjects.add(project)
    }
    return runningProjects
  } catch {
    return null
  }
}

const loadComposeAppName = async (composeId: string): Promise<string> => {
  const compose = await dokployFetch(`/api/compose.one?composeId=${composeId}`)
  const appName = String(compose?.appName || '').trim()
  if (!appName) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve runtime app name for this service.',
    })
  }
  return appName
}

const getServiceInsightsFromDokploy = async (composeId: string): Promise<ServiceInsightsResponse> => {
  try {
    await fs.access(DOCKER_SOCKET_PATH)
  } catch {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Service insights are unavailable: Docker runtime access is not configured.',
    })
  }

  const appName = await loadComposeAppName(composeId)
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${appName}`] }))
  const containers = await dockerSocketGetJson(`/containers/json?all=0&size=1&filters=${filters}`)

  if (!Array.isArray(containers) || containers.length === 0) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Service insights are unavailable: service container is not running.',
    })
  }

  const statsList = await Promise.all(
    containers.map((container: any) => dockerSocketGetJson(`/containers/${container.Id}/stats?stream=false`))
  )

  let cpuPct = 0
  let memoryUsedBytes = 0
  let memoryTotalBytes = 0
  let networkInBytes = 0
  let networkOutBytes = 0
  let blockReadBytes = 0
  let blockWriteBytes = 0
  let storageUsedBytes = 0

  for (let i = 0; i < statsList.length; i += 1) {
    const stats = statsList[i]
    const container = containers[i]
    cpuPct += getCpuPctFromStats(stats)
    const memUsed = toFiniteNumber(stats?.memory_stats?.usage)
    const memTotal = toFiniteNumber(stats?.memory_stats?.limit)
    memoryUsedBytes += memUsed
    memoryTotalBytes += memTotal
    const net = getNetworkTotals(stats)
    networkInBytes += net.inBytes
    networkOutBytes += net.outBytes
    const io = getBlockIoTotals(stats)
    blockReadBytes += io.readBytes
    blockWriteBytes += io.writeBytes
    storageUsedBytes += toFiniteNumber(container?.SizeRw)
  }

  const ts = Date.now()
  const current = {
    ts,
    cpuPct: toOneDecimal(Math.max(0, cpuPct)),
    memoryUsedPct: memoryTotalBytes > 0 ? toOneDecimal((memoryUsedBytes / memoryTotalBytes) * 100) : 0,
    memoryUsedBytes: Math.max(0, Math.round(memoryUsedBytes)),
    memoryTotalBytes: Math.max(0, Math.round(memoryTotalBytes)),
    storageUsedBytes: Math.max(0, Math.round(storageUsedBytes)),
    networkInBytes: Math.max(0, Math.round(networkInBytes)),
    networkOutBytes: Math.max(0, Math.round(networkOutBytes)),
    blockReadBytes: Math.max(0, Math.round(blockReadBytes)),
    blockWriteBytes: Math.max(0, Math.round(blockWriteBytes)),
  }

  const prev = serviceInsightsHistory.get(composeId) || []
  const history = [...prev, current].slice(-SERVICE_INSIGHTS.historyLimit)
  serviceInsightsHistory.set(composeId, history)

  return {
    composeId,
    appName,
    sampleIntervalMs: estimateSampleIntervalMs(history),
    thresholds: SERVICE_INSIGHTS.thresholds,
    current,
    history,
  }
}

export const appRouter = router({
  listPresets: publicProcedure
    .input(z.void())
    .query(async () => {
    const presets = []
    try {
      for (const dir of await fs.readdir(PRESETS_DIR)) {
        try {
          presets.push(await getPresetMetadata(dir))
        } catch {
          // Skip dirs without valid metadata.json
        }
      }
    } catch (error) {
      console.error('Error reading presets:', error)
    }
    return presets
  }),

  listProjects: protectedProcedure
    .input(z.void())
    .query(async () => {
      const projects = await dokployFetch('/api/project.all')
      return (projects as any[])
        .map((p) => ({
          projectId: p.projectId,
          name: p.name,
          description: p.description ?? '',
          createdAt: p.createdAt ?? null,
          environments: (p.environments || [])
            .map((e: any) => ({
              environmentId: e.environmentId,
              name: e.name,
              createdAt: e.createdAt ?? null,
            }))
            .sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()),
        }))
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    }),

  createProject: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const created = await dokployFetch('/api/project.create', {
        method: 'POST',
        body: JSON.stringify({ name: input.name, description: '' }),
      })
      return {
        projectId: created.project.projectId,
        environmentId: created.environment.environmentId,
      }
    }),

  createEnvironment: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const created = await dokployFetch('/api/environment.create', {
        method: 'POST',
        body: JSON.stringify({ projectId: input.projectId, name: input.name }),
      })
      return { environmentId: created.environmentId }
    }),

  renameProject: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/project.update', {
        method: 'POST',
        body: JSON.stringify({ projectId: input.projectId, name: input.name }),
      })
      return { success: true }
    }),

  renameEnvironment: protectedProcedure
    .input(z.object({ environmentId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/environment.update', {
        method: 'POST',
        body: JSON.stringify({ environmentId: input.environmentId, name: input.name }),
      })
      return { success: true }
    }),

  deleteProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/project.remove', {
        method: 'POST',
        body: JSON.stringify({ projectId: input.projectId }),
      })
      return { success: true }
    }),

  deleteEnvironment: protectedProcedure
    .input(z.object({ environmentId: z.string() }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/environment.remove', {
        method: 'POST',
        body: JSON.stringify({ environmentId: input.environmentId }),
      })
      return { success: true }
    }),

  moveService: protectedProcedure
    .input(z.object({ composeId: z.string(), targetEnvironmentId: z.string() }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/compose.move', {
        method: 'POST',
        body: JSON.stringify({ composeId: input.composeId, targetEnvironmentId: input.targetEnvironmentId }),
      })
      return { success: true }
    }),

  listServices: protectedProcedure
    .input(z.void())
    .query(async ({ ctx }) => {
    const projects = await dokployFetch('/api/project.all')
    const runningProjects = await getRunningComposeProjects()
    const services = []
    for (const project of projects) {
      for (const environment of project.environments || []) {
        for (const compose of environment.compose || []) {
          const presetId = compose.description
          if (!presetId) throw new Error(`Service ${compose.name} has no preset ID`)
          let presetData: PresetMetadata
          try {
            presetData = await getPresetMetadata(presetId)
          } catch (error: any) {
            const brokenReason = `Missing preset metadata for "${presetId}": ${error?.message || 'unknown error'}`
            console.warn(`Marking compose ${compose.composeId} (${compose.name}) as broken: ${brokenReason}`)
            services.push({
              composeId: compose.composeId,
              name: compose.name,
              presetId,
              serviceType: `misconfigured (${presetId})`,
              status: 'error',
              createdAt: compose.createdAt,
              hostname: compose.domains?.[0]?.host || 'No hostname configured',
              domains: compose.domains || [],
              projectId: project.projectId,
              projectName: project.name,
              environmentId: environment.environmentId,
              environmentName: environment.name,
              type: null,
              canEditConfig: false,
              whitelistedPubkeys: [],
              whitelistedKinds: [],
              blacklistedKinds: [],
              requireNip42: false,
              repo: undefined,
              icon: '⚠',
              brokenPreset: true,
              brokenPresetReason: brokenReason,
            })
            continue
          }
          if (!presetData.label) throw new Error(`Preset ${presetId} has no label`)
          const envVars = parseServiceEnvVarsString(compose.env)
          
          let runtimeStatus = compose.composeStatus === 'done' ? 'running' : compose.composeStatus
          if (compose.composeStatus === 'done' && runningProjects) {
            const appName = String(compose.appName || '').trim()
            if (appName) {
              runtimeStatus = runningProjects.has(appName) ? 'running' : 'stopped'
            }
          }
          
          const domainKey = presetData.domainConfigKey ?? 'RELAY_HOST'
          const hostname =
            isNpanelType(presetData.id)
              ? envVars.NSITE_ROUTER_HOST || envVars.NSITE_DOMAIN || envVars[domainKey]
              : envVars[domainKey]
          services.push({
            composeId: compose.composeId,
            name: compose.name,
            presetId: presetData.id,
            serviceType: presetData.label,
            status: String(runtimeStatus).toLowerCase(),
            createdAt: compose.createdAt,
            hostname: hostname || 'No hostname configured',
            domains: compose.domains || [],
            projectId: project.projectId,
            projectName: project.name,
            environmentId: environment.environmentId,
            environmentName: environment.name,
            type: presetData.type ?? null,
            canEditConfig: getEditablePresetFields(presetData).length > 0,
            whitelistedPubkeys: parseCsvList(envVars.WHITELISTED_PUBKEYS),
            whitelistedKinds: parseCsvList(envVars.WHITELISTED_KINDS),
            blacklistedKinds: parseCsvList(envVars.BLACKLISTED_KINDS),
            requireNip42: (envVars.REQUIRE_NIP42 || '').toLowerCase() === 'true',
            nsiteSiteNpub: envVars.NSITE_SITE_NPUB || undefined,
            nsiteParentDomain: envVars.NSITE_PARENT_DOMAIN || undefined,
            nsiteSiteD: envVars.NSITE_SITE_D || undefined,
            nsiteVisitorHost: envVars.NSITE_VISITOR_HOST || undefined,
            nsiteCanonicalHost: envVars.NSITE_DOMAIN || undefined,
            nsiteManifestEventId: envVars.NSITE_MANIFEST_EVENT_ID || undefined,
            repo: presetData.repo,
            icon: presetData.icon,
          })
        }
      }
    }
    services.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return services
  }),

  // Delete a service
  deleteService: protectedProcedure
    .input(z.object({
      composeId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      await dokployFetch('/api/compose.delete', {
        method: 'POST',
        body: JSON.stringify({
          composeId: input.composeId
        })
      })
      
      return {
        success: true,
        message: 'Service deleted successfully'
      }
    }),

  // Stop a service
  stopService: protectedProcedure
    .input(z.object({
      composeId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      await dokployFetch('/api/compose.stop', {
        method: 'POST',
        body: JSON.stringify({
          composeId: input.composeId
        })
      })
      
      return {
        success: true,
        message: 'Service stopped'
      }
    }),

  // Start a service
  startService: protectedProcedure
    .input(z.object({
      composeId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      await dokployFetch('/api/compose.start', {
        method: 'POST',
        body: JSON.stringify({
          composeId: input.composeId
        })
      })
      
      return {
        success: true,
        message: 'Service started'
      }
    }),

  updateServiceDomain: protectedProcedure
    .input(z.object({
      composeId: z.string(),
      domainId: z.string(),
      newHost: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      const compose = await dokployFetch(`/api/compose.one?composeId=${input.composeId}`)
      const presetData = await getPresetMetadata(compose.description)
      // Dokploy has no domain.update; change domain = delete old then create new
      await dokployFetch('/api/domain.delete', {
        method: 'POST',
        body: JSON.stringify({ domainId: input.domainId })
      })
      await registerDomain(input.composeId, input.newHost, presetData)
      await dokployFetch('/api/compose.redeploy', {
        method: 'POST',
        body: JSON.stringify({ composeId: input.composeId })
      })
      return { success: true, message: 'Domain updated and service redeployed' }
    }),

  getServiceConfig: protectedProcedure
    .input(z.object({ composeId: z.string() }))
    .query(async ({ input }) => {
      const compose = await dokployFetch(`/api/compose.one?composeId=${input.composeId}`)
      const preset = await getPresetMetadata(compose.description)
      const envVars = parseServiceEnvVarsString(compose.env)
      const editableFields = getEditablePresetFields(preset)
      const config: Record<string, string> = {}
      for (const field of editableFields) {
        config[field.id] = envVars[field.id] ?? field.default ?? ''
      }
      return {
        composeId: input.composeId,
        presetId: preset.id,
        fields: editableFields,
        config,
      }
    }),

  updateServiceConfig: protectedProcedure
    .input(
      z.object({
        composeId: z.string(),
        config: z.record(z.string(), z.union([z.string(), z.boolean()])),
      })
    )
    .mutation(async ({ input }) => {
      const compose = await dokployFetch(`/api/compose.one?composeId=${input.composeId}`)
      const preset = await getPresetMetadata(compose.description)
      const editableFields = getEditablePresetFields(preset)
      const editableById = Object.fromEntries(editableFields.map((f) => [f.id, f] as const))
      let envVars = parseServiceEnvVarsString(compose.env)

      for (const [key, rawValue] of Object.entries(input.config)) {
        const field = editableById[key]
        if (!field) continue
        envVars[key] = coerceConfigValueToString(field, rawValue)
      }

      if (isNpanelType(preset.id)) {
        if ((envVars.NSITE_PARENT_DOMAIN ?? '').trim()) {
          envVars = applyNsiteHostnameToEnv(envVars)
        }
        envVars = finalizeNsiteRouterEnv(envVars)
        envVars[NPANEL_NIP05_USERS_ENV_KEY] = normalizeNpanelNip05UsersEnv(envVars[NPANEL_NIP05_USERS_ENV_KEY] ?? '')
      }
      if (isNpanelType(preset.id)) {
        await syncNsiteDokployDomains(input.composeId, envVars, preset)
      }

      const env = stringifyEnvVars(envVars)
      await dokployFetch('/api/compose.update', {
        method: 'POST',
        body: JSON.stringify({ composeId: input.composeId, env, sourceType: 'raw' }),
      })
      await dokployFetch('/api/compose.redeploy', {
        method: 'POST',
        body: JSON.stringify({ composeId: input.composeId }),
      })

      return { success: true, message: 'Service config updated and redeployed' }
    }),

  // Check Dokploy connection (safe: never throws, always returns JSON)
  checkDokploy: publicProcedure
    .input(z.void())
    .query(async () => {
      try {
        const hasApiKey = !!(await getBootstrapKey())
        await fetch(`${DOKPLOY_URL}/`)
        return { reachable: true, url: DOKPLOY_URL, hasApiKey }
      } catch (e: any) {
        let hasApiKey = false
        try { hasApiKey = !!(await getBootstrapKey()) } catch { /* ignore */ }
        return {
          reachable: false,
          hasApiKey,
          url: DOKPLOY_URL,
          error: e?.message || 'Unknown error',
        }
      }
    }),

  // Save Dokploy API key
  saveApiKey: publicProcedure
    .input(z.object({
      apiKey: z.string()
    }))
    .mutation(async ({ input }) => {
      // Validate API key by calling Dokploy API
      try {
        const response = await fetch(`${DOKPLOY_URL}/api/project.all`, {
          headers: {
            'x-api-key': input.apiKey,
          },
        })

        if (!response.ok) {
          throw new Error('Invalid API key')
        }

        await setBootstrapKey(input.apiKey)
        
        return {
          success: true,
          message: 'API key saved successfully!',
        }
      } catch (error: any) {
        throw new Error(`Failed to save API key: ${error.message}`)
      }
    }),

  getServerIp: protectedProcedure
    .input(z.void())
    .query(async ({ ctx }) => {
      const host = ctx.host?.trim()
      if (!host) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not get server IP (no Host header).' })
      const isV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      if (isV4) return { ip: host }
      const addrs = await dns.resolve4(host)
      const ip = addrs?.[0]
      if (!ip) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not resolve server IP.' })
      return { ip }
    }),

  getServerInsights: protectedProcedure
    .input(z.void())
    .query(async () => serverInsightsCollector.getServerInsights()),

  getServiceInsights: protectedProcedure
    .input(z.object({ composeId: z.string().min(1) }))
    .query(async ({ input }) => getServiceInsightsFromDokploy(input.composeId)),

  getServicesInsights: protectedProcedure
    .input(z.object({ composeIds: z.array(z.string().min(1)).min(1).max(200) }))
    .query(async ({ input }) => {
      const out: Record<string, ServiceInsightsResponse | null> = {}
      await Promise.all(
        input.composeIds.map(async (composeId) => {
          try {
            out[composeId] = await getServiceInsightsFromDokploy(composeId)
          } catch {
            out[composeId] = null
          }
        })
      )
      return out
    }),

  testDnsRecord: protectedProcedure
    .input(z.object({ host: z.string().min(1), expectedIp: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const addrs = await dns.lookup(input.host, { family: 4, all: true, verbatim: true })
        const ips = addrs.map((a) => a.address)
        return { ok: ips.includes(input.expectedIp), ips }
      } catch (e: any) {
        return { ok: false, ips: [], error: e?.message || 'DNS lookup failed' }
      }
    }),


  deployService: protectedProcedure
    .input(z.object({
      presetId: z.string(),
      config: z.record(z.string(), z.string()),
      environmentId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const presetDir = path.join(PRESETS_DIR, input.presetId)
        const composeContent = await fs.readFile(path.join(presetDir, 'docker-compose.yml'), 'utf-8')
        let configForDeploy = { ...input.config }
        if (isNpanelType(input.presetId)) {
          if (!(configForDeploy.NSITE_PARENT_DOMAIN ?? '').trim()) {
            throw new Error('Site domain is required (the suffix after the site label, e.g. relayk.it).')
          }
          configForDeploy = applyNsiteHostnameToEnv(configForDeploy)
          configForDeploy = finalizeNsiteRouterEnv(configForDeploy)
          configForDeploy[NPANEL_NIP05_USERS_ENV_KEY] = normalizeNpanelNip05UsersEnv(
            configForDeploy[NPANEL_NIP05_USERS_ENV_KEY] ?? '',
          )
        }
        const envString = stringifyEnvVars(configForDeploy)
        const environmentId = input.environmentId ?? (await ensureADefaultProjectExistsForServices()).environmentId

        const uniqueSuffix = Date.now()
        const composeName = `${input.presetId}-${uniqueSuffix}`
        const composeFile = composeContent.replace(/\{\{DEPLOY_SUFFIX\}\}/g, String(uniqueSuffix))

        const createCompose = await dokployFetch('/api/compose.create', {
          method: 'POST',
          body: JSON.stringify({
            name: composeName,
            description: input.presetId,
            appName: input.presetId,
            composeType: 'docker-compose',
            sourceType: 'raw',
            composeFile,
            env: envString,
            environmentId
          })
        })
        await dokployFetch('/api/compose.update', {
          method: 'POST',
          body: JSON.stringify({ composeId: createCompose.composeId, env: envString, sourceType: 'raw' })
        })

        const presetData = await getPresetMetadata(input.presetId)
        const domainKey = presetData.domainConfigKey ?? 'RELAY_HOST'
        const hostname = configForDeploy[domainKey] || configForDeploy.NSITE_DOMAIN
        const nsiteCanon = (configForDeploy.NSITE_DOMAIN || '').trim()
        if (hostname && presetData.serviceName) {
          await registerDomain(createCompose.composeId, hostname, presetData)
          if (isNpanelType(input.presetId) && nsiteCanon && nsiteCanon !== hostname) {
            await registerDomain(createCompose.composeId, nsiteCanon, presetData)
          }
        }

        await dokployFetch('/api/compose.deploy', {
          method: 'POST',
          body: JSON.stringify({ composeId: createCompose.composeId })
        })

        return {
          success: true,
          composeId: createCompose.composeId,
          message: 'Service deployment started (may take a moment to become fully running)'
        }
      } catch (error: any) {
        throw new Error(`Failed to deploy service: ${error.message}`)
      }
    }),
})

export type AppRouter = typeof appRouter

