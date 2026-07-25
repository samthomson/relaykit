import { useMemo, useState } from 'react'
import { Box, NavLink, Text, rem } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { getConfig } from '@/lib/api'
import { parseParams } from '@/lib/queryParams'
import { NotificationsView } from './NotificationsView'
import { RulesView } from './RulesView'
import { DevicesView } from './DevicesView'
import { SettingsView } from './SettingsView'

type View = 'notifications' | 'rules' | 'devices' | 'settings'

export const HubShell = () => {
  const params = useMemo(() => parseParams(), [])
  const [view, setView] = useState<View | null>(null)

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => getConfig(signal),
  })

  if (!config) return null

  const configured = !!config.npub
  const activeView: View = view ?? (configured ? 'notifications' : 'settings')

  const navItems: Array<{ id: View; label: string }> = [
    { id: 'notifications', label: 'notifs' },
    { id: 'rules', label: 'rules' },
    { id: 'devices', label: 'devices' },
    { id: 'settings', label: 'settings' },
  ]

  return (
    <Box style={{ height: '100vh', display: 'flex', background: 'var(--mantine-color-body)' }}>
      <Box
        py="xs"
        style={{ borderRight: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        {/* the relaykit iframe header already names the app; only title standalone */}
        {!params.embedded && (
          <Text size="xs" ff="monospace" c="dimmed" px="sm" py={6}>
            notif hub
          </Text>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            label={<Text size="xs" ff="monospace">{item.label}</Text>}
            active={activeView === item.id}
            disabled={!configured && item.id !== 'settings'}
            onClick={() => setView(item.id)}
            px="sm"
            style={{ height: rem(36) }}
          />
        ))}
      </Box>

      <Box style={{ flex: 1, overflow: 'auto', minWidth: 0 }} p="md">
        {activeView === 'notifications' && <NotificationsView />}
        {activeView === 'rules' && <RulesView />}
        {activeView === 'devices' && <DevicesView vapidPublicKey={config.vapidPublicKey} />}
        {activeView === 'settings' && <SettingsView config={config} params={params} />}
      </Box>
    </Box>
  )
}
