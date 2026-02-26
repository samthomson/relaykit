import crypto from 'crypto';
import { verifyEvent } from 'nostr-tools';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Verify Nostr event signature (NIP-01)
export function verifyNostrSignature(event: NostrEvent): boolean {
  try {
    return verifyEvent(event);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Generate auth challenge for Nostr signing
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Verify challenge response
export function verifyChallengeResponse(
  challenge: string,
  event: NostrEvent,
  maxAgeSeconds = 60
): boolean {
  // Check event is recent
  const now = Math.floor(Date.now() / 1000);
  if (now - event.created_at > maxAgeSeconds) {
    return false;
  }

  // Check event contains the challenge
  if (event.content !== challenge) {
    return false;
  }

  // Verify signature
  return verifyNostrSignature(event);
}
