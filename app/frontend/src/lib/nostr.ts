// Nostr NIP-07 browser extension interface
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: {
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
      }): Promise<{
        id: string;
        pubkey: string;
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
        sig: string;
      }>;
    };
  }
}

export async function checkNostrExtension(): Promise<boolean> {
  return !!window.nostr;
}

export async function getNostrPublicKey(): Promise<string> {
  if (!window.nostr) {
    throw new Error('Nostr extension not found. Please install a Nostr browser extension like Alby or nos2x.');
  }
  return await window.nostr.getPublicKey();
}

export async function signNostrChallenge(challenge: string): Promise<any> {
  if (!window.nostr) {
    throw new Error('Nostr extension not found');
  }

  const event = {
    kind: 22242, // NIP-42 auth event kind
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: challenge,
  };

  return await window.nostr.signEvent(event);
}
