import path from 'path'

export { SERVICE_TYPE, type ServiceType } from '../../shared/serviceType'

export const DOKPLOY_URL = 'http://dokploy:3000'
export const CONFIG_PATH = path.join('/app', '.dokploy-key')
export const PRESETS_DIR = path.join('/app', 'presets')
export const DEFAULT_PROJECT_NAME = 'relaykit.ungrouped'
