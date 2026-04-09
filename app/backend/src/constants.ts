import path from 'path'

export { SERVICE_TYPE, type ServiceType } from '../../shared/serviceType'

export const DOKPLOY_URL = 'http://dokploy:3000'
export const CONFIG_PATH = path.join('/app', '.dokploy-key')
export const PRESETS_DIR = path.join('/app', 'presets')
export const DEFAULT_PROJECT_NAME = 'relaykit.ungrouped'

export const SERVER_INSIGHTS = {
  diskPath: '/',
  sampleIntervalMs: 5000,
  historyMaxPoints: 120,
  thresholds: {
    cpu: { warn: 70, critical: 90 },
    memory: { warn: 75, critical: 90 },
    disk: { warn: 80, critical: 92 },
  },
} as const
