import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { NostrLoginProvider } from '@nostrify/react/login';
import NostrProvider from '@/components/NostrProvider';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { AppConfig } from '@/contexts/AppContext';

interface TestAppProps {
  children: React.ReactNode;
}

export function TestApp({ children }: TestAppProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const defaultConfig: AppConfig = {
    theme: 'light',
    relayMetadata: {
      relays: [
        { url: 'wss://relay.primal.net', read: true, write: true },
      ],
      updatedAt: 0,
    },
  };

  return (
    <AppProvider storageKey='test-app-config' defaultConfig={defaultConfig}>
      <QueryClientProvider client={queryClient}>
        <NostrLoginProvider storageKey='test-login'>
          <NostrProvider>
            <NWCProvider>
              <BrowserRouter>
                {children}
              </BrowserRouter>
            </NWCProvider>
          </NostrProvider>
        </NostrLoginProvider>
      </QueryClientProvider>
    </AppProvider>
  );
}

export default TestApp;