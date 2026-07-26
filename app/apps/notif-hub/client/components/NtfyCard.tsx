import { useState } from 'react'
import {
  Anchor,
  Button,
  Collapse,
  CopyButton,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveNtfy, testNtfy } from '@/lib/api'
import type { NtfyConfig } from '../../types'

const randomTopic = () => `pulse-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

/**
 * ntfy delivery: the phone runs the ntfy app instead of receiving web push, which is the only
 * route that works on android without google play services. The bundled server is preconfigured,
 * so the whole setup is: enable, put the generated topic into the ntfy app, save.
 */
export const NtfyCard = ({ ntfy }: { ntfy: NtfyConfig }) => {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(ntfy.enabled)
  const [server, setServer] = useState(ntfy.server)
  const [topic, setTopic] = useState(ntfy.topic)
  const [token, setToken] = useState(ntfy.token ?? '')
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
              delivery without google — install the ntfy app, subscribe it to the topic below, save
            </Text>
          </Stack>
          <Switch
            size="sm"
            checked={enabled}
            onChange={(e) => {
              const on = e.currentTarget.checked
              setEnabled(on)
              if (on && !topic) setTopic(randomTopic())
            }}
          />
        </Group>

        <Collapse in={enabled}>
          <Stack gap="sm">
            <TextInput
              size="xs"
              label="topic"
              description="the topic name is the secret — anyone who knows it can read your notifications"
              value={topic}
              onChange={(e) => setTopic(e.currentTarget.value)}
              styles={{ input: { fontFamily: 'monospace' } }}
              rightSectionWidth={60}
              rightSection={
                <CopyButton value={topic}>
                  {({ copied, copy }) => (
                    <Button size="compact-xs" variant="light" onClick={copy}>
                      {copied ? 'copied' : 'copy'}
                    </Button>
                  )}
                </CopyButton>
              }
            />

            <UnstyledButton onClick={() => setAdvancedOpen((o) => !o)} c="dimmed">
              <Group gap={4}>
                <Text size="xs">advanced</Text>
                <Text size="xs" style={{ transform: advancedOpen ? 'rotate(180deg)' : undefined }}>▾</Text>
              </Group>
            </UnstyledButton>
            <Collapse in={advancedOpen}>
              <Stack gap="xs">
                <TextInput
                  size="xs"
                  label="server"
                  description="prefilled with pulse's bundled ntfy server — change only to use another instance"
                  value={server}
                  onChange={(e) => setServer(e.currentTarget.value)}
                />
                <PasswordInput
                  size="xs"
                  label="access token"
                  description="only for protected topics on a self-hosted or paid server"
                  placeholder="tk_..."
                  value={token}
                  onChange={(e) => setToken(e.currentTarget.value)}
                />
                <Anchor size="xs" component="button" type="button" onClick={() => setTopic(randomTopic())}>
                  regenerate topic
                </Anchor>
              </Stack>
            </Collapse>
          </Stack>
        </Collapse>

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
