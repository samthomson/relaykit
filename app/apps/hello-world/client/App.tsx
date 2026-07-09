import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { buildRelaykitTheme } from '@relaykit/ui'
import NostrProvider from '@/components/NostrProvider'
import { NostrSync } from '@/components/NostrSync'
import { NostrLoginProvider } from '@nostrify/react/login'
import { AppProvider } from '@/components/AppProvider'
import { AppConfig } from '@/contexts/AppContext'
import { APP_RELAYS } from '@/lib/appRelays'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { SchedulerShell } from '@/components/scheduler/SchedulerShell'

const theme = buildRelaykitTheme({ primaryColor: 'relaykit' })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: Infinity,
    },
  },
})

const defaultConfig: AppConfig = {
  theme: 'dark',
  relayMetadata: APP_RELAYS,
  blossomServerMetadata: {
    servers: ['https://blossom.primal.net/'],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
}

const loginStorageKey = 'nostr:login:hello-world'

const App = () => {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey={loginStorageKey}>
            <NostrProvider>
              <NostrSync />
              <Notifications position="top-right" />
              <Suspense>
                <SchedulerShell />
              </Suspense>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </MantineProvider>
  )
}

export default App
