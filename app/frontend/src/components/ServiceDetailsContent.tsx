import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { LineChart } from '@mantine/charts';
import { nip19 } from 'nostr-tools';
import { RubixLoader } from '@samthomson/rubix-loader';
import { SERVICE_TYPE, isNpanelType } from '../../../shared/serviceType';
import { parsePubkeyHex } from '../../../shared/nsite';
import { Text, Group, Anchor, Tooltip, ActionIcon, Button, Stack, Badge, Tabs, Box, Transition, Table, rem, Paper, SimpleGrid, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { IconCopy, IconExternalLink, IconCheck, IconX, IconAlertOctagon, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { InlineTextEditRow } from './InlineTextEditRow';
import { trpc } from '../trpc';
import { serviceTypeToRubixLoaderColor } from '../lib/serviceTypeColor';
import { formatBytes, formatBytesPerSecond, formatPercent, formatWindow, getInsightSeverity, getOverallSeverity, getSeverityColor } from '../../../shared/insights';

const SHELL_H_MS = 480;
const FADE_MS = 280;
const HEIGHT_EASE = `${SHELL_H_MS / 1000}s cubic-bezier(0.33, 1, 0.68, 1)`;

const LABEL_COL = 124;

const monoBreakable = { wordBreak: 'break-all' as const, overflowWrap: 'anywhere' as const };

const DetailBlock = ({ label, children }: { label: string; children: ReactNode }) => (
  <Group align="flex-start" gap="lg" wrap="nowrap">
    <Text size="sm" fw={500} c="dimmed" w={LABEL_COL} style={{ flexShrink: 0 }}>
      {label}
    </Text>
    <Stack gap={10} style={{ flex: 1, minWidth: 0 }}>
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
  const [testState, setTestState] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'fail'>>({});

  const testDns = async (name: string) => {
    setTestState((s) => ({ ...s, [name]: 'loading' }));
    try {
      const res = await trpc.testDnsRecord.query({ host: name, expectedIp: serverIp });
      const ok = res.ok;
      setTestState((s) => ({ ...s, [name]: ok ? 'ok' : 'fail' }));
    } catch {
      setTestState((s) => ({ ...s, [name]: 'fail' }));
    }
  };

  const dnsRow = (name: string) => {
    const state = testState[name] || 'idle';
    return (
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
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" variant="light" loading={state === 'loading'} onClick={() => void testDns(name)}>
              Test
            </Button>
            {state === 'ok' && (
              <Badge size="xs" color="green" variant="filled" leftSection={<IconCheck size={10} />}>
                OK
              </Badge>
            )}
            {state === 'fail' && (
              <Badge size="xs" color="red" variant="filled" leftSection={<IconX size={10} />}>
                Fail
              </Badge>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  };

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
            {isNpanelType(service.type) &&
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
    <Stack gap="xl">
      {service.brokenPreset && (
        <DetailBlock label="Status">
          <Stack gap={6}>
            <Badge color="red" variant="filled" w="fit-content">Misconfigured service</Badge>
            <Text size="xs" c="dimmed" style={monoBreakable}>
              {service.brokenPresetReason || 'Preset metadata is missing for this service.'}
            </Text>
            <Text size="xs" c="dimmed">Delete and recreate this service with the current preset.</Text>
          </Stack>
        </DetailBlock>
      )}
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
                  color="relaykit"
                  onClick={onOpenBlossomExplorer}
                  rightSection={<IconExternalLink size={12} />}
                >
                  Blossom Explorer
                </Button>
              )}
              {isNpanelType(service.type) && (
                <Anchor href={`${httpsUrl}/status`} target="_blank" size="xs" variant="light" color="relaykit">Status</Anchor>
              )}
            </Group>
            {isNpanelType(service.type) && (
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
                    color="relaykit"
                    onClick={onOpenRelayExplorer}
                    rightSection={<IconExternalLink size={12} />}
                  >
                    Relay Explorer
                  </Button>
                </Group>
              </Group>
            </DetailBlock>
          )}
          {isNpanelType(service.type) &&
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

      {isNpanelType(service.type) &&
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
              <Badge color="relaykit" variant="light">NIP-42 required</Badge>
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

const ServiceDetailsInsights = ({
  composeId,
  serviceType,
  presetLabel,
}: {
  composeId: string;
  serviceType?: string | null;
  presetLabel?: string | null;
}) => {
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof trpc.getServiceInsights.query>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderColor = serviceTypeToRubixLoaderColor(serviceType, presetLabel);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await trpc.getServiceInsights.query({ composeId });
        if (!mounted) return;
        setInsights(next);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Could not load service insights');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    const poll = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, [composeId]);

  if (loading && !insights) {
    return (
      <Stack align="center" justify="center" gap="sm" style={{ minHeight: rem(220) }}>
        <RubixLoader size={42} colors={[loaderColor]} speed={1.35} />
        <Text size="sm" c="dimmed">Loading service insights…</Text>
      </Stack>
    );
  }

  if (error && !insights) {
    return (
      <Paper withBorder p="md">
        <Text fw={500} c="red">Could not load service insights</Text>
        <Text size="xs" c="dimmed" mt={4}>{error}</Text>
      </Paper>
    );
  }

  if (!insights) return null;

  const { current, thresholds } = insights;
  const cpuSeverity = getInsightSeverity(current.cpuPct, thresholds.cpu.warn, thresholds.cpu.critical);
  const memSeverity = getInsightSeverity(current.memoryUsedPct, thresholds.memory.warn, thresholds.memory.critical);
  const overallSeverity = getOverallSeverity([cpuSeverity, memSeverity]);
  const overallHealth = overallSeverity === 'critical'
    ? { label: 'Critical', color: 'red', icon: <IconAlertOctagon size={14} /> }
    : overallSeverity === 'warn'
      ? { label: 'Watch', color: 'yellow', icon: <IconAlertTriangle size={14} /> }
      : { label: 'Healthy', color: 'green', icon: <IconCircleCheck size={14} /> };

  const chartData = insights.history.map((point, idx, arr) => {
    const prev = arr[idx - 1];
    const deltaSec = prev ? Math.max(1, (point.ts - prev.ts) / 1000) : Math.max(1, insights.sampleIntervalMs / 1000);
    const netRxRate = prev ? Math.max(0, (point.networkInBytes - prev.networkInBytes) / deltaSec) : 0;
    const netTxRate = prev ? Math.max(0, (point.networkOutBytes - prev.networkOutBytes) / deltaSec) : 0;
    const ioReadRate = prev ? Math.max(0, (point.blockReadBytes - prev.blockReadBytes) / deltaSec) : 0;
    const ioWriteRate = prev ? Math.max(0, (point.blockWriteBytes - prev.blockWriteBytes) / deltaSec) : 0;
    return {
      time: new Date(point.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cpu: Number(point.cpuPct.toFixed(1)),
      memory: Number(point.memoryUsedPct.toFixed(1)),
      rx: netRxRate,
      tx: netTxRate,
      ioRead: ioReadRate,
      ioWrite: ioWriteRate,
    };
  });

  const latest = chartData[chartData.length - 1];
  const historyWindowSec = Math.max(0, Math.round((chartData.length * insights.sampleIntervalMs) / 1000));
  const historyWindowLabel = formatWindow(historyWindowSec);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Text fw={600}>Service runtime</Text>
          <Text size="xs" c="dimmed">Container: {insights.appName}</Text>
        </Stack>
        <Badge variant="filled" color={overallHealth.color} leftSection={overallHealth.icon}>
          Health: {overallHealth.label}
        </Badge>
      </Group>

      {error && (
        <Text size="xs" c="dimmed">Last refresh error: {error}</Text>
      )}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <Paper withBorder p="lg">
          <Group justify="space-between" mb={6}>
            <Text fw={600}>CPU</Text>
            <Badge variant="filled" color={getSeverityColor(cpuSeverity)}>{cpuSeverity}</Badge>
          </Group>
          <Text size="xl" fw={700}>{formatPercent(current.cpuPct)}</Text>
        </Paper>
        <Paper withBorder p="lg">
          <Group justify="space-between" mb={6}>
            <Text fw={600}>Memory</Text>
            <Badge variant="filled" color={getSeverityColor(memSeverity)}>{memSeverity}</Badge>
          </Group>
          <Text size="xl" fw={700}>{formatPercent(current.memoryUsedPct)}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {formatBytes(current.memoryUsedBytes)} / {formatBytes(current.memoryTotalBytes)}
          </Text>
        </Paper>
        <Paper withBorder p="lg">
          <Text fw={600}>Network + disk I/O</Text>
          <Text size="sm" mt={8}>In: {formatBytesPerSecond(latest?.rx || 0)}</Text>
          <Text size="sm">Out: {formatBytesPerSecond(latest?.tx || 0)}</Text>
          <Text size="xs" c="dimmed" mt={8}>
            Disk read {formatBytesPerSecond(latest?.ioRead || 0)} | write {formatBytesPerSecond(latest?.ioWrite || 0)}
          </Text>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <Paper withBorder p="lg">
          <Text fw={600} mb="sm">CPU trend</Text>
          <LineChart
            h={200}
            data={chartData}
            dataKey="time"
            series={[{ name: 'cpu', color: 'relaykit' }]}
            withDots={false}
            withLegend={false}
            yAxisProps={{ domain: [0, 100] }}
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatPercent(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
        <Paper withBorder p="lg">
          <Text fw={600} mb="sm">Memory trend</Text>
          <LineChart
            h={200}
            data={chartData}
            dataKey="time"
            series={[{ name: 'memory', color: 'blue' }]}
            withDots={false}
            withLegend={false}
            yAxisProps={{ domain: [0, 100] }}
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatPercent(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
        <Paper withBorder p="lg">
          <Text fw={600} mb="sm">Network trend</Text>
          <LineChart
            h={200}
            data={chartData}
            dataKey="time"
            series={[
              { name: 'rx', color: 'teal', label: 'Inbound' },
              { name: 'tx', color: 'grape', label: 'Outbound' },
            ]}
            withDots={false}
            withLegend
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatBytesPerSecond(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
};

export const ServiceDetailsContent = (props: ServiceDetailsContentProps) => {
  const { service, serverIp } = props;
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light');
  const domain = service.domains?.[0];
  const hasDNS = domain && serverIp;
  const hasInsights = !!service.composeId;
  const activePanelBg = colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0];
  const panelShadow = colorScheme === 'dark'
    ? '0 4px 12px rgba(0,0,0,0.18)'
    : '0 4px 12px rgba(15,23,42,0.06)';
  const activeTabBg = activePanelBg;
  const activeTabColor = colorScheme === 'dark' ? theme.white : theme.black;
  const inactiveTabColor = colorScheme === 'dark' ? theme.colors.gray[4] : theme.colors.gray[7];
  const tabsRailBg = 'transparent';
  const inactiveTabHoverBg = colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[1];
  const activeTabAccent = theme.colors.relaykit[6];
  const panelContentStyle = {
    minWidth: 0,
    paddingTop: rem(18),
    paddingRight: rem(18),
    paddingBottom: rem(18),
    paddingLeft: rem(24),
    background: activePanelBg,
  };
  const getTabStyle = (active: boolean) => ({
    background: active ? activeTabBg : 'transparent',
    color: active ? activeTabColor : inactiveTabColor,
    boxShadow: active ? `inset 3px 0 0 ${activeTabAccent}` : 'none',
  });

  const [section, setSection] = useState('info');
  const innerRef = useRef<HTMLDivElement>(null);
  const [shellH, setShellH] = useState<number | null>(null);
  const [maxShellH, setMaxShellH] = useState<number>(0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      setShellH(h);
      setMaxShellH((prev) => (h > prev ? h : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Box
      style={{
        height: shellH != null ? Math.max(shellH, maxShellH) : undefined,
        transition: shellH != null ? `height ${HEIGHT_EASE}` : undefined,
        overflow: 'hidden',
      }}
    >
      <Box ref={innerRef}>
        <Tabs
          value={section}
          onChange={(v) => v != null && setSection(v)}
          orientation="vertical"
          variant="unstyled"
          styles={{
            root: { width: '100%' },
            list: {
              border: 'none',
              background: tabsRailBg,
            },
            tab: {
              color: inactiveTabColor,
              fontWeight: 500,
              paddingInline: rem(22),
              paddingBlock: rem(13),
              transition: 'background-color 120ms ease, color 120ms ease',
              '&:hover': {
                background: inactiveTabHoverBg,
              },
            },
          }}
        >
          <Group align="stretch" gap={0} wrap="nowrap" w="100%">
            <Tabs.List aria-label="Details sections" miw={rem(132)} style={{ flexShrink: 0 }}>
              <Tabs.Tab value="info" style={getTabStyle(section === 'info')}>Info</Tabs.Tab>
              <Tabs.Tab value="dns" style={getTabStyle(section === 'dns')}>DNS</Tabs.Tab>
              <Tabs.Tab value="insights" style={getTabStyle(section === 'insights')}>Insights</Tabs.Tab>
            </Tabs.List>
            <Box
              style={{
                flex: 1,
                minWidth: 0,
                background: activePanelBg,
                boxShadow: panelShadow,
              }}
            >
              <Transition transition="fade" duration={FADE_MS} exitDuration={0} mounted={section === 'info'}>
                {(tStyle) => (
                  <Box style={{ ...panelContentStyle, ...tStyle }}>
                    <ServiceDetailsInfo {...props} />
                  </Box>
                )}
              </Transition>
              <Transition transition="fade" duration={FADE_MS} exitDuration={0} mounted={section === 'dns'}>
                {(tStyle) => (
                  <Box style={{ ...panelContentStyle, ...tStyle }}>
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
              <Transition transition="fade" duration={FADE_MS} exitDuration={0} mounted={section === 'insights'}>
                {(tStyle) => (
                  <Box style={{ ...panelContentStyle, ...tStyle }}>
                    {hasInsights ? (
                      <ServiceDetailsInsights
                        composeId={service.composeId}
                        serviceType={service.type}
                        presetLabel={service.serviceType}
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
