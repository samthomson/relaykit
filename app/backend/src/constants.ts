import path from 'path'

export { SERVICE_TYPE, isNpanelType, type ServiceType } from '../../shared/serviceType'

export const DOKPLOY_URL = 'http://dokploy:3000'
export const PRESETS_DIR = path.join('/app', 'presets')
export const DEFAULT_PROJECT_NAME = 'relaykit.ungrouped'

export const SERVER_INSIGHTS = {
  diskPath: '/',
  sampleIntervalMs: 5000,
  historyMaxPoints: 120,
  thresholds: {
    cpu: { warn: 70, critical: 85 },
    memory: { warn: 70, critical: 85 },
    disk: { warn: 70, critical: 85 },
  },
} as const

export const SERVICE_INSIGHTS = {
  historyLimit: 120,
  thresholds: {
    cpu: { warn: 70, critical: 85 },
    memory: { warn: 70, critical: 85 },
  },
} as const
