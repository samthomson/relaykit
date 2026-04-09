import { format, formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { SERVICE_TYPE } from '../../../shared/serviceType';
import { parsePubkeyHex } from '../../../shared/nsite';
import { Text, Group, Anchor, Tooltip, ActionIcon, TextInput, Button, Stack, Paper, Badge } from '@mantine/core';
import { IconCopy, IconExternalLink } from '@tabler/icons-react';

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
      {domain ? (
        <>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={500} c="dimmed" w={60}>HTTPS</Text>
            <Anchor href={httpsUrl} target="_blank" size="sm" fw={500} truncate={false}>
              {httpsUrl} ↗
            </Anchor>
            <span style={{ color: 'var(--mantine-color-gray-4)' }}>|</span>
            <Tooltip label="Copy URL">
              <ActionIcon variant="subtle" size="sm" onClick={() => onCopy(httpsUrl)}>
                <IconCopy size={14} />
              </ActionIcon>
            </Tooltip>
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
            <Text size="xs" c="dimmed" pl={100}>
              Republished the site? Use <Text component="span" fw={500}>Stop</Text> then <Text component="span" fw={500}>Start</Text> so
              the gateway pulls fresh manifests (otherwise it may take ~10 minutes).
            </Text>
          )}
          {service.type === SERVICE_TYPE.RELAY && (
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={500} c="dimmed" w={60}>WSS</Text>
              <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={wssUrl}>{wssUrl}</Text>
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
          )}
          {service.type === SERVICE_TYPE.NSITE &&
            service.nsiteVisitorHost &&
            service.nsiteCanonicalHost &&
            service.nsiteCanonicalHost !== domain?.host && (() => {
              const h = service.nsiteCanonicalHost;
              const nip5aHttps = `https://${h}`;
              return (
                <>
                  <Group gap="xs">
                    <Text size="sm" fw={500} c="dimmed" w={100}>NIP-5A URL</Text>
                    <Anchor href={nip5aHttps} target="_blank" size="xs" truncate style={{ flex: 1 }} title={h}>
                      {nip5aHttps} ↗
                    </Anchor>
                    <Button size="xs" variant="subtle" onClick={() => onCopy(nip5aHttps)}>Copy</Button>
                  </Group>
                  <Text size="xs" c="dimmed" pl={100}>
                    NIP-5A builds this hostname from your pubkey and site id (compact encoding), so it will not look like your hex or npub.
                  </Text>
                </>
              );
            })()}
        </>
      ) : (
        <Group gap="xs">
          <Text size="sm" fw={500} c="dimmed" w={100}>Domain</Text>
          <Text size="xs" c="dimmed" fs="italic">No domain configured</Text>
        </Group>
      )}

      {service.type === SERVICE_TYPE.NSITE &&
        (service.nsiteSiteNpub ||
          service.nsiteSiteD ||
          (!service.nsiteSiteNpub && service.nsiteManifestEventId)) && (
          <Stack gap="xs">
            {service.nsiteSiteNpub && (() => {
              const raw = service.nsiteSiteNpub.trim();
              const hex = parsePubkeyHex(raw);
              if (!hex) {
                return (
                  <Group gap="xs">
                    <Text size="sm" fw={500} c="dimmed" w={100}>Publishing key</Text>
                    <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={raw}>{raw}</Text>
                    <Button size="xs" variant="subtle" onClick={() => onCopy(raw)}>Copy</Button>
                  </Group>
                );
              }
              const npub = nip19.npubEncode(hex);
              const storedAsHex = /^[0-9a-f]{64}$/i.test(raw);
              const hexRow = (
                <Group key="pub-hex" gap="xs">
                  <Text size="sm" fw={500} c="dimmed" w={100}>Pubkey (hex)</Text>
                  <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={hex}>{hex}</Text>
                  <Button size="xs" variant="subtle" onClick={() => onCopy(hex)}>Copy</Button>
                </Group>
              );
              const npubRow = (
                <Group key="npub" gap="xs">
                  <Text size="sm" fw={500} c="dimmed" w={100}>Npub</Text>
                  <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={npub}>{npub}</Text>
                  <Button size="xs" variant="subtle" onClick={() => onCopy(npub)}>Copy</Button>
                </Group>
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
              <Group gap="xs">
                <Text size="sm" fw={500} c="dimmed" w={100}>Site id</Text>
                <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={service.nsiteSiteD}>{service.nsiteSiteD}</Text>
                <Button size="xs" variant="subtle" onClick={() => onCopy(service.nsiteSiteD)}>Copy</Button>
              </Group>
            )}
            {!service.nsiteSiteNpub && service.nsiteManifestEventId && (
              <Group gap="xs">
                <Text size="sm" fw={500} c="dimmed" w={100}>Manifest id</Text>
                <Text size="xs" ff="monospace" truncate style={{ flex: 1 }} title={service.nsiteManifestEventId}>{service.nsiteManifestEventId}</Text>
                <Button size="xs" variant="subtle" onClick={() => onCopy(service.nsiteManifestEventId)}>Copy</Button>
              </Group>
            )}
          </Stack>
        )}

      {isEditing && (
        <Group gap="xs">
          <Text size="sm" fw={500} c="dimmed" w={100}>Host</Text>
          <TextInput
            size="xs"
            value={newDomainHost}
            onChange={(e) => setNewDomainHost(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button size="xs" color="green" onClick={onSaveDomain}>Save</Button>
          <Button size="xs" color="gray" onClick={onCancelEdit}>Cancel</Button>
        </Group>
      )}

      {hasConfig && (
        <Stack gap="xs">
          {whitelistedKinds.length > 0 && (
            <Group gap="xs">
              <Text size="sm" fw={500} c="dimmed" w={100}>Kinds +</Text>
              <Group gap={4}>
                {whitelistedKinds.map((k) => (
                  <Badge key={k} variant="light" color="green" size="xs">{k}</Badge>
                ))}
              </Group>
            </Group>
          )}
          {blacklistedKinds.length > 0 && (
            <Group gap="xs">
              <Text size="sm" fw={500} c="dimmed" w={100}>Kinds -</Text>
              <Group gap={4}>
                {blacklistedKinds.map((k) => (
                  <Badge key={k} variant="light" color="red" size="xs">{k}</Badge>
                ))}
              </Group>
            </Group>
          )}
          {whitelistedPubkeys.length > 0 && (
            <Group gap="xs">
              <Text size="sm" fw={500} c="dimmed" w={100}>Pubkeys +</Text>
              <Group gap={4}>
                {whitelistedPubkeys.map((p) => (
                  <Badge key={p} variant="light" color="green" size="xs">{p.slice(0, 8)}…</Badge>
                ))}
              </Group>
            </Group>
          )}
          {requireNip42 && (
            <Group gap="xs">
              <Text size="sm" fw={500} c="dimmed" w={100}>Auth</Text>
              <Badge color="relay-orange" variant="light">NIP-42 required</Badge>
            </Group>
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
          <Stack gap="sm">
            <Group gap="xs" align="flex-start">
              <Text size="sm" fw={500} c="dimmed" w={100}>DNS</Text>
              <Stack gap="xs" style={{ flex: 1 }}>
                {dnsHosts.map((h) => (
                  <Paper key={h} withBorder p="xs" ff="monospace">
                    <Group justify="space-between">
                      <Text size="xs">
                        {h} → {serverIp}
                      </Text>
                      <Tooltip label="Copy IP">
                        <ActionIcon variant="subtle" onClick={() => onCopy(serverIp!)}>
                          <IconCopy size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Group>
          </Stack>
        );
      })()}

      <Stack gap={4}>
        <Group gap="xs">
          <Text size="sm" fw={500} c="dimmed" w={100}>Created</Text>
          <Text size="sm">{createdStr}</Text>
        </Group>
        <Text size="xs" c="dimmed" fs="italic" pl={100}>{createdAgo}</Text>
      </Stack>
    </Stack>
  );
};
