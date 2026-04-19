import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostr } from '@nostrify/react';

export interface BlobDescriptor {
  url?: string;
  sha256: string;
  size?: number;
  type?: string;
  uploaded?: number;
}

/**
 * Hook to list blobs from a Blossom server
 * Requires user authentication
 */
export function useBlossomList(serverUrl: string, pubkey: string) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['blossom-list', serverUrl, pubkey],
    queryFn: async (): Promise<BlobDescriptor[]> => {
      if (!pubkey) {
        console.log('useBlossomList: No pubkey provided');
        return [];
      }

      // Normalize URL
      const url = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;

      console.log('useBlossomList: Fetching from', `${url}/list/${pubkey}`);

      try {
        // First try without authentication (some servers allow it)
        console.log('useBlossomList: Trying without auth...');
        let response = await fetch(`${url}/list/${pubkey}`, {
          method: 'GET',
        });

        console.log('useBlossomList: Response status (no auth)', response.status);

        // If 401, try with authentication
        if (response.status === 401) {
          console.log('useBlossomList: 401 received, trying with auth...');
          console.log('useBlossomList: Creating auth event...');
          
          // Create authorization event (BUD-02) with timeout
          const authEvent = await Promise.race([
            nostr.event({
              kind: 24242,
              content: 'List Blobs',
              tags: [
                ['t', 'list'],
                ['expiration', Math.floor(Date.now() / 1000 + 60).toString()], // 1 minute expiration
              ],
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Auth event creation timed out after 30s. Please check your Nostr signer extension.')), 30000)
            )
          ]) as Awaited<ReturnType<typeof nostr.event>>;

          console.log('useBlossomList: Auth event created', authEvent);

          // Base64 encode the event
          const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

          // Retry with auth
          response = await fetch(`${url}/list/${pubkey}`, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
            },
          });

          console.log('useBlossomList: Response status (with auth)', response.status);
        }

        if (!response.ok) {
          if (response.status === 404) {
            // No blobs found, return empty array
            console.log('useBlossomList: 404 - No blobs found');
            return [];
          }
          const errorText = await response.text();
          console.error('useBlossomList: Error response', errorText);
          throw new Error(`Failed to fetch blobs: ${response.statusText} - ${errorText}`);
        }

        const blobs: BlobDescriptor[] = await response.json();
        
        // Fix HTTP URLs to HTTPS if server is accessed via HTTPS
        const fixedBlobs = blobs.map(blob => {
          if (blob.url && blob.url.startsWith('http://') && serverUrl.startsWith('https://')) {
            return {
              ...blob,
              url: blob.url.replace('http://', 'https://')
            };
          }
          return blob;
        });
        
        console.log('useBlossomList: Retrieved blobs', fixedBlobs.length, fixedBlobs);
        return fixedBlobs;
      } catch (error) {
        console.error('useBlossomList: Error in queryFn', error);
        throw error;
      }
    },
    enabled: !!serverUrl && !!pubkey,
    staleTime: 30 * 1000, // 30 seconds
    retry: 1,
  });
}
