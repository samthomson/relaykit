import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import dns from 'dns/promises'
import fs from 'fs/promises'
import path from 'path'
import { createAuthContext, requireAuth, AuthContext } from './auth/middleware'
import { getBootstrapKey } from './db'
import { DOKPLOY_URL, CONFIG_PATH, PRESETS_DIR, DEFAULT_PROJECT_NAME } from './constants'

const t = initTRPC.context<{ auth: AuthContext | null; noBootstrapKey?: boolean; host?: string }>().create()

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

const getPresetMetadata = async (presetId: string) => {
  const metadata = await fs.readFile(path.join(PRESETS_DIR, presetId, 'metadata.json'), 'utf-8')
  return JSON.parse(metadata)
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

const registerDomain = async (composeId: string, host: string, presetData: { internalPort: number; serviceName: string }) => {
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
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Dokploy API key is invalid or expired. Update the bootstrap key (see README).',
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

  renameEnvironment: protectedProcedure
    .input(z.object({ environmentId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await dokployFetch('/api/environment.update', {
        method: 'POST',
        body: JSON.stringify({ environmentId: input.environmentId, name: input.name }),
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
          services.push({
            composeId: compose.composeId,
            name: compose.name,
            serviceType: presetData.label,
            status: runtimeStatus,
            createdAt: compose.createdAt,
            hostname: envVars[domainKey] || 'No hostname configured',
            domains: compose.domains || [],
            projectId: project.projectId,
            projectName: project.name,
            environmentId: environment.environmentId,
            environmentName: environment.name,
            type: presetData.type ?? null,
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
        const envString = Object.entries(input.config).map(([k, v]) => `${k}=${v}`).join('\n')
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
        const hostname = input.config[domainKey]
        if (hostname && presetData.serviceName) {
          await registerDomain(createCompose.composeId, hostname, presetData)
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

