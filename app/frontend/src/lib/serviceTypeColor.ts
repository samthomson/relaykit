import { RubixLoaderColor } from '@samthomson/rubix-loader';
import { SERVICE_TYPE, isNpanelType, type ServiceType } from '../../../shared/serviceType';

export const serviceTypeToRubixLoaderColor = (
  type?: string | null,
  presetLabel?: string | null,
) => {
  if (type === SERVICE_TYPE.BLOSSOM) return RubixLoaderColor.Blossom;
  if (isNpanelType(type)) return RubixLoaderColor.Npanel;
  if (type === SERVICE_TYPE.RELAY) {
    const key = (presetLabel || '').trim().toLowerCase();
    if (key.includes('strfry') || key === 'stirfry') return RubixLoaderColor.Strfry;
    if (key.includes('nostr-rs') || key.includes('nostr_rs')) return RubixLoaderColor.NostrRs;
    return RubixLoaderColor.NostrRs;
  }
  return RubixLoaderColor.RelayKit;
};

export type { ServiceType };
