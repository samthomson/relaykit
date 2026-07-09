import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type NostrSigner, NostrEvent, NostrFilter, NPool, NRelay1 } from '@nostrify/nostrify';
import { NostrContext } from '@nostrify/react';
import { NUser, useNostrLogin } from '@nostrify/react/login';
import { useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

interface NostrProviderProps {
  children: React.ReactNode;
}

const NostrProvider: React.FC<NostrProviderProps> = (props) => {
  const { children } = props;
  const { config } = useAppContext();
  const { logins } = useNostrLogin();

  const queryClient = useQueryClient();

  // Use refs so the pool callbacks always see the latest data without
  // recreating the pool. The refs are written from effects (never during
  // render) to satisfy React's purity rules.
  const relayMetadataRef = useRef(config.relayMetadata);

  // Stable ref to the current user's signer for NIP-42 AUTH.
  // The `open()` callback reads from this ref when a relay sends an AUTH
  // challenge, so it always uses the latest signer without recreating the pool.
  const signerRef = useRef<NostrSigner | undefined>(undefined);

  // Lazily create the pool once, via useState's initializer. This keeps
  // the render body pure (no ref writes) while guaranteeing a single
  // NPool instance per provider. The initializer runs exactly once at
  // mount, so reading refs inside its closures is safe.
  // eslint-disable-next-line react-hooks/refs
  const [pool] = useState<NPool>(() => new NPool({
    open(url: string) {
      return new NRelay1(url, {
        // NIP-42: Respond to relay AUTH challenges by signing a kind
        // 22242 ephemeral event with the current user's signer.
        auth: async (challenge: string) => {
          const signer = signerRef.current;
          if (!signer) {
            throw new Error('AUTH failed: no signer available (user not logged in)');
          }
          return signer.signEvent({
            kind: 22242,
            content: '',
            tags: [
              ['relay', url],
              ['challenge', challenge],
            ],
            created_at: Math.floor(Date.now() / 1000),
          });
        },
      });
    },
    reqRouter(filters: NostrFilter[]) {
      const routes = new Map<string, NostrFilter[]>();

      // Route to all read relays
      const readRelays = relayMetadataRef.current.relays
        .filter(r => r.read)
        .map(r => r.url);

      for (const url of readRelays) {
        routes.set(url, filters);
      }

      return routes;
    },
    eventRouter(_event: NostrEvent) {
      // Get write relays from metadata
      const writeRelays = relayMetadataRef.current.relays
        .filter(r => r.write)
        .map(r => r.url);

      const allRelays = new Set<string>(writeRelays);

      return [...allRelays];
    },
    eoseTimeout: 200,
  }));

  // Derive the current signer from the active login. This mirrors the
  // logic in useCurrentUser but avoids a circular dependency (useCurrentUser
  // depends on NostrContext which we are providing here).
  const currentLogin = logins[0];
  const currentSigner = useMemo(() => {
    if (!currentLogin) return undefined;
    try {
      switch (currentLogin.type) {
        case 'nsec':
          return NUser.fromNsecLogin(currentLogin).signer;
        case 'bunker':
          return NUser.fromBunkerLogin(currentLogin, pool).signer;
        case 'extension':
          return NUser.fromExtensionLogin(currentLogin).signer;
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }, [currentLogin, pool]);

  // Keep the ref in sync so the AUTH callback always sees the latest signer.
  // Writing refs from an effect (not during render) satisfies purity rules.
  useEffect(() => {
    signerRef.current = currentSigner;
  }, [currentSigner]);

  // Invalidate Nostr queries when relay metadata changes.
  useEffect(() => {
    relayMetadataRef.current = config.relayMetadata;
    queryClient.invalidateQueries({ queryKey: ['nostr'] });
  }, [config.relayMetadata, queryClient]);

  const contextValue = useMemo(() => ({ nostr: pool }), [pool]);

  return (
    <NostrContext.Provider value={contextValue}>
      {children}
    </NostrContext.Provider>
  );
};

export default NostrProvider;
