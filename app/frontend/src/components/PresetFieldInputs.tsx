import { useEffect, useMemo, useState } from 'react';
import { Button, Stack, Text, TextInput } from '@mantine/core';
import { nip19 } from 'nostr-tools';
import { RelayPillsInput, dedupeRelays } from '@relaykit/ui';
import { trpc } from '../trpc';
import { useAuth } from '../contexts/AuthContext';
import { useRefreshServices } from '../contexts/RefreshServicesContext';
import { isRelayType } from '../../../shared/serviceType';

/** Instance domain as configured at install time (RELAYKIT_HOST in .env). */
const useInstanceHost = () => {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    void trpc.getInstanceHost.query().then((r) => setHost(r.host));
  }, []);
  return host;
};

const toNpub = (value: string | null): string | null => {
  if (!value) return null;
  if (value.startsWith('npub1')) return value;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    try {
      return nip19.npubEncode(value.toLowerCase());
    } catch {
      return null;
    }
  }
  return null;
};

/** Domain input with a one-tap "use <sub>.<relaykit host>" prefill suggestion. */
export const DomainField = ({
  label,
  description,
  required,
  subdomain,
  value,
  onChange,
  error,
}: {
  label: string;
  description?: string;
  required?: boolean;
  subdomain?: string;
  value: string;
  onChange: (value: string) => void;
  error?: React.ReactNode;
}) => {
  const host = useInstanceHost();
  const suggestion = subdomain && host ? `${subdomain}.${host}` : null;
  return (
    <Stack gap={4}>
      <TextInput
        label={label}
        description={description}
        required={required}
        placeholder={suggestion ?? undefined}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        error={error}
        styles={{ input: { fontFamily: 'monospace' } }}
      />
      {suggestion && value !== suggestion && (
        <Button size="compact-xs" variant="subtle" px={0} style={{ alignSelf: 'flex-start' }} onClick={() => onChange(suggestion)}>
          use {suggestion}
        </Button>
      )}
    </Stack>
  );
};

/** npub input with a one-tap "use mine" fill from the authed relaykit identity. */
export const NpubField = ({
  label,
  description,
  required,
  value,
  onChange,
  error,
}: {
  label: string;
  description?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: React.ReactNode;
}) => {
  const { npub } = useAuth();
  const mine = toNpub(npub);
  return (
    <TextInput
      label={label}
      description={description}
      required={required}
      placeholder="npub1…"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      error={error}
      styles={{ input: { fontFamily: 'monospace' } }}
      rightSectionWidth={78}
      rightSection={
        mine && value !== mine ? (
          <Button size="compact-xs" variant="light" onClick={() => onChange(mine)}>
            use mine
          </Button>
        ) : null
      }
    />
  );
};

/** Relay list editor (pills + typeahead) storing its value as a comma-separated string. */
export const RelaysField = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (csv: string) => void;
}) => {
  const { services } = useRefreshServices();
  const knownRelays = useMemo(
    () =>
      dedupeRelays(
        (Array.isArray(services) ? services : [])
          .filter((service: any) => isRelayType(service?.type) && service?.domains?.[0]?.host)
          .map((service: any) => `wss://${service.domains[0].host}`),
      ),
    [services],
  );
  const relays = useMemo(() => dedupeRelays(value.split(',').map((r) => r.trim()).filter(Boolean)), [value]);
  return (
    <Stack gap={4}>
      <Stack gap={0}>
        <Text size="sm" fw={500}>{label}</Text>
        {description && <Text size="xs" c="dimmed">{description}</Text>}
      </Stack>
      <RelayPillsInput
        value={relays}
        onChange={(next: string[]) => onChange(next.join(','))}
        knownRelays={knownRelays}
        storageKey="rk:previous-relays"
      />
    </Stack>
  );
};
