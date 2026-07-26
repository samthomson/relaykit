import { useMemo } from 'react'
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nip19 } from 'nostr-tools'
import { DropdownButton } from '@relaykit/ui'
import { listNotifications, markAllSeen, markSeen } from '@/lib/api'
import { LoadingState } from './LoadingState'
import { LINK_CLIENTS, type LinkClient } from '../../types'

const formatTime = (iso: string): string => {
  const date = new Date(iso)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Opens in the configured default client on click; the caret offers the rest as one-offs
 * without changing the setting. Opening from any client marks the entry seen.
 */
const OpenEventLink = ({
  eventId,
  defaultClient,
  onOpen,
}: {
  eventId: string
  defaultClient: LinkClient
  onOpen: () => void
}) => {
  const nevent = useMemo(() => nip19.neventEncode({ id: eventId }), [eventId])
  const others = (Object.keys(LINK_CLIENTS) as LinkClient[]).filter((c) => c !== defaultClient)
  return (
    <DropdownButton
      size="compact-xs"
      variant="light"
      position="bottom-start"
      menuWidth={220}
      primaryHref={LINK_CLIENTS[defaultClient].eventUrl(nevent)}
      onPrimaryClick={onOpen}
      items={others.map((client) => ({
        id: client,
        label: LINK_CLIENTS[client].label,
        href: LINK_CLIENTS[client].eventUrl(nevent),
        onSelect: onOpen,
      }))}
    >
      open in {LINK_CLIENTS[defaultClient].label.split(' ')[0]}
    </DropdownButton>
  )
}

export const NotificationsView = ({ defaultClient }: { defaultClient: LinkClient }) => {
  const queryClient = useQueryClient()
  const { data: entries } = useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => listNotifications(signal),
    refetchInterval: 15_000,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const { mutate: seen } = useMutation({ mutationFn: markSeen, onSettled: invalidate })
  const { mutate: seenAll, isPending: markingAll } = useMutation({ mutationFn: markAllSeen, onSettled: invalidate })

  const unseen = entries?.filter((e) => !e.seenAt).length ?? 0

  return (
    <Stack gap="md" maw={640}>
      <Group justify="space-between">
        <Text size="sm" fw={600}>notifications</Text>
        {unseen > 0 && (
          <Button size="compact-xs" variant="light" loading={markingAll} onClick={() => seenAll()}>
            mark all seen ({unseen})
          </Button>
        )}
      </Group>

      {!entries ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <Text size="xs" c="dimmed" ff="monospace">
          nothing yet — matching nostr events will show up here and be pushed to your devices.
        </Text>
      ) : (
        entries.map((entry) => (
          <Paper
            key={entry.id}
            withBorder
            p="sm"
            style={
              entry.seenAt
                ? undefined
                : { background: 'var(--mantine-color-dark-5)' }
            }
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Group gap="xs">
                  <Badge size="xs" variant={entry.seenAt ? 'default' : 'light'}>{entry.ruleType}</Badge>
                  <Text size="xs" c="dimmed">{formatTime(entry.createdAt)}</Text>
                  {!entry.seenAt && (
                    <Badge size="xs" variant="filled" radius="sm">new</Badge>
                  )}
                </Group>
                <Text size="sm" c={entry.seenAt ? 'dimmed' : undefined} style={{ wordBreak: 'break-word' }}>
                  {entry.body}
                </Text>
                {entry.eventId && (
                  <OpenEventLink
                    eventId={entry.eventId}
                    defaultClient={defaultClient}
                    onOpen={() => { if (!entry.seenAt) seen(entry.id) }}
                  />
                )}
              </Stack>
              <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>
                → {entry.pushed}
              </Text>
            </Group>
          </Paper>
        ))
      )}
    </Stack>
  )
}
