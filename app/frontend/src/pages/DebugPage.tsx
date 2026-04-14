import { Stack, Paper, Group, Text, Button } from '@mantine/core'
import { useAuth } from '../contexts/AuthContext'
import { getIdentityKeys } from '../lib/identityKeys'

export const DebugPage = () => {
  const { npub, token } = useAuth()
  const { hex, npub: encodedNpub } = getIdentityKeys(npub)

  return (
    <Stack gap="xl" p="xl">
      <Paper withBorder p="md">
        <Text fw={500} mb="sm">identity</Text>
        <Stack gap="sm">
          {hex && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">hex</Text>
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(hex)}>copy</Button>
              </Group>
              <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {hex}
              </Text>
            </Stack>
          )}
          {encodedNpub && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">npub</Text>
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(encodedNpub)}>copy</Button>
              </Group>
              <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {encodedNpub}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={500}>dokploy key</Text>
            <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(token || '')}>copy</Button>
          </Group>
          <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
            {token || '—'}
          </Text>
        </Stack>
      </Paper>
    </Stack>
  )
}
