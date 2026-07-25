import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { buildRelaykitTheme } from '@relaykit/ui'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { HubShell } from '@/components/HubShell'

const theme = buildRelaykitTheme({ primaryColor: 'relaykit' })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

const App = () => {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <Notifications position="top-right" />
        <HubShell />
      </QueryClientProvider>
    </MantineProvider>
  )
}

export default App
