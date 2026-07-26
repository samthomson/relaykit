import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Avatar, Button, Group, Input, Paper, Text, TextInput } from '@mantine/core'
import { fetchNostrProfile, npubToHex, type NostrProfile } from './nostrProfile'

const shortNpub = (npub: string): string => `${npub.slice(0, 12)}…${npub.slice(-4)}`

/**
 * npub input with a one-tap "mine" fill. `mine` is the caller's own npub —
 * relaykit's authed user, or the ?npub= hint an embedded app is launched with.
 * Once a valid npub is set it collapses to an identity chip (kind-0 avatar + name).
 * "change" edits into a local draft; the set value is only replaced by a valid npub,
 * so backing out (blur) always returns to the existing identity.
 */
export const NpubInput = ({
  label,
  description,
  placeholder = 'npub1...',
  required,
  size = 'sm',
  value,
  onChange,
  mine,
  error,
}: {
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  size?: string
  value: string
  onChange: (value: string) => void
  /** own npub (bech32) offered as a one-tap fill; omit to hide the button */
  mine?: string | null
  error?: ReactNode
}) => {
  const hex = npubToHex(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [profile, setProfile] = useState<NostrProfile | null>(null)

  useEffect(() => {
    setProfile(null)
    if (!hex) return
    let cancelled = false
    fetchNostrProfile(hex).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [hex])

  // Same height as the size-sm input below, so swapping between them doesn't shift the layout.
  const CONTROL_H = 36

  if (hex && !editing) {
    return (
      <Input.Wrapper label={label} description={description} required={required} error={error} size={size}>
        <Paper withBorder px={8} h={CONTROL_H} mt={4} style={{ display: 'flex', alignItems: 'center' }}>
          <Group justify="space-between" wrap="nowrap" gap="xs" w="100%">
            <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar src={profile?.picture} size={22} radius={0} />
              <Text size="sm" truncate>
                {profile?.name ?? shortNpub(value.trim())}
              </Text>
              {profile?.name && (
                <Text size="xs" c="dimmed" ff="monospace" truncate>
                  {shortNpub(value.trim())}
                </Text>
              )}
            </Group>
            <Button
              size="compact-xs"
              variant="light"
              style={{ flexShrink: 0 }}
              onClick={() => {
                setDraft('')
                setEditing(true)
              }}
            >
              change
            </Button>
          </Group>
        </Paper>
      </Input.Wrapper>
    )
  }

  const inputValue = editing ? draft : value
  const canFill = !!mine && inputValue.trim() !== mine

  const commit = (next: string) => {
    onChange(next)
    setEditing(false)
  }

  const handleChange = (next: string) => {
    if (editing) {
      setDraft(next)
      // The kept value is only replaced once the draft is a real npub.
      if (npubToHex(next)) commit(next)
    } else {
      onChange(next)
    }
  }

  return (
    <TextInput
      size={size}
      label={label}
      description={description}
      placeholder={placeholder}
      required={required}
      value={inputValue}
      autoFocus={editing}
      onChange={(e) => handleChange(e.currentTarget.value)}
      onBlur={() => setEditing(false)}
      error={error}
      styles={{ input: { fontFamily: 'monospace', height: CONTROL_H, paddingRight: canFill ? 68 : undefined } }}
      rightSectionWidth={canFill ? 64 : undefined}
      rightSection={
        canFill ? (
          <Button
            size="compact-xs"
            variant="light"
            // onMouseDown so the click beats the input's onBlur (blur would drop the edit first)
            onMouseDown={(e) => {
              e.preventDefault()
              commit(mine!)
            }}
          >
            mine
          </Button>
        ) : null
      }
    />
  )
}
