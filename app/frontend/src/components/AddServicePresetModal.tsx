import { useMemo, useState, type ReactNode } from 'react';
import { Anchor, Badge, Box, Group, Modal, Paper, Stack, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { SERVICE_TYPE } from '../../../shared/serviceType';

type Preset = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  icon?: string;
  repo?: string;
};

type PresetGroup = {
  type: string;
  label: string;
  presets: Preset[];
};

const RELAY_PRESET_ORDER = ['stirfry', 'nostr-rs-relay', 'chapar'] as const;
const RELAY_PRESET_ORDER_MAP = new Map<string, number>(RELAY_PRESET_ORDER.map((id, idx) => [id, idx]));
const GROUP_ORDER = [SERVICE_TYPE.RELAY, SERVICE_TYPE.BLOSSOM, SERVICE_TYPE.NPANEL, SERVICE_TYPE.TOOLS] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  [SERVICE_TYPE.RELAY]: 'relays',
  [SERVICE_TYPE.BLOSSOM]: 'blossom',
  [SERVICE_TYPE.NPANEL]: 'npanel',
  [SERVICE_TYPE.TOOLS]: 'tools',
};

const sortPresetsInGroup = (type: string, presets: Preset[]): Preset[] => {
  if (type !== 'relay') {
    return [...presets].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...presets].sort((a, b) => {
    const aRank = RELAY_PRESET_ORDER_MAP.get(a.id);
    const bRank = RELAY_PRESET_ORDER_MAP.get(b.id);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
};

const groupPresetsByType = (presets: Preset[]): PresetGroup[] => {
  const byType = presets.reduce<Record<string, Preset[]>>((acc, preset) => {
    const type = String(preset.type || 'other');
    if (!acc[type]) acc[type] = [];
    acc[type].push(preset);
    return acc;
  }, {});
  const known = GROUP_ORDER.filter((type) => byType[type]?.length);
  const other = Object.keys(byType)
    .filter((type) => !(GROUP_ORDER as readonly string[]).includes(type))
    .sort();
  return [...known, ...other].map((type) => ({
    type,
    label: GROUP_LABEL[type as (typeof GROUP_ORDER)[number]] ?? type,
    presets: sortPresetsInGroup(type, byType[type]),
  }));
};

export const AddServicePresetModal = ({
  opened,
  presets,
  onClose,
  onSelectPreset,
  renderIcon,
}: {
  opened: boolean;
  presets: Preset[];
  onClose: () => void;
  onSelectPreset: (preset: Preset) => void;
  renderIcon: (icon: string | undefined, size: number) => ReactNode;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light');
  const serviceCardBg = colorScheme === 'dark' ? theme.colors.dark[5] : theme.white;
  const presetGroups = useMemo(() => groupPresetsByType(presets), [presets]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  return (
    <Modal opened={opened} onClose={onClose} title="add service" size="lg" centered>
      <Stack gap="md">
        {presetGroups.map((group) => (
          <Stack key={group.type} gap="xs">
            <Text size="xs" tt="uppercase" fw={500} c="dimmed">
              {group.label}
            </Text>
            {group.presets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
              <Paper
                key={preset.id}
                withBorder
                bg={isActive ? 'rgba(139, 92, 246, 0.14)' : serviceCardBg}
                p="sm"
                style={{
                  cursor: 'pointer',
                  borderColor: 'var(--mantine-color-dark-4)',
                  boxShadow: isActive ? '0 0 0 1px rgba(139, 92, 246, 0.45) inset' : undefined,
                  transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
                }}
                onClick={() => onSelectPreset(preset)}
                onMouseEnter={() => setActivePresetId(preset.id)}
                onMouseLeave={() => setActivePresetId((prev) => (prev === preset.id ? null : prev))}
                role="button"
                tabIndex={0}
                onFocus={() => setActivePresetId(preset.id)}
                onBlur={() => setActivePresetId((prev) => (prev === preset.id ? null : prev))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPreset(preset);
                  }
                }}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                  <Group wrap="nowrap" align="flex-start" gap="sm" style={{ flex: 1, minWidth: 0 }}>
                    <Box pt={2}>{renderIcon(preset.icon, 20)}</Box>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={500} size="sm">
                        {preset.name}
                      </Text>
                      {preset.description && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {preset.description}
                        </Text>
                      )}
                    </Box>
                  </Group>
                  <Group gap="xs" align="center" style={{ flexShrink: 0 }}>
                    <Badge
                      variant="light"
                      color="relaykit"
                      size="xs"
                      style={{
                        visibility: isActive ? 'visible' : 'hidden',
                        opacity: isActive ? 1 : 0,
                        transition: 'opacity 120ms ease',
                      }}
                    >
                      create
                    </Badge>
                    {preset.repo && (
                      <Anchor
                        href={preset.repo}
                        target="_blank"
                        size="xs"
                        onClick={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0 }}
                      >
                        repo ↗
                      </Anchor>
                    )}
                  </Group>
                </Group>
              </Paper>
              );
            })}
          </Stack>
        ))}
      </Stack>
    </Modal>
  );
};
