import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Avatar, Button, Pill, PillsInput } from '@mantine/core'
import { fetchNostrProfile, npubToHex, type NostrProfile } from './nostrProfile'

const ellipsis = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/**
 * npub input in the same pills style as the relay input: the set identity is a chip
 * (kind-0 avatar + name) inside the control, removable with ×. Typing or pasting a
 * valid npub replaces it; "mine" fills the caller's own npub (relaykit's authed user,
 * or the ?npub= hint an embedded app is launched with). One control, one size — it
 * never swaps into a different layout.
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

  const commit = (next: string) => {
    onChange(next)
    setDraft('')
  }

  const canFill = !!mine && value.trim() !== mine

  return (
    <PillsInput
      size={size}
      label={label}
      description={description}
      required={required}
      error={error}
      // Fixed height with room for the two-line identity chip, so the control
      // never resizes as the chip appears/disappears.
      styles={{ input: { minHeight: 52, display: 'flex', alignItems: 'center', padding: 8 } }}
      rightSectionWidth={canFill ? 64 : undefined}
      rightSection={
        canFill ? (
          <Button
            size="compact-xs"
            variant="light"
            // onMouseDown so the click beats the field's onBlur (blur clears the draft first)
            onMouseDown={(e) => {
              e.preventDefault()
              commit(mine!)
            }}
          >
            mine
          </Button>
        ) : null
      }
    >
      <Pill.Group style={{ width: '100%' }}>
        {hex && (
          <Pill
            withRemoveButton
            radius={0}
            onRemove={() => onChange('')}
            styles={{
              // flex: 1 fills the input's width instead of shrinking to content, so swapping
              // the npub for a (shorter) display name never changes the chip's size.
              root: { height: 'auto', paddingTop: 4, paddingBottom: 4, flex: 1, minWidth: 0 },
              label: { display: 'flex', minWidth: 0, width: '100%' },
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
              {/* Plain square while the picture loads/misses — no placeholder icon. */}
              {profile?.picture ? (
                <Avatar src={profile.picture} size={26} radius={0} style={{ flexShrink: 0 }} />
              ) : (
                <span style={{ width: 26, height: 26, flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }} />
              )}
              {/* Both lines always occupy space (npub line hidden until a name arrives),
                  so the chip doesn't grow when the profile loads. */}
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0, flex: 1 }}>
                <span style={ellipsis}>{profile?.name ?? value.trim()}</span>
                <span
                  style={{
                    ...ellipsis,
                    fontSize: 10,
                    opacity: 0.65,
                    fontFamily: 'monospace',
                    visibility: profile?.name ? 'visible' : 'hidden',
                  }}
                >
                  {value.trim()}
                </span>
              </span>
            </span>
          </Pill>
        )}
        <PillsInput.Field
          placeholder={hex ? '' : placeholder}
          value={draft}
          onChange={(e) => {
            const next = e.currentTarget.value
            setDraft(next)
            // The kept value is only replaced once the draft is a real npub.
            if (npubToHex(next)) commit(next)
          }}
          onBlur={() => setDraft('')}
          // Collapsed to nothing once the chip is showing — a bare <input> defaults to ~20ch
          // wide even with flex-basis auto, which was overflowing narrow (mobile) screens.
          // Editing then happens by removing the chip first, same as the relay input.
          style={
            hex
              ? { flex: '0 0 0', width: 0, minWidth: 0, padding: 0, border: 0 }
              : { fontFamily: 'monospace', flex: 1 }
          }
        />
      </Pill.Group>
    </PillsInput>
  )
}
