import { useMemo, useState } from 'react'
import { Box, Divider, NavLink, Text, rem } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UnauthorizedError, getAuthState, getConfig } from '@/lib/api'
import { getToken } from '@/lib/auth'
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

  const navItems: Array<{ id: View; label: string }> = [
    { id: 'notifications', label: 'notifs' },
    { id: 'rules', label: 'rules' },
    { id: 'devices', label: 'devices' },
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
          style={{ borderRight: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              label={<Text size="xs" ff="monospace">{item.label}</Text>}
              active={activeView === item.id}
              onClick={() => setView(item.id)}
              px="sm"
              style={{ height: rem(36) }}
            />
          ))}
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
