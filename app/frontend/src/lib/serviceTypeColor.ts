import { RubixLoaderColor } from '@samthomson/rubix-loader';
import { SERVICE_TYPE, isNpanelType, isRelayType, type ServiceType } from '../../../shared/serviceType';

type RubixColor = (typeof RubixLoaderColor)[keyof typeof RubixLoaderColor] | (string & {});

/** Same maroon as RubixLoaderColor.NotifHub; switch to the preset once 0.5.4 is on npm. */
const NOTIF_HUB = '#8F2E44';

/** Preset folder id (`metadata.id`) → cube color. New relays: add a row here. */
const RELAY_PRESET_RUBIX: Partial<Record<string, RubixColor>> = {
  stirfry: RubixLoaderColor.Strfry,
  'nostr-rs-relay': RubixLoaderColor.NostrRs,
  chapar: RubixLoaderColor.Chapar,
};

export const serviceTypeToRubixLoaderColor = (type?: string | null, presetId?: string | null): RubixColor => {
  if (presetId === 'grasp') return RubixLoaderColor.Grasp;
  if (presetId === 'notif-hub') return NOTIF_HUB;
  if (type === SERVICE_TYPE.BLOSSOM) return RubixLoaderColor.Blossom;
  if (isNpanelType(type)) return RubixLoaderColor.Npanel;
  if (isRelayType(type)) {
    const key = (presetId || '').trim();
    return (key && RELAY_PRESET_RUBIX[key]) || RubixLoaderColor.NostrRs;
  }
  return RubixLoaderColor.RelayKit;
};

export type { ServiceType };
