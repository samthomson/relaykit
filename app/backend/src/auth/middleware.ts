import { TRPCError } from '@trpc/server';
import { nip19 } from 'nostr-tools';
import { verifyJWT } from './jwt';
import { getBootstrapKey, getOwnerNpub } from '../db';

export interface AuthContext {
  npub: string;
  dokployApiKey: string;
}

/** Normalize npub to hex for comparison (owner file may be npub1..., JWT has hex from event.pubkey). */
function ownerNpubToHex(ownerNpub: string): string | null {
  const trimmed = ownerNpub.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type === 'npub') return decoded.data;
      return null;
    } catch {
      return null;
    }
  }
  return trimmed;
}

export type AuthContextResult = { auth: AuthContext | null; noBootstrapKey?: boolean };

export async function createAuthContext({ req }: { req: any }): Promise<AuthContextResult> {
  const authHeader = req?.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { auth: null };
  }

  const token = authHeader.substring(7);
  const payload = verifyJWT(token);

  if (!payload) {
    return { auth: null };
  }

  const ownerNpub = await getOwnerNpub();
  const ownerHex = ownerNpub ? ownerNpubToHex(ownerNpub) : null;
  const payloadHex = payload.npub;
  if (!ownerHex || payloadHex !== ownerHex) {
    return { auth: null };
  }

  const bootstrapKey = await getBootstrapKey();
  if (!bootstrapKey) {
    return { auth: null, noBootstrapKey: true };
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
