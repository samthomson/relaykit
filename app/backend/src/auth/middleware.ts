import { TRPCError } from '@trpc/server';
import { verifyJWT } from './jwt';
import { getBootstrapKey, getOwnerNpub } from '../db';

export interface AuthContext {
  npub: string;
  dokployApiKey: string;
}

export async function createAuthContext({ req }: { req: any }): Promise<{ auth: AuthContext | null }> {
  const authHeader = req?.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { auth: null };
  }

  const token = authHeader.substring(7);
  const payload = verifyJWT(token);

  if (!payload) {
    return { auth: null };
  }

  // Verify this is the owner
  const ownerNpub = await getOwnerNpub();
  if (!ownerNpub || payload.npub !== ownerNpub) {
    return { auth: null };
  }

  // Get bootstrap key (shared Dokploy key)
  const bootstrapKey = await getBootstrapKey();
  if (!bootstrapKey) {
    return { auth: null };
  }

  return {
    auth: {
      npub: payload.npub,
      dokployApiKey: bootstrapKey,
    },
  };
}

export function requireAuth(auth: AuthContext | null): AuthContext {
  if (!auth) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  return auth;
}
