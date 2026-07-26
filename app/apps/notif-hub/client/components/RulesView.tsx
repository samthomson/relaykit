import { useState } from 'react'
import { ActionIcon, Button, Divider, Group, Paper, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { addCustomRule, deleteRule, listRules, setRuleEnabled } from '@/lib/api'
import { LoadingState } from './LoadingState'
import type { NotificationRule, RuleType } from '../../types'

const RULE_LABELS: Partial<Record<RuleType, string>> = {
  dm: 'dm (nip-17)',
  'dm-legacy': 'dm (nip-04 legacy)',
}

const RULE_DESCRIPTIONS: Partial<Record<RuleType, string>> = {
  mention: 'someone mentioned you in a note',
  reply: 'someone replied in a thread involving you (kind-1 threads + nip-22 comments)',
  quote: 'someone quoted one of your notes',
  reaction: 'someone reacted to one of your notes',
  repost: 'someone reposted one of your notes',
  zap: 'someone zapped you',
  dm: 'you received a private message (nip-17 gift wrap, kind 1059)',
  'dm-legacy': 'you received a legacy encrypted dm (nip-04, kind 4)',
}

export const RulesView = () => {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [filterJson, setFilterJson] = useState('')

  const { data: rules } = useQuery({
    queryKey: ['rules'],
    queryFn: ({ signal }) => listRules(signal),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rules'] })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setRuleEnabled(id, enabled),
    onSuccess: invalidate,
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  const addMutation = useMutation({
    mutationFn: () => addCustomRule(label, JSON.parse(filterJson)),
    onSuccess: () => {
      setLabel('')
      setFilterJson('')
      invalidate()
    },
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: invalidate,
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  let filterValid = false
  try {
    const parsed = JSON.parse(filterJson)
    filterValid = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {}

  const presets = (rules ?? []).filter((r) => r.type !== 'custom' && r.type !== 'dm' && r.type !== 'dm-legacy')
  const dms = (rules ?? []).filter((r) => r.type === 'dm' || r.type === 'dm-legacy')
  const customs = (rules ?? []).filter((r) => r.type === 'custom')

  const presetRow = (rule: NotificationRule) => (
    <Group key={rule.id} justify="space-between" wrap="nowrap">
      <Stack gap={2}>
        <Text size="sm">{RULE_LABELS[rule.type] ?? rule.type}</Text>
        <Text size="xs" c="dimmed">{RULE_DESCRIPTIONS[rule.type]}</Text>
      </Stack>
      <Switch
        checked={rule.enabled}
        onChange={(e) => toggleMutation.mutate({ id: rule.id, enabled: e.currentTarget.checked })}
      />
    </Group>
  )

  if (!rules) {
    return (
      <Stack gap="md" maw={640}>
        <Text size="sm" fw={600}>rules</Text>
        <LoadingState />
      </Stack>
    )
  }

  return (
    <Stack gap="md" maw={640}>
      <Text size="sm" fw={600}>rules</Text>

      <Stack gap="xs">
        {presets.map((rule) => (
          <Paper key={rule.id} withBorder p="sm">
            {presetRow(rule)}
          </Paper>
        ))}
        {dms.length > 0 && (
          <Paper withBorder p="sm">
            <Stack gap="sm">
              {dms.map((rule, i) => (
                <Stack key={rule.id} gap="sm">
                  {i > 0 && <Divider />}
                  {presetRow(rule)}
                </Stack>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>

      <Text size="sm" fw={600} mt="sm">custom rules</Text>
      {customs.map((rule) => (
        <Paper key={rule.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm">{rule.label}</Text>
              <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {JSON.stringify(rule.filter)}
              </Text>
            </Stack>
            <Group gap="xs" style={{ flexShrink: 0 }}>
              <Switch
                checked={rule.enabled}
                onChange={(e) => toggleMutation.mutate({ id: rule.id, enabled: e.currentTarget.checked })}
              />
              <ActionIcon variant="subtle" color="red" onClick={() => deleteMutation.mutate(rule.id)} aria-label="delete rule">
                <Trash2 size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
      ))}

      <Paper withBorder p="sm">
        <Stack gap="xs">
          <TextInput
            size="xs"
            label="label"
            placeholder="e.g. posts by fiatjaf"
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
          />
          <Textarea
            size="xs"
            label="nostr filter (json)"
            placeholder='{"kinds": [1], "authors": ["<hex-pubkey>"]}'
            autosize
            minRows={2}
            value={filterJson}
            onChange={(e) => setFilterJson(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace' } }}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              disabled={!label.trim() || !filterValid}
              loading={addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              add custom rule
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  )
}
