import { Anchor, Badge, Group, Paper, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { listNotifications } from '@/lib/api'

const formatTime = (iso: string): string => {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const NotificationsView = () => {
  const { data: entries } = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => listNotifications(signal),
    refetchInterval: 15_000,
  })

  return (
    <Stack gap="md" maw={640}>
      <Text size="sm" fw={600}>notifications</Text>

      {(entries ?? []).length === 0 && (
        <Text size="xs" c="dimmed" ff="monospace">
          nothing yet — matching nostr events will show up here and be pushed to your devices.
        </Text>
      )}

      {(entries ?? []).map((entry) => (
        <Paper key={entry.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Badge size="xs" variant="light">{entry.ruleType}</Badge>
                <Text size="xs" c="dimmed">{formatTime(entry.createdAt)}</Text>
              </Group>
              <Text size="sm" style={{ wordBreak: 'break-word' }}>{entry.body}</Text>
              {entry.url && (
                <Anchor href={entry.url} target="_blank" size="xs">
                  view event ↗
                </Anchor>
              )}
            </Stack>
            <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
              → {entry.pushed}
            </Text>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
