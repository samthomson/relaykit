import path from 'path'

export const SERVICE_TYPE = { RELAY: 'relay', BLOSSOM: 'blossom' } as const
export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE]

export const DOKPLOY_URL = 'http://dokploy:3000'
export const CONFIG_PATH = path.join('/app', '.dokploy-key')
export const PRESETS_DIR = path.join('/app', 'presets')
export const DEFAULT_PROJECT_NAME = 'relaykit.ungrouped'
