export const SERVICE_TYPE = { RELAY: 'relay', BLOSSOM: 'blossom', NPANEL: 'npanel', TOOLS: 'tools' } as const
export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE]

export const isNpanelType = (serviceType?: string | null): boolean =>
  serviceType === SERVICE_TYPE.NPANEL

export const isRelayType = (serviceType?: string | null): boolean =>
  serviceType === SERVICE_TYPE.RELAY

export const isToolsType = (serviceType?: string | null): boolean =>
  serviceType === SERVICE_TYPE.TOOLS
