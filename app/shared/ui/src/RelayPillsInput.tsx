import { useMemo, useState } from 'react'
import { Button, CloseButton, Combobox, Group, Pill, PillsInput, Stack, Text, rem, useCombobox } from '@mantine/core'
import { dedupeRelays } from './relays'

/** A labelled set of relays offered as one-click adds below the input (e.g. the user's own nip-65 list). */
export type RelaySuggestionGroup = { label: string; relays: string[] }

const MAX_PREVIOUS_RELAYS = 20

const loadPreviousRelays = (storageKey: string): string[] => {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed.filter((r) => typeof r === 'string')
    }
  } catch {}
  return []
}

/**
 * Multi-select relay picker: selected relays as removable pills, typeahead dropdown
 * seeded with relaykit's known relays plus previously used ones (persisted per app).
 * In prod all apps share the relaykit origin, so storageKey must be app-namespaced (e.g. 'nh:previous-relays').
 */
export const RelayPillsInput = ({
  value,
  onChange,
  knownRelays,
  storageKey,
  suggestions,
}: {
  value: string[]
  onChange: (relays: string[]) => void
  /** relays known to relaykit (deployed services), shown first in the dropdown */
  knownRelays: string[]
  /** app-namespaced localStorage key for remembering manually added relays */
  storageKey: string
  /** optional one-click adds rendered below the input; nothing is ever added implicitly */
  suggestions?: RelaySuggestionGroup[]
}) => {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })
  const [draft, setDraft] = useState('')
  const [previousRelays, setPreviousRelays] = useState<string[]>(() => loadPreviousRelays(storageKey))

  const persistPrevious = (next: string[]) => {
    setPreviousRelays(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {}
  }

  const addRelay = (url: string, { remember = false }: { remember?: boolean } = {}) => {
    const [normalized] = dedupeRelays([url])
    if (!normalized) return
    if (remember && !knownRelays.includes(normalized)) {
      persistPrevious([normalized, ...previousRelays.filter((r) => r !== normalized)].slice(0, MAX_PREVIOUS_RELAYS))
    }
    if (!value.includes(normalized)) onChange([...value, normalized])
    setDraft('')
  }

  const removeRelay = (url: string) => {
    onChange(value.filter((r) => r !== url))
  }

  const forgetPreviousRelay = (url: string) => {
    persistPrevious(previousRelays.filter((r) => r !== url))
  }

  const options = useMemo(() => {
    const query = draft.trim().toLowerCase()
    const known = knownRelays
      .filter((relay) => !value.includes(relay))
      .filter((relay) => !query || relay.toLowerCase().includes(query))
      .map((relay) => ({ value: relay, source: 'service' as const }))
    const previous = previousRelays
      .filter((relay) => !knownRelays.includes(relay) && !value.includes(relay))
      .filter((relay) => !query || relay.toLowerCase().includes(query))
      .map((relay) => ({ value: relay, source: 'previous' as const }))
    return [...known, ...previous]
  }, [knownRelays, previousRelays, value, draft])

  const suggestionGroups = useMemo(
    () =>
      (suggestions ?? [])
        .map((group) => ({ label: group.label, relays: dedupeRelays(group.relays).filter((r) => !value.includes(r)) }))
        .filter((group) => group.relays.length > 0),
    [suggestions, value],
  )

  const input = (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(url) => {
        addRelay(url)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <PillsInput
          size="xs"
          onClick={() => {
            combobox.openDropdown()
            combobox.resetSelectedOption()
          }}
        >
          <Pill.Group>
            {value.map((relay) => (
              <Pill
                key={relay}
                size="xs"
                color="relaykit"
                variant="light"
                withRemoveButton
                onRemove={() => removeRelay(relay)}
                title={relay}
              >
                {relay.replace(/^wss:\/\//, '')}
              </Pill>
            ))}
            <PillsInput.Field
              aria-label="relay url"
              value={draft}
              onChange={(e) => {
                setDraft(e.currentTarget.value)
                combobox.openDropdown()
                combobox.resetSelectedOption()
              }}
              onFocus={() => {
                combobox.openDropdown()
                combobox.resetSelectedOption()
              }}
              onBlur={() => {
                if (draft.trim()) addRelay(draft, { remember: true })
                combobox.closeDropdown()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (!combobox.dropdownOpened || options.length === 0)) {
                  e.preventDefault()
                  addRelay(draft, { remember: true })
                }
                if ((e.key === 'Backspace' || e.key === 'Delete') && draft.length === 0 && value.length > 0) {
                  e.preventDefault()
                  removeRelay(value[value.length - 1])
                }
              }}
              placeholder={value.length === 0 ? 'wss://relay.example.com' : 'add relay...'}
              style={{ flex: 1, minWidth: rem(140), fontFamily: 'monospace' }}
            />
          </Pill.Group>
        </PillsInput>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={280} style={{ overflowY: 'auto' }}>
          {options.length > 0 ? (
            options.map((option) => (
              <Combobox.Option key={`${option.source}-${option.value}`} value={option.value}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="xs" ff="monospace" c={option.source === 'service' ? 'relaykit' : 'dimmed'} truncate>
                    {option.value}
                  </Text>
                  {option.source === 'previous' && (
                    <CloseButton
                      size="xs"
                      aria-label="forget relay"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        forgetPreviousRelay(option.value)
                      }}
                    />
                  )}
                </Group>
              </Combobox.Option>
            ))
          ) : (
            <Combobox.Empty>no relay matches — press enter to add</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )

  if (suggestionGroups.length === 0) return input

  return (
    <Stack gap={6}>
      {input}
      {suggestionGroups.map((group) => (
        <Group key={group.label} gap={6} align="center">
          <Text size="xs" c="dimmed">{group.label}</Text>
          {group.relays.map((relay) => (
            <Button
              key={relay}
              size="compact-xs"
              variant="default"
              onClick={() => addRelay(relay)}
              styles={{ label: { fontFamily: 'monospace', fontSize: rem(10) } }}
            >
              + {relay.replace(/^wss:\/\//, '')}
            </Button>
          ))}
        </Group>
      ))}
    </Stack>
  )
}
