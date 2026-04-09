import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  getNsiteDefaultRelayEnv,
  mergeNsiteRelayDefaults,
  NSITE_RELAY_ENV_KEYS,
  tryBuildNsitePublicHostname,
  previewNsiteRouterHost,
  parsePubkeyHex as toPubkeyHex,
  fetchNsiteRelayEnvFromProfile,
  fetchNsite35128Dtags,
} from '../../../shared/nsite';
import { UrlListCsvEditor } from './UrlListCsvEditor';
import { Select, TextInput, Stack, Text, Paper, Group, Button } from '@mantine/core';

type ProfileStatus = 'idle' | 'loading' | 'ok' | 'error' | 'skipped';

/** Initialise deploy config defaults for an nsite preset. */
export const buildNsiteDeployDefaults = (preset: any, ownerPubkeyHex: string | null): Record<string, string> => {
  const defaults: Record<string, string> = {};
  preset.requiredConfig.forEach((field: any) => {
    if (field.default) defaults[field.id] = field.default;
  });
  Object.assign(defaults, getNsiteDefaultRelayEnv());
  if (ownerPubkeyHex) defaults.NSITE_SITE_NPUB = ownerPubkeyHex;
  return defaults;
};

/** Merge relay defaults before sending to backend (fills blank relay fields). */
export const prepareNsiteConfigForSave = (config: Record<string, string>): Record<string, string> =>
  mergeNsiteRelayDefaults(config);

/**
 * Nsite-specific fields for the deploy or edit-config modal.
 * Encapsulates profile fetching, hostname preview, d-tag discovery, and relay URL editors.
 */
