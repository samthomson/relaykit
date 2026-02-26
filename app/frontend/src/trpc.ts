import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../backend/src/trpc';

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      headers() {
        const token = localStorage.getItem('relaykit_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

