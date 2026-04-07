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

type ProfileStatus = 'idle' | 'loading' | 'ok' | 'error' | 'skipped';

const PresetConfigFieldInput = ({
  field,
  value,
  onChange,
}: {
  field: any;
  value: string;
  onChange: (next: string) => void;
}) => {
  if (field.type === 'boolean') {
    return (
      <select
        value={value || 'false'}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        className="block w-full px-3 py-2 mt-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-paper-elevated text-ink"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      placeholder={field.placeholder || field.description}
      className="block w-full px-3 py-2 mt-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-paper-elevated text-ink"
    />
  );
};

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
    <div key={field.id} className="mb-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">{field.name}</span>
        <PresetConfigFieldInput
          field={field}
          value={config[field.id] ?? field.default ?? ''}
          onChange={(next) => setConfig((c) => ({ ...c, [field.id]: next }))}
        />
      </label>
      {field.description && (
        <p className="m-0 mt-1 text-xs leading-snug text-ink-muted">{field.description}</p>
      )}
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
    <>
      {profileStatus !== 'idle' && (
        <div className="mb-4 rounded-md border border-border-soft bg-paper px-3 py-2 text-xs leading-snug text-ink-muted">
          {profileStatus === 'loading' && (
            <span>Loading this site pubkey&apos;s kind 10002 (relays) and 10063 (Blossom)…</span>
          )}
          {profileStatus === 'ok' && (
            <span className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <span>
                {profileMeta && !profileMeta.foundKind10002 && !profileMeta.foundKind10063 ? (
                  <>
                    No kind <strong className="text-ink">10002</strong> or{' '}
                    <strong className="text-ink">10063</strong> found for your pubkey on the relays we
                    queried. Advanced fields show <strong className="text-ink">RelayKit defaults only</strong>.
                    Publish NIP-65 / Blossom lists for that site pubkey, or tap refresh after they land on
                    relays.
                  </>
                ) : profileMeta &&
                  (profileMeta.foundKind10002 || profileMeta.foundKind10063) ? (
                  <>
                    {profileMeta.foundKind10002 && (
                      <>
                        Merged <strong className="text-ink">{profileMeta.userRelayUrlCount}</strong> relay
                        URL(s) from kind 10002.
                      </>
                    )}
                    {profileMeta.foundKind10002 && profileMeta.foundKind10063 ? ' ' : ''}
                    {profileMeta.foundKind10063 && (
                      <>
                        Merged <strong className="text-ink">{profileMeta.userBlossomUrlCount}</strong>{' '}
                        Blossom base URL(s) from kind 10063.
                      </>
                    )}{' '}
                    Default relays stay appended for discovery.
                  </>
                ) : (
                  <>Done loading profile hints.</>
                )}
              </span>
              <button
                type="button"
                onClick={() => fetchProfile({ configSnapshot: config })}
                className="shrink-0 rounded border border-border bg-paper-elevated px-2 py-1 text-xs font-medium text-ink hover:bg-border-soft"
              >
                Refresh from profile
              </button>
            </span>
          )}
          {profileStatus === 'error' && (
            <span className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <span>Could not load profile events for this site pubkey from the network. Defaults remain in Advanced — you can edit there.</span>
              <button
                type="button"
                onClick={() => fetchProfile({ configSnapshot: config })}
                className="shrink-0 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                Retry
              </button>
            </span>
          )}
          {profileStatus === 'skipped' && (
            <span>
              Enter a valid <strong className="text-ink">Publishing key</strong> (or sign in with a key we can fall
              back to); then use Refresh, or set relay URLs manually in Advanced.
            </span>
          )}
        </div>
      )}

      {primaryFields
        .filter((f: { id: string }) => f.id !== 'NSITE_SITE_D')
        .map(renderField)}

      {hostnamePreview && (
        <div className="mb-4 rounded-md border border-border-soft bg-paper px-3 py-2 text-xs text-ink-muted">
          {hostnamePreview.ok ? (
            <>
              <div>
                <span className="font-medium text-ink">NIP-5A (gateway)</span>{' '}
                <span className="font-mono text-ink break-all">{hostnamePreview.hostname}</span>
              </div>
              <div className="mt-1">
                <span className="font-medium text-ink">DNS / TLS</span>{' '}
                <span className="font-mono text-ink break-all">
                  {previewNsiteRouterHost(hostnamePreview.hostname, config.NSITE_VISITOR_HOST ?? '')}
                </span>
              </div>
            </>
          ) : (
            <span className="text-error-text">{hostnamePreview.error}</span>
          )}
        </div>
      )}

      {siteDField && (
        <div className="mb-4">
          {renderField(siteDField)}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runDiscover35128}
              disabled={dDiscoverLoading}
              className="rounded border border-border bg-paper-elevated px-2 py-1 text-xs font-medium text-ink hover:bg-border-soft disabled:opacity-50"
            >
              {dDiscoverLoading ? 'Querying…' : 'Discover site ids (kind 35128)'}
            </button>
            {dDiscovered.length > 0 && (
              <select
                className="max-w-full rounded border border-border bg-paper-elevated px-2 py-1 text-xs text-ink"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setConfig((c) => ({ ...c, NSITE_SITE_D: v }));
                }}
              >
                <option value="">Apply discovered id…</option>
                {dDiscovered.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {advancedFields.length > 0 && (
        <details className="mb-4 rounded-md border border-border-soft bg-paper px-2 py-1">
          <summary className="cursor-pointer select-none px-1 py-2 text-sm font-medium text-ink">
            Advanced: relay &amp; Blossom URLs
          </summary>
          <div className="border-t border-border-soft px-1 pb-2 pt-3">
            <p className="m-0 mb-3 text-xs leading-snug text-ink-muted">
              Optional overrides — sensible defaults are already applied if you leave these as-is.
            </p>
            {advancedFields.map(renderUrlListField)}
          </div>
        </details>
      )}
    </>
  );
};
