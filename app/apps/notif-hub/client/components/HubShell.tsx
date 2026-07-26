import { useMemo, useState } from 'react'
import { Box, Divider, NavLink, Text, rem } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UnauthorizedError, getAuthState, getConfig, listDevices } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { parseParams } from '@/lib/queryParams'
import { BrandHeader } from './BrandHeader'
import { NotificationsView } from './NotificationsView'
import { RulesView } from './RulesView'
import { DevicesView } from './DevicesView'
import { SettingsView } from './SettingsView'
import { SignInGate } from './SignInGate'

type View = 'notifications' | 'rules' | 'devices' | 'settings'

export const HubShell = () => {
  const params = useMemo(() => parseParams(), [])
  const queryClient = useQueryClient()
  const [view, setView] = useState<View | null>(null)
  // Held in state, not read from storage on the fly, so signing in re-renders straight into the app.
  const [token, setToken] = useState(getToken())

  const { data: authState } = useQuery({
    queryKey: ['auth-state'],
    queryFn: ({ signal }) => getAuthState(signal),
  })

  const { data: config, error: configError } = useQuery({
    queryKey: ['config'],
    enabled: !!token,
    queryFn: ({ signal }) => getConfig(signal),
    retry: false,
  })

  // Same query key DevicesView uses, so this just reads the shared cache — no extra fetch.
  const { data: devices } = useQuery({
    queryKey: ['devices'],
    enabled: !!token,
    queryFn: ({ signal }) => listDevices(signal),
  })

  if (!authState) return null

  if (!token || configError instanceof UnauthorizedError) {
    return (
      <SignInGate
        unclaimed={authState.unclaimed}
        onSignedIn={() => {
          setToken(getToken())
          void queryClient.invalidateQueries()
        }}
      />
    )
  }

  if (!config) return null

  const activeView: View = view ?? (config.npub ? 'notifications' : 'settings')

  const navItems: Array<{ id: View; label: string; count?: number }> = [
    { id: 'notifications', label: 'notifs' },
    { id: 'rules', label: 'rules' },
    { id: 'devices', label: 'devices', count: devices?.length },
    { id: 'settings', label: 'settings' },
  ]

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-body)' }}>
      {/* relaykit's iframe header already brands the app; standalone we draw our own */}
      {!params.embedded && (
        <>
          <Box px="md" py="xs" style={{ flexShrink: 0 }}>
            <BrandHeader />
          </Box>
          <Divider />
        </>
      )}

      <Box style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box
          py="xs"
          style={{
            borderRight: '1px solid var(--mantine-color-default-border)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              label={<Text size="xs" ff="monospace">{item.label}</Text>}
              rightSection={
                item.count ? <Text size="xs" c="dimmed" ff="monospace">{item.count}</Text> : undefined
              }
              active={activeView === item.id}
              onClick={() => setView(item.id)}
              px="sm"
              style={{ height: rem(36) }}
            />
          ))}
          <Box style={{ flex: 1 }} />
          <Divider />
          <NavLink
            label={<Text size="xs" ff="monospace" c="dimmed">log out</Text>}
            onClick={() => {
              clearToken()
              setToken(null)
              queryClient.clear()
            }}
            px="sm"
            style={{ height: rem(36) }}
          />
        </Box>

        <Box style={{ flex: 1, overflow: 'auto', minWidth: 0 }} p="md">
          {activeView === 'notifications' && <NotificationsView defaultClient={config.linkClient} />}
          {activeView === 'rules' && <RulesView />}
          {activeView === 'devices' && <DevicesView vapidPublicKey={config.vapidPublicKey} ntfy={config.ntfy} />}
          {activeView === 'settings' && <SettingsView config={config} params={params} />}
        </Box>
      </Box>
    </Box>
  )
}
