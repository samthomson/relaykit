import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import dns from 'dns/promises'
import fs from 'fs/promises'
import path from 'path'
import { createAuthContext, requireAuth, AuthContext } from './auth/middleware'
import { getBootstrapKey } from './db'
import {
  DOKPLOY_URL,
  CONFIG_PATH,
  PRESETS_DIR,
  DEFAULT_PROJECT_NAME,
  SERVER_INSIGHTS,
  SERVICE_TYPE,
} from './constants'
import { applyNsiteHostnameToEnv, finalizeNsiteRouterEnv } from '../../shared/nsite'
import { createServerInsightsCollector } from '../../shared/insights'

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
    const services = []
    for (const project of projects) {
      for (const environment of project.environments || []) {
        for (const compose of environment.compose || []) {
          const presetId = compose.description
          if (!presetId) throw new Error(`Service ${compose.name} has no preset ID`)
          const presetData = await getPresetMetadata(presetId)
          if (!presetData.label) throw new Error(`Preset ${presetId} has no label`)
          const envVars = parseServiceEnvVarsString(compose.env)
          
          const runtimeStatus = compose.composeStatus === 'done' ? 'running' : compose.composeStatus
          
          const domainKey = presetData.domainConfigKey ?? 'RELAY_HOST'
          const hostname =
            presetData.id === SERVICE_TYPE.NSITE
              ? envVars.NSITE_ROUTER_HOST || envVars.NSITE_DOMAIN || envVars[domainKey]
              : envVars[domainKey]
          services.push({
            composeId: compose.composeId,
            name: compose.name,
            serviceType: presetData.label,
            status: runtimeStatus,
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

      if (preset.id === SERVICE_TYPE.NSITE) {
        if ((envVars.NSITE_PARENT_DOMAIN ?? '').trim()) {
          envVars = applyNsiteHostnameToEnv(envVars)
        }
        envVars = finalizeNsiteRouterEnv(envVars)
      }
      if (preset.id === SERVICE_TYPE.NSITE) {
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

        // Save to file
        await fs.writeFile(CONFIG_PATH, input.apiKey, 'utf-8')
        
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
        if (input.presetId === SERVICE_TYPE.NSITE) {
          if (!(configForDeploy.NSITE_PARENT_DOMAIN ?? '').trim()) {
            throw new Error('Site domain is required (the suffix after the site label, e.g. relayk.it).')
          }
          configForDeploy = applyNsiteHostnameToEnv(configForDeploy)
          configForDeploy = finalizeNsiteRouterEnv(configForDeploy)
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
          if (input.presetId === SERVICE_TYPE.NSITE && nsiteCanon && nsiteCanon !== hostname) {
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

