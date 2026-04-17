import { useQuery } from '@tanstack/react-query';

interface BlossomServerInfo {
  supportsUpload: boolean;
  supportsList: boolean;
  supportsDelete: boolean;
  serverUrl: string;
}

/**
 * Hook to check Blossom server capabilities
 * Tests various endpoints to determine what the server supports
 */
export function useBlossomServer(serverUrl: string) {
  return useQuery({
    queryKey: ['blossom-server', serverUrl],
    queryFn: async (): Promise<BlossomServerInfo> => {
      // Normalize URL
      const url = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;

      console.log('useBlossomServer: Testing server', url);

      // Test HEAD /upload endpoint (BUD-06)
      let supportsUpload = false;
      try {
        const uploadResponse = await fetch(`${url}/upload`, {
          method: 'HEAD',
        });
        console.log('useBlossomServer: Upload endpoint status', uploadResponse.status);
        supportsUpload = uploadResponse.ok || uploadResponse.status === 401;
      } catch (error) {
        console.debug('Upload endpoint not available', error);
      }

      // Test GET /list endpoint availability
      // We can't test with a real pubkey without auth, but we can check if the endpoint exists
      let supportsList = false;
      try {
        const testPubkey = '0000000000000000000000000000000000000000000000000000000000000000';
        const listResponse = await fetch(`${url}/list/${testPubkey}`, {
          method: 'HEAD',
        });
        console.log('useBlossomServer: List endpoint status', listResponse.status);
        // If we get 401 or 404, the endpoint exists but requires auth or has no data
        supportsList = listResponse.status === 401 || listResponse.status === 404 || listResponse.ok;
      } catch (error) {
        console.debug('List endpoint not available', error);
      }

      // DELETE endpoint can only be tested by attempting a delete with auth
      // For now, we'll assume it's supported if upload is supported
      const supportsDelete = supportsUpload;

      console.log('useBlossomServer: Results', { supportsUpload, supportsList, supportsDelete });

      return {
        supportsUpload,
        supportsList,
        supportsDelete,
        serverUrl: url,
      };
    },
    enabled: !!serverUrl,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
