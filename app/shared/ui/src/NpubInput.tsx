import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Avatar, Button, Pill, PillsInput } from '@mantine/core'
import { fetchNostrProfile, npubToHex, type NostrProfile } from './nostrProfile'

const shortNpub = (npub: string): string => `${npub.slice(0, 12)}…${npub.slice(-4)}`

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
      styles={{ input: { minHeight: 52, display: 'flex', alignItems: 'center' } }}
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
      <Pill.Group>
        {hex && (
          <Pill
            withRemoveButton
            radius={0}
            onRemove={() => onChange('')}
            styles={{ root: { height: 'auto', paddingTop: 4, paddingBottom: 4 }, label: { display: 'flex' } }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Avatar src={profile?.picture} size={26} radius={0} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                <span>{profile?.name ?? shortNpub(value.trim())}</span>
                {profile?.name && (
                  <span style={{ fontSize: 10, opacity: 0.65, fontFamily: 'monospace' }}>
                    {shortNpub(value.trim())}
                  </span>
                )}
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
          style={{ fontFamily: 'monospace' }}
        />
      </Pill.Group>
    </PillsInput>
  )
}