export const NsiteDeployFields = ({
  preset,
  config,
  setConfig,
  ownerPubkeyHex,
  autoFetchProfile = false,
}: {
  preset: any;
  config: Record<string, string>;
  setConfig: (c: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void;
  ownerPubkeyHex: string | null;
  autoFetchProfile?: boolean;
}) => {
  const relayKeySet = new Set<string>(NSITE_RELAY_ENV_KEYS);
  const primaryFields = preset.requiredConfig.filter((f: { id: string }) => !relayKeySet.has(f.id));
  const advancedFields = preset.requiredConfig.filter((f: { id: string }) => relayKeySet.has(f.id));
  const siteDField = preset.requiredConfig.find((f: { id: string }) => f.id === 'NSITE_SITE_D');

  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileMeta, setProfileMeta] = useState<{
    foundKind10002: boolean;
    foundKind10063: boolean;
    userRelayUrlCount: number;
    userBlossomUrlCount: number;
  } | null>(null);
  const [dDiscoverLoading, setDDiscoverLoading] = useState(false);
  const [dDiscovered, setDDiscovered] = useState<string[]>([]);

  const fetchProfile = useCallback(
    (opts?: { silent?: boolean; configSnapshot?: Record<string, string> }) => {
      const snap = opts?.configSnapshot;
      const siteField = (snap !== undefined ? snap.NSITE_SITE_NPUB : config.NSITE_SITE_NPUB ?? '').toString().trim();
      const raw = siteField || (ownerPubkeyHex ?? '').trim();
      const hex = toPubkeyHex(raw);
      if (!hex) {
        setProfileMeta(null);
        setProfileStatus('skipped');
        return;
      }
      setProfileStatus('loading');
      setProfileMeta(null);
      fetchNsiteRelayEnvFromProfile(hex)
        .then(({ env, meta }) => {
          setConfig((prev) => ({ ...prev, ...env }));
          setProfileMeta(meta);
          setProfileStatus('ok');
          if (!opts?.silent) {
            const got = meta.foundKind10002 || meta.foundKind10063;
            toast.success(
              got
                ? 'Merged site pubkey kind 10002 / 10063 with defaults'
                : 'No kind 10002/10063 on queried relays — using defaults only',
            );
          }
        })
        .catch(() => {
          setProfileMeta(null);
          setProfileStatus('error');
          if (!opts?.silent) toast.error('Could not load Nostr lists for this site pubkey');
        });
    },
    [ownerPubkeyHex, config.NSITE_SITE_NPUB, setConfig],
  );

  useEffect(() => {
    if (autoFetchProfile) fetchProfile({ silent: true, configSnapshot: config });
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hostnamePreview = useMemo(
    () =>
      tryBuildNsitePublicHostname({
        parentDomain: config.NSITE_PARENT_DOMAIN ?? '',
        siteNpub: config.NSITE_SITE_NPUB ?? '',
        siteD: config.NSITE_SITE_D,
      }),
    [config.NSITE_PARENT_DOMAIN, config.NSITE_SITE_NPUB, config.NSITE_SITE_D],
  );

  const runDiscover35128 = () => {
    const hex = toPubkeyHex((config.NSITE_SITE_NPUB ?? '').trim());
    if (!hex) {
      toast.error('Enter a valid publishing key first.');
      return;
    }
    const merged = mergeNsiteRelayDefaults(config);
    const relayCsv = `${merged.NOSTR_RELAYS},${merged.LOOKUP_RELAYS}`;
    setDDiscoverLoading(true);
    fetchNsite35128Dtags(hex, relayCsv)
      .then((tags) => {
        setDDiscovered(tags);
        if (tags.length === 0) toast('No kind 35128 found for this pubkey on the queried relays.');
        else toast.success(`Found ${tags.length} site id(s).`);
      })
      .catch(() => toast.error('Could not query relays for kind 35128.'))
      .finally(() => setDDiscoverLoading(false));
  };

  const renderField = (field: any) => (
    <div key={field.id} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
      <TextInput
        label={field.name}
        description={field.description}
        required={field.required}
        value={config[field.id] ?? field.default ?? ''}
        onChange={(e) => setConfig((c) => ({ ...c, [field.id]: (e.target as HTMLInputElement).value }))}
      />
    </div>
  );

  const renderUrlListField = (field: any) => (
    <UrlListCsvEditor
      key={field.id}
      label={field.name}
      description={field.description}
      value={config[field.id] ?? ''}
      onChange={(csv) => setConfig((c) => ({ ...c, [field.id]: csv }))}
      addPlaceholder={
        field.id === 'BLOSSOM_SERVERS'
          ? 'https://… — Enter (paste comma-separated for several)'
          : 'wss://… — Enter (paste comma-separated for several)'
      }
    />
  );

  return (
    <Stack gap="md">
      {profileStatus !== 'idle' && (
        <Paper withBorder p="md">
          {profileStatus === 'loading' && (
            <Text size="sm" c="dimmed">Loading this site pubkey&apos;s kind 10002 (relays) and 10063 (Blossom)…</Text>
          )}
          {profileStatus === 'ok' && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {profileMeta && !profileMeta.foundKind10002 && !profileMeta.foundKind10063 ? (
                  <>
                    No kind <Text component="span" fw={700}>10002</Text> or{' '}
                    <Text component="span" fw={700}>10063</Text> found for your pubkey on the relays we
                    queried. Advanced fields show <Text component="span" fw={700}>RelayKit defaults only</Text>.
                    Publish NIP-65 / Blossom lists for that site pubkey, or tap refresh after they land on
                    relays.
                  </>
                ) : profileMeta &&
                  (profileMeta.foundKind10002 || profileMeta.foundKind10063) ? (
                  <>
                    {profileMeta.foundKind10002 && (
                      <>Merged <Text component="span" fw={700}>{profileMeta.userRelayUrlCount}</Text> relay URL(s) from kind 10002.</>
                    )}
                    {profileMeta.foundKind10002 && profileMeta.foundKind10063 ? ' ' : ''}
                    {profileMeta.foundKind10063 && (
                      <>Merged <Text component="span" fw={700}>{profileMeta.userBlossomUrlCount}</Text> Blossom base URL(s) from kind 10063.</>
                    )}{' '}
                    Default relays stay appended for discovery.
                  </>
                ) : (
                  <>Done loading profile hints.</>
                )}
              </Text>
              <Button size="xs" variant="outline" onClick={() => fetchProfile({ configSnapshot: config })}>
                Refresh from profile
              </Button>
            </Stack>
          )}
          {profileStatus === 'error' && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">Could not load profile events for this site pubkey from the network. Defaults remain in Advanced — you can edit there.</Text>
              <Button size="xs" variant="outline" color="relay-orange" onClick={() => fetchProfile({ configSnapshot: config })}>
                Retry
              </Button>
            </Stack>
          )}
          {profileStatus === 'skipped' && (
            <Text size="sm" c="dimmed">
              Enter a valid <Text component="span" fw={700}>Publishing key</Text> (or sign in with a key we can fall
              back to); then use Refresh, or set relay URLs manually in Advanced.
            </Text>
          )}
        </Paper>
      )}

      {primaryFields
        .filter((f: { id: string }) => f.id !== 'NSITE_SITE_D')
        .map(renderField)}

      {hostnamePreview && (
        <Paper withBorder p="md">
          {hostnamePreview.ok ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="sm" fw={500}>NIP-5A (gateway)</Text>
                <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>{hostnamePreview.hostname}</Text>
              </Group>
              <Group gap="xs">
                <Text size="sm" fw={500}>DNS / TLS</Text>
                <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                  {previewNsiteRouterHost(hostnamePreview.hostname, config.NSITE_VISITOR_HOST ?? '')}
                </Text>
              </Group>
            </Stack>
          ) : (
            <Text c="red">{hostnamePreview.error}</Text>
          )}
        </Paper>
      )}

      {siteDField && (
        <Stack gap="sm">
          {renderField(siteDField)}
          <Group gap="xs">
            <Button size="xs" variant="outline" onClick={runDiscover35128} loading={dDiscoverLoading}>
              Discover site ids (kind 35128)
            </Button>
            {dDiscovered.length > 0 && (
              <Select
                size="xs"
                placeholder="Apply discovered id…"
                data={dDiscovered.map((d) => ({ value: d, label: d }))}
                onChange={(v) => {
                  if (v) setConfig((c) => ({ ...c, NSITE_SITE_D: v }));
                }}
              />
            )}
          </Group>
        </Stack>
      )}

      {advancedFields.length > 0 && (
        <Paper withBorder p="md">
          <Text fw={500} size="sm" mb="sm">Advanced: relay &amp; Blossom URLs</Text>
          <Text size="xs" c="dimmed" mb="md">
            Optional overrides — sensible defaults are already applied if you leave these as-is.
          </Text>
          {advancedFields.map(renderUrlListField)}
        </Paper>
      )}
    </Stack>
  );
};
