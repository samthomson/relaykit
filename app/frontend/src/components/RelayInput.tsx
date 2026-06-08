import { useEffect, useState, type ReactNode } from 'react';
import { ActionIcon, Group, TagsInput, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { trpc } from '../trpc';
import { isRelayType } from '../../../shared/serviceType';

// normalize a host/url to a ws(s) url
export const toWs = (url: string): string => {
  const u = url.trim();
  if (!u) return '';
  if (u.startsWith('ws://') || u.startsWith('wss://')) return u;
  if (u.startsWith('http://')) return 'ws://' + u.slice('http://'.length);
  if (u.startsWith('https://')) return 'wss://' + u.slice('https://'.length);
  return 'wss://' + u;
};

// relays the user has typed before, remembered across sessions
const RELAY_HISTORY_KEY = 'relaykit:relay-history';
const loadRelayHistory = (): string[] => {
  try {
    const r = JSON.parse(localStorage.getItem(RELAY_HISTORY_KEY) || '[]');
    return Array.isArray(r) ? r.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const rememberRelays = (relays: string[]): string[] => {
  const merged = [...new Set([...relays, ...loadRelayHistory()].map((r) => r.trim()).filter(Boolean))].slice(0, 30);
  localStorage.setItem(RELAY_HISTORY_KEY, JSON.stringify(merged));
  return merged;
};

type RelayInputProps = {
  label?: ReactNode;
  description?: string;
  placeholder?: string;
  value: string[];
  onChange: (relays: string[]) => void;
  // single relay (renders as one chip) vs many
  multiple?: boolean;
  required?: boolean;
};

// Shared relay picker: chips + free entry, a dropdown seeded with this instance's relays plus the
// user's remembered relays, and an × to forget a remembered one.
export const RelayInput = ({
  label,
  description,
  placeholder,
  value,
  onChange,
  multiple = true,
  required,
}: RelayInputProps) => {
  const [relayHistory, setRelayHistory] = useState<string[]>(loadRelayHistory);
  const [appRelays, setAppRelays] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    trpc.listServices
      .query()
      .then((services: any[]) => {
        if (cancelled) return;
        const urls = services
          .filter((s) => isRelayType(s.type))
          .map((s) => s.domains?.[0]?.host ?? s.hostname)
          .filter((h: string) => h && h !== 'No hostname configured')
          .map((h: string) => toWs(h));
        setAppRelays([...new Set(urls)]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const removeFromHistory = (relay: string) => {
    const next = loadRelayHistory().filter((r) => r !== relay);
    localStorage.setItem(RELAY_HISTORY_KEY, JSON.stringify(next));
    setRelayHistory(next);
  };

  return (
    <TagsInput
      label={label}
      description={description}
      placeholder={value.length ? '' : placeholder}
      required={required}
      value={value}
      data={[...new Set([...appRelays, ...relayHistory])]}
      maxTags={multiple ? undefined : 1}
      clearable
      splitChars={[',', ' ']}
      onChange={(vals) => {
        const cleaned = vals.map(toWs).filter(Boolean);
        onChange(cleaned);
        setRelayHistory(rememberRelays(cleaned));
      }}
      renderOption={({ option }) => (
        <Group justify="space-between" wrap="nowrap" w="100%" gap="xs">
          <Text size="sm" truncate>{option.value}</Text>
          {!appRelays.includes(option.value) && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="remove from history"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeFromHistory(option.value);
              }}
            >
              <IconX size={13} />
            </ActionIcon>
          )}
        </Group>
      )}
    />
  );
};
