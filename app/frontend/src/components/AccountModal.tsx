import { Modal, Stack, Paper, Group, Text, Button } from '@mantine/core'
import { useAuth } from '../contexts/AuthContext'
import { getIdentityKeys } from '../lib/identityKeys'

export const AccountModal = ({ opened, onClose }: { opened: boolean; onClose: () => void }) => {
  const { npub } = useAuth()
  const { hex, npub: encodedNpub } = getIdentityKeys(npub)

  return (
    <Modal opened={opened} onClose={onClose} title="identity" size="md" centered>
      <Stack gap="md">
        <Paper withBorder p="md">
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
      </Stack>
    </Modal>
  )
}
