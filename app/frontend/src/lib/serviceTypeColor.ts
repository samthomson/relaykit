import { RubixLoaderColor } from '@samthomson/rubix-loader';
import { SERVICE_TYPE, isNpanelType, isRelayType, type ServiceType } from '../../../shared/serviceType';

type RubixColor = (typeof RubixLoaderColor)[keyof typeof RubixLoaderColor];

/** Preset folder id (`metadata.id`) → cube color. New relays: add a row here. */
const RELAY_PRESET_RUBIX: Partial<Record<string, RubixColor>> = {
  stirfry: RubixLoaderColor.Strfry,
  'nostr-rs-relay': RubixLoaderColor.NostrRs,
  chapar: RubixLoaderColor.Chapar,
};

export const serviceTypeToRubixLoaderColor = (type?: string | null, presetId?: string | null) => {
  if (type === SERVICE_TYPE.BLOSSOM) return RubixLoaderColor.Blossom;
  if (isNpanelType(type)) return RubixLoaderColor.Npanel;
  if (isRelayType(type)) {
    const key = (presetId || '').trim();
    return (key && RELAY_PRESET_RUBIX[key]) || RubixLoaderColor.NostrRs;
  }
  return RubixLoaderColor.RelayKit;
};

export type { ServiceType };
