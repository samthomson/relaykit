import type { ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { SERVICE_TYPE } from '../../../shared/serviceType';
import { parsePubkeyHex } from '../../../shared/nsite';
import { Text, Group, Anchor, Tooltip, ActionIcon, Button, Stack, Paper, Badge } from '@mantine/core';
import { IconCopy, IconExternalLink } from '@tabler/icons-react';
import { InlineTextEditRow } from './InlineTextEditRow';

const LABEL_COL = 100;

const monoBreakable = { wordBreak: 'break-all' as const, overflowWrap: 'anywhere' as const };

const DetailBlock = ({ label, children }: { label: string; children: ReactNode }) => (
  <Group align="flex-start" gap="sm" wrap="nowrap">
    <Text size="sm" fw={500} c="dimmed" w={LABEL_COL} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
      {children}
    </Stack>
  </Group>
);

export type ServiceDetailsContentProps = {
  service: any;
  serverIp: string | null;
  editingDomain: { composeId: string; domainId: string; currentHost: string } | null;
  newDomainHost: string;
  setNewDomainHost: (v: string) => void;
  onSaveDomain: () => void;
  onCancelEdit: () => void;
  onCopy: (text: string) => void;
  onOpenRelayExplorer: () => void;
  onOpenBlossomExplorer: () => void;
  /** When host is edited in the service card header / modal title instead. */
  omitHostEditor?: boolean;
};

export const ServiceDetailsContent = ({
  service,
  serverIp,
  editingDomain,
  newDomainHost,
  setNewDomainHost,
  onSaveDomain,
  onCancelEdit,
  onCopy,
  onOpenRelayExplorer,
  onOpenBlossomExplorer,
  omitHostEditor = false,
}: ServiceDetailsContentProps) => {
  const domain = service.domains?.[0];
  const whitelistedPubkeys: string[] = service.whitelistedPubkeys || [];
  const whitelistedKinds: string[] = service.whitelistedKinds || [];
  const blacklistedKinds: string[] = service.blacklistedKinds || [];
  const requireNip42: boolean = !!service.requireNip42;

  const isEditing = editingDomain?.domainId === domain?.domainId;
  const createdAt = new Date(service.createdAt);
  const createdStr = format(createdAt, 'd MMM yyyy, h:mm a');
  const createdAgo = formatDistanceToNow(createdAt, { addSuffix: true });
  const httpsUrl = domain ? `https://${domain.host}` : '';
  const wssUrl = domain ? `wss://${domain.host}` : '';
  const hasConfig = whitelistedKinds.length > 0 || blacklistedKinds.length > 0 || whitelistedPubkeys.length > 0 || requireNip42;
  const hasDNS = domain && serverIp;

  return (
    <Stack gap="md">
      <DetailBlock label="Service ID">
        <Group gap="xs" wrap="wrap" align="flex-start">
          <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={service.composeId}>
            {service.composeId}
          </Text>
          <Button size="xs" variant="subtle" onClick={() => onCopy(service.composeId)}>Copy</Button>
        </Group>
      </DetailBlock>
      {domain ? (
        <>
          <DetailBlock label="HTTPS">
            <Group gap="xs" wrap="wrap" align="center">
              <Anchor href={httpsUrl} target="_blank" size="sm" fw={500} style={monoBreakable}>
                {httpsUrl} ↗
              </Anchor>
              <Group gap={4} wrap="nowrap">
                <span style={{ color: 'var(--mantine-color-gray-4)' }}>|</span>
                <Tooltip label="Copy URL">
                  <ActionIcon variant="subtle" size="sm" onClick={() => onCopy(httpsUrl)}>
                    <IconCopy size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              {service.type === SERVICE_TYPE.BLOSSOM && (
                <Button
                  size="xs"
                  variant="light"
                  color="relay-orange"
                  onClick={onOpenBlossomExplorer}
                  rightSection={<IconExternalLink size={12} />}
                >
                  Blossom Explorer
                </Button>
              )}
              {service.type === SERVICE_TYPE.NSITE && (
                <Anchor href={`${httpsUrl}/status`} target="_blank" size="xs" variant="light" color="relay-orange">Status</Anchor>
              )}
            </Group>
            {service.type === SERVICE_TYPE.NSITE && (
              <Text size="xs" c="dimmed">
                Republished the site? Use <Text component="span" fw={500}>Stop</Text> then <Text component="span" fw={500}>Start</Text> so
                the gateway pulls fresh manifests (otherwise it may take ~10 minutes).
              </Text>
            )}
          </DetailBlock>
          {service.type === SERVICE_TYPE.RELAY && (
            <DetailBlock label="WSS">
              <Group gap="xs" wrap="wrap" align="flex-start">
                <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={wssUrl}>
                  {wssUrl}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <span style={{ color: 'var(--mantine-color-gray-4)' }}>|</span>
                  <Tooltip label="Copy URL">
                    <ActionIcon variant="subtle" size="sm" onClick={() => onCopy(wssUrl)}>
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Button
                    size="xs"
                    variant="light"
                    color="relay-orange"
                    onClick={onOpenRelayExplorer}
                    rightSection={<IconExternalLink size={12} />}
                  >
                    Relay Explorer
                  </Button>
                </Group>
              </Group>
            </DetailBlock>
          )}
          {service.type === SERVICE_TYPE.NSITE &&
            service.nsiteVisitorHost &&
            service.nsiteCanonicalHost &&
            service.nsiteCanonicalHost !== domain?.host && (() => {
              const h = service.nsiteCanonicalHost;
              const nip5aHttps = `https://${h}`;
              return (
                <DetailBlock label="NIP-5A URL">
                  <Group gap="xs" wrap="wrap" align="flex-start">
                    <Anchor href={nip5aHttps} target="_blank" size="xs" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={h}>
                      {nip5aHttps} ↗
                    </Anchor>
                    <Button size="xs" variant="subtle" onClick={() => onCopy(nip5aHttps)}>Copy</Button>
                  </Group>
                  <Text size="xs" c="dimmed">
                    NIP-5A builds this hostname from your pubkey and site id (compact encoding), so it will not look like your hex or npub.
                  </Text>
                </DetailBlock>
              );
            })()}
        </>
      ) : (
        <DetailBlock label="Domain">
          <Text size="xs" c="dimmed" fs="italic">No domain configured</Text>
        </DetailBlock>
      )}

      {service.type === SERVICE_TYPE.NSITE &&
        (service.nsiteSiteNpub ||
          service.nsiteSiteD ||
          (!service.nsiteSiteNpub && service.nsiteManifestEventId)) && (
          <Stack gap="md">
            {service.nsiteSiteNpub && (() => {
              const raw = service.nsiteSiteNpub.trim();
              const hex = parsePubkeyHex(raw);
              if (!hex) {
                return (
                  <DetailBlock label="Publishing key">
                    <Group gap="xs" wrap="wrap" align="flex-start">
                      <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={raw}>
                        {raw}
                      </Text>
                      <Button size="xs" variant="subtle" onClick={() => onCopy(raw)}>Copy</Button>
                    </Group>
                  </DetailBlock>
                );
              }
              const npub = nip19.npubEncode(hex);
              const storedAsHex = /^[0-9a-f]{64}$/i.test(raw);
              const hexRow = (
                <DetailBlock key="pub-hex" label="Pubkey (hex)">
                  <Group gap="xs" wrap="wrap" align="flex-start">
                    <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={hex}>
                      {hex}
                    </Text>
                    <Button size="xs" variant="subtle" onClick={() => onCopy(hex)}>Copy</Button>
                  </Group>
                </DetailBlock>
              );
              const npubRow = (
                <DetailBlock key="npub" label="Npub">
                  <Group gap="xs" wrap="wrap" align="flex-start">
                    <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={npub}>
                      {npub}
                    </Text>
                    <Button size="xs" variant="subtle" onClick={() => onCopy(npub)}>Copy</Button>
                  </Group>
                </DetailBlock>
              );
              return storedAsHex ? (
                <>
                  {hexRow}
                  {npubRow}
                </>
              ) : (
                <>
                  {npubRow}
                  {hexRow}
                </>
              );
            })()}
            {service.nsiteSiteD && (
              <DetailBlock label="Site id">
                <Group gap="xs" wrap="wrap" align="flex-start">
                  <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={service.nsiteSiteD}>
                    {service.nsiteSiteD}
                  </Text>
                  <Button size="xs" variant="subtle" onClick={() => onCopy(service.nsiteSiteD)}>Copy</Button>
                </Group>
              </DetailBlock>
            )}
            {!service.nsiteSiteNpub && service.nsiteManifestEventId && (
              <DetailBlock label="Manifest id">
                <Group gap="xs" wrap="wrap" align="flex-start">
                  <Text size="xs" ff="monospace" style={{ flex: '1 1 12rem', minWidth: 0, ...monoBreakable }} title={service.nsiteManifestEventId}>
                    {service.nsiteManifestEventId}
                  </Text>
                  <Button size="xs" variant="subtle" onClick={() => onCopy(service.nsiteManifestEventId)}>Copy</Button>
                </Group>
              </DetailBlock>
            )}
          </Stack>
        )}

      {isEditing && !omitHostEditor && (
        <DetailBlock label="Host">
          <InlineTextEditRow
            value={newDomainHost}
            onChange={setNewDomainHost}
            onSave={onSaveDomain}
            onCancel={onCancelEdit}
            inputStyle={{ flex: 1, minWidth: 0 }}
          />
        </DetailBlock>
      )}

      {hasConfig && (
        <Stack gap="md">
          {whitelistedKinds.length > 0 && (
            <DetailBlock label="Kinds +">
              <Group gap={4} wrap="wrap">
                {whitelistedKinds.map((k) => (
                  <Badge key={k} variant="light" color="green" size="xs">{k}</Badge>
                ))}
              </Group>
            </DetailBlock>
          )}
          {blacklistedKinds.length > 0 && (
            <DetailBlock label="Kinds -">
              <Group gap={4} wrap="wrap">
                {blacklistedKinds.map((k) => (
                  <Badge key={k} variant="light" color="red" size="xs">{k}</Badge>
                ))}
              </Group>
            </DetailBlock>
          )}
          {whitelistedPubkeys.length > 0 && (
            <DetailBlock label="Pubkeys +">
              <Group gap={4} wrap="wrap">
                {whitelistedPubkeys.map((p) => (
                  <Badge key={p} variant="light" color="green" size="xs">{p.slice(0, 8)}…</Badge>
                ))}
              </Group>
            </DetailBlock>
          )}
          {requireNip42 && (
            <DetailBlock label="Auth">
              <Badge color="relay-orange" variant="light">NIP-42 required</Badge>
            </DetailBlock>
          )}
        </Stack>
      )}

      {hasDNS && (() => {
        const dnsHosts = [domain.host];
        if (
          service.type === SERVICE_TYPE.NSITE &&
          service.nsiteCanonicalHost &&
          service.nsiteCanonicalHost !== domain.host
        ) {
          dnsHosts.push(service.nsiteCanonicalHost);
        }
        return (
          <DetailBlock label="DNS">
            <Stack gap="xs">
              {dnsHosts.map((h) => (
                <Paper key={h} withBorder p="xs">
                  <Group gap="xs" align="flex-start" wrap="nowrap" justify="space-between">
                    <Text size="xs" ff="monospace" style={{ flex: 1, minWidth: 0, ...monoBreakable }}>
                      {h} → {serverIp}
                    </Text>
                    <Tooltip label="Copy IP">
                      <ActionIcon variant="subtle" size="sm" style={{ flexShrink: 0 }} onClick={() => onCopy(serverIp!)}>
                        <IconCopy size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </DetailBlock>
        );
      })()}

      <DetailBlock label="Created">
        <Stack gap={2}>
          <Text size="sm">{createdStr}</Text>
          <Text size="xs" c="dimmed" fs="italic">{createdAgo}</Text>
        </Stack>
      </DetailBlock>
    </Stack>
  );
};
