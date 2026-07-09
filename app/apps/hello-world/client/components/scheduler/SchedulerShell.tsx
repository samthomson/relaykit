import { useState, useMemo } from 'react'
import { Badge, Box, Button, Flex, NavLink, Text, rem } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { parseParams, dedupeRelays } from '@/lib/queryParams'
import { listPosts, type ScheduledPost } from '@/lib/schedulerApi'
import { LoginModal } from './LoginModal'
import { ComposeView } from './ComposeView'
import { ScheduledView } from './ScheduledView'

const FALLBACK_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
]

const RELAY_OPTIONS_KEY = 'hw:relay-options'

type View = 'compose' | 'scheduled'

export const SchedulerShell = () => {
  const { user } = useCurrentUser()
  const params = useMemo(() => parseParams(), [])

  const [view, setView] = useState<View>('compose')
  const [loginOpen, setLoginOpen] = useState(false)
  const [relays, setRelays] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RELAY_OPTIONS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return params.relays.length > 0 ? params.relays : FALLBACK_RELAYS
  })
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null)

  const { data: posts } = useQuery({
    queryKey: ['scheduled-posts'],
    queryFn: ({ signal }) => listPosts(signal),
    refetchInterval: 15_000,
    enabled: !!user,
  })

  const pendingCount = posts?.filter((p) => p.status === 'pending').length ?? 0

  const addRelay = (url: string) => {
    setRelays((prev) => {
      const next = dedupeRelays([...prev, url])
      localStorage.setItem(RELAY_OPTIONS_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleEdit = (post: ScheduledPost) => {
    setEditingPost(post)
    setView('compose')
  }

  const handleClearEdit = () => {
    setEditingPost(null)
  }

  if (!user) {
    return (
      <Box
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--mantine-color-body)',
        }}
      >
        <Box ta="center">
          <Text size="xs" ff="monospace" c="dimmed" mb="md">
            hello world — post scheduler
          </Text>
          <Button size="sm" onClick={() => setLoginOpen(true)}>
            log in
          </Button>
        </Box>
        <LoginModal opened={loginOpen} onClose={() => setLoginOpen(false)} />
      </Box>
    )
  }

  return (
    <Box
      style={{
        height: '100vh',
        display: 'flex',
        background: 'var(--mantine-color-body)',
      }}
    >
      <Box
        w={180}
        py="xs"
        style={{
          borderRight: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <NavLink
          label={<Text size="xs" ff="monospace">post</Text>}
          active={view === 'compose'}
          onClick={() => setView('compose')}
          style={{ height: rem(36) }}
        />
        <NavLink
          label={
            <Flex align="center" gap={6}>
              <Text size="xs" ff="monospace">scheduled</Text>
              {pendingCount > 0 && (
                <Badge size="xs" radius={0} variant="filled">
                  {pendingCount}
                </Badge>
              )}
            </Flex>
          }
          active={view === 'scheduled'}
          onClick={() => setView('scheduled')}
          style={{ height: rem(36) }}
        />
      </Box>

      <Box style={{ flex: 1, overflow: 'auto' }} p="md">
        {view === 'compose' && (
          <ComposeView
            user={user}
            relays={relays}
            onAddRelay={addRelay}
            editingPost={editingPost}
            onClearEdit={handleClearEdit}
          />
        )}
        {view === 'scheduled' && (
          <ScheduledView onEdit={handleEdit} />
        )}
      </Box>
    </Box>
  )
}
