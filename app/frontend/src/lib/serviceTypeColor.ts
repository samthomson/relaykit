import { RubixLoaderColor } from '@samthomson/rubix-loader';
import { SERVICE_TYPE, type ServiceType } from '../../../shared/serviceType';

export const serviceTypeToRubixLoaderColor = (serviceType?: string | null) => {
  if (serviceType === SERVICE_TYPE.BLOSSOM) return RubixLoaderColor.Blossom;
  if (serviceType === SERVICE_TYPE.NSITE) return RubixLoaderColor.Nsite;
  if (serviceType === SERVICE_TYPE.RELAY) return RubixLoaderColor.NostrRs;
  return RubixLoaderColor.RelayKit;
};

export type { ServiceType };
