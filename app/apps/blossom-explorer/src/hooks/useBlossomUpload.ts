import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';
import { BlobDescriptor } from './useBlossomList';

/**
 * Hook to upload files to a Blossom server
 * Requires user authentication
 */
export function useBlossomUpload(serverUrl: string) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<BlobDescriptor> => {
      if (!user) {
        throw new Error('User must be logged in to upload files');
      }

      // Normalize URL
      const url = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;

      // Read file as array buffer and calculate SHA-256 hash
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Create authorization event (BUD-02)
      const authEvent = await nostr.event({
        kind: 24242,
        content: `Upload ${file.name}`,
        tags: [
          ['t', 'upload'],
          ['x', sha256],
          ['expiration', Math.floor(Date.now() / 1000 + 60).toString()], // 1 minute expiration
        ],
      });

      // Base64 encode the event
      const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

      // Upload the file
      const response = await fetch(`${url}/upload`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
      }

      const blobDescriptor: BlobDescriptor = await response.json();
      return blobDescriptor;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate the blob list query to refresh the list
      if (user) {
        queryClient.invalidateQueries({
          queryKey: ['blossom-list', serverUrl, user.pubkey],
        });
      }
    },
  });
}
