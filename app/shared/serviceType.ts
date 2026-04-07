export const SERVICE_TYPE = { RELAY: 'relay', BLOSSOM: 'blossom', NSITE: 'nsite' } as const
export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE]
