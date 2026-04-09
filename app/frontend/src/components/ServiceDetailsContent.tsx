import type { ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import { SERVICE_TYPE } from '../../../shared/serviceType';
import { parsePubkeyHex } from '../../../shared/nsite';
import { Text, Group, Anchor, Tooltip, ActionIcon, Button, Stack, Badge, Tabs, Box, Transition, Table, rem } from '@mantine/core';
import { IconCopy, IconExternalLink } from '@tabler/icons-react';
import { InlineTextEditRow } from './InlineTextEditRow';

const SHELL_H_MS = 480;
const FADE_MS = 280;
const HEIGHT_EASE = `${SHELL_H_MS / 1000}s cubic-bezier(0.33, 1, 0.68, 1)`;

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

const ServiceDetailsDns = ({
  service,
  domain,
  serverIp,
  onCopy,
}: {
  service: any;
  domain: { host: string };
  serverIp: string;
  onCopy: (text: string) => void;
}) => {
  const dnsCel = 'service-details-dns-cel';
  const dnsCopy = 'service-details-dns-copy';

  const dnsRow = (name: string) => (
    <Table.Tr key={name}>
      <Table.Td>
        <Text size="xs" ff="monospace">
          A
        </Text>
      </Table.Td>
      <Table.Td className={dnsCel}>
        <Group gap={0} wrap="nowrap" align="center">
          <Text size="xs" ff="monospace" style={monoBreakable}>
            {name}
          </Text>
          <Tooltip label="Copy name">
            <ActionIcon
              variant="subtle"
              size="sm"
              className={dnsCopy}
              onClick={() => onCopy(name)}
              style={{ flexShrink: 0, marginLeft: rem(2) }}
            >
              <IconCopy size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
      <Table.Td className={dnsCel}>
        <Group gap={0} wrap="nowrap" align="center">
          <Text size="xs" ff="monospace" style={monoBreakable}>
            {serverIp}
          </Text>
          <Tooltip label="Copy IP">
            <ActionIcon
              variant="subtle"
              size="sm"
              className={dnsCopy}
              onClick={() => onCopy(serverIp)}
              style={{ flexShrink: 0, marginLeft: rem(2) }}
            >
              <IconCopy size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  );

  return (
    <>
      <style>
        {`
          .${dnsCel}:hover .${dnsCopy} { opacity: 1; pointer-events: auto; }
          .${dnsCopy} { opacity: 0; pointer-events: none; transition: opacity 80ms ease; }
        `}
      </style>
      <Table.ScrollContainer minWidth={440}>
        <Table
          striped
          highlightOnHover
          withTableBorder
          withColumnBorders
          verticalSpacing="xs"
          horizontalSpacing="sm"
          fz="xs"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Content</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dnsRow(domain.host)}
            {service.type === SERVICE_TYPE.NSITE &&
              service.nsiteCanonicalHost &&
              service.nsiteCanonicalHost !== domain.host &&
              dnsRow(service.nsiteCanonicalHost)}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
};

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

const ServiceDetailsInfo = (props: ServiceDetailsContentProps) => {
  const {
    service,
    editingDomain,
    newDomainHost,
    setNewDomainHost,
    onSaveDomain,
    onCancelEdit,
    onCopy,
    onOpenRelayExplorer,
    onOpenBlossomExplorer,
    omitHostEditor = false,
  } = props;
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

      <DetailBlock label="Created">
        <Stack gap={2}>
          <Text size="sm">{createdStr}</Text>
          <Text size="xs" c="dimmed" fs="italic">{createdAgo}</Text>
        </Stack>
      </DetailBlock>
    </Stack>
  );
};

export const ServiceDetailsContent = (props: ServiceDetailsContentProps) => {
  const { service, serverIp } = props;
  const domain = service.domains?.[0];
  const hasDNS = domain && serverIp;

  const [section, setSection] = useState('info');
  const innerRef = useRef<HTMLDivElement>(null);
  const [shellH, setShellH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setShellH(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Box
      style={{
        height: shellH != null ? shellH : undefined,
        transition: shellH != null ? `height ${HEIGHT_EASE}` : undefined,
        overflow: 'hidden',
      }}
    >
      <Box ref={innerRef}>
        <Tabs
          value={section}
          onChange={(v) => v != null && setSection(v)}
          orientation="vertical"
          variant="outline"
          styles={{
            root: { width: '100%' },
          }}
        >
          <Group align="flex-start" gap="lg" wrap="nowrap" w="100%">
            <Tabs.List aria-label="Details sections" miw={rem(80)} style={{ flexShrink: 0 }}>
              <Tabs.Tab value="info">Info</Tabs.Tab>
              <Tabs.Tab value="dns">DNS</Tabs.Tab>
            </Tabs.List>
            <Box style={{ flex: 1, minWidth: 0, paddingTop: rem(2) }}>
              <Transition transition="fade" duration={FADE_MS} exitDuration={0} mounted={section === 'info'}>
                {(tStyle) => (
                  <Box style={{ ...tStyle, minWidth: 0 }}>
                    <ServiceDetailsInfo {...props} />
                  </Box>
                )}
              </Transition>
              <Transition transition="fade" duration={FADE_MS} exitDuration={0} mounted={section === 'dns'}>
                {(tStyle) => (
                  <Box style={{ ...tStyle, minWidth: 0 }}>
                    {hasDNS ? (
                      <ServiceDetailsDns
                        service={service}
                        domain={domain}
                        serverIp={serverIp}
                        onCopy={props.onCopy}
                      />
                    ) : null}
                  </Box>
                )}
              </Transition>
            </Box>
          </Group>
        </Tabs>
      </Box>
    </Box>
  );
};
