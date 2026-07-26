import { useState } from 'react'
import { Anchor, Button, Group, Paper, PasswordInput, Stack, Switch, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveNtfy, testNtfy } from '@/lib/api'
import type { NtfyConfig } from '../../types'

const randomTopic = () => `pulse-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

/**
 * ntfy delivery: the phone runs the ntfy app instead of receiving web push, which is the only
 * route that works on android without google play services.
 */
export const NtfyCard = ({ ntfy }: { ntfy: NtfyConfig }) => {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(ntfy.enabled)
  const [server, setServer] = useState(ntfy.server)
  const [topic, setTopic] = useState(ntfy.topic)
  const [token, setToken] = useState(ntfy.token ?? '')

  const dirty =
    enabled !== ntfy.enabled || server !== ntfy.server || topic !== ntfy.topic || token !== (ntfy.token ?? '')

  const saveMutation = useMutation({
    mutationFn: () => saveNtfy({ enabled, server, topic, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      notifications.show({ message: 'ntfy settings saved' })
    },
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  const testMutation = useMutation({
    mutationFn: testNtfy,
    onSuccess: ({ ok, error }) => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      notifications.show(
        ok
          ? { message: 'sent to your ntfy topic' }
          : { color: 'red', autoClose: false, message: error ?? 'ntfy publish failed' },
      )
    },
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" fw={500}>ntfy</Text>
            <Text size="xs" c="dimmed">
              delivery without google — pulse bundles its own ntfy server; install the ntfy app and subscribe it to this topic
            </Text>
          </Stack>
          <Switch size="sm" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} />
        </Group>

        <Group gap="xs" grow align="flex-start">
          <TextInput
            size="xs"
            label="server"
            placeholder="https://ntfy.sh"
            value={server}
            onChange={(e) => setServer(e.currentTarget.value)}
          />
          <TextInput
            size="xs"
            label="topic"
            placeholder="pick something unguessable"
            value={topic}
            onChange={(e) => setTopic(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace' } }}
          />
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            anyone who knows the topic on a public server can read your notifications.
          </Text>
          <Anchor size="xs" component="button" type="button" onClick={() => setTopic(randomTopic())}>
            generate one
          </Anchor>
        </Group>

        <PasswordInput
          size="xs"
          label="access token"
          description="only for protected topics on a self-hosted or paid server"
          placeholder="tk_..."
          value={token}
          onChange={(e) => setToken(e.currentTarget.value)}
        />

        {ntfy.lastError && (
          <Text size="xs" c="red" style={{ wordBreak: 'break-word' }}>
            last publish failed: {ntfy.lastError}
          </Text>
        )}

        <Group gap="xs">
          <Button size="xs" disabled={!dirty} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            save
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={!ntfy.enabled || dirty}
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            send test
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
