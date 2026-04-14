import { useState, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink as RouterNavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { nip19 } from 'nostr-tools';
import { RubixLoader, RubixLoaderColor } from '@samthomson/rubix-loader';
import { trpc } from './trpc';
import { useAuth } from './contexts/AuthContext';
import { useDokploy } from './contexts/DokployContext';
import { useRefreshServices } from './contexts/RefreshServicesContext';
import { SERVICE_TYPE, isNpanelType, isRelayType } from '../../shared/serviceType';
import { NsiteDeployFields, buildNsiteDeployDefaults, prepareNsiteConfigForSave } from './components/NsiteDeployFields';
import { ServiceDetailsContent, ServiceDetailsModalContext } from './components/ServiceDetailsContent';
import { InlineTextEditRow, INLINE_TITLE_ROW_H } from './components/InlineTextEditRow';
import { ServiceHostTitleView } from './components/ServiceHostTitleView';
import { InsightsPage } from './components/InsightsPage';
import { serviceTypeToRubixLoaderColor } from './lib/serviceTypeColor';
import { Menu, Button, Text, Modal, Group, Badge, ActionIcon, TextInput, Select, Stack, Paper, Anchor, Title, AppShell, Burger, NavLink, ScrollArea, Card, Tooltip, SegmentedControl, Box, SimpleGrid, rem, useMantineColorScheme, Switch, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { IconChevronDown, IconCopy, IconExternalLink, IconPencil, IconCpu, IconDatabase, IconServer, IconKey, IconAlertTriangle } from '@tabler/icons-react';

const serviceDetailsModalStyles = {
  content: { maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 },
  body: { flex: '1 1 0%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
} as const;

function getIdentityKeys(key: string | null): { hex: string | null; npub: string | null } {
  if (!key) return { hex: null, npub: null };
  
  if (key.startsWith('npub1')) {
    const bytes = nip19.decode(key).data as Uint8Array;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return { hex, npub: key };
  }
  
  if (/^[a-f0-9]{64}$/i.test(key)) {
    return { hex: key, npub: nip19.npubEncode(key) };
  }
  
  return { hex: null, npub: null };
}

const formatPercentRounded = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

const formatBytesRounded = (bytes: number | null): string => {
  if (bytes === null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Math.max(0, bytes)
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${Math.round(size)}${units[idx]}`
}

const formatBytesPerSecondRounded = (bytesPerSec: number | null): string => {
  if (bytesPerSec === null || !Number.isFinite(bytesPerSec)) return '—'
  return `${formatBytesRounded(bytesPerSec)}/s`
}

const rubixLoaderColors = [
  RubixLoaderColor.RelayKit,
  RubixLoaderColor.Strfry,
  RubixLoaderColor.NostrRs,
  RubixLoaderColor.Blossom,
  RubixLoaderColor.Npanel,
]

const ServiceTypeIcon = ({ service, size, marginRight }: { service: any; size: number; marginRight?: number }) => {
  if (!service.icon) return null;
  const accent = serviceTypeToRubixLoaderColor(service.type, service.presetId);
  const tip = service.brokenPreset
    ? 'misconfigured service'
    : String(service.serviceType || service.type || 'service');
  return (
    <Tooltip label={tip} withArrow>
      <Box
        component="span"
        style={{
          display: 'inline-flex',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginRight: marginRight ?? 0,
          marginTop: size >= 22 ? 3 : undefined,
          color: accent,
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: Math.max(12, size - 6), lineHeight: 1 }}>{service.icon}</span>
      </Box>
    </Tooltip>
  );
};

const CogMenu = ({
  items,
  showLabel = false,
}: {
  items: { label: string; onClick: () => void; danger?: boolean }[];
  /** Bordered “Actions” button; otherwise icon-only chevron (overview / tight rows). */
  showLabel?: boolean;
}) => (
  <Menu shadow="md" width={200} position="bottom-end">
    <Menu.Target>
      {showLabel ? (
        <Button variant="default" size="sm" rightSection={<IconChevronDown size={14} />}>
          actions
        </Button>
      ) : (
        <Tooltip label="actions" position="bottom">
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="actions">
            <IconChevronDown size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </Menu.Target>
    <Menu.Dropdown>
      {items.map((item, i) => (
        <Menu.Item
          key={i}
          color={item.danger ? 'red' : undefined}
          onClick={item.onClick}
        >
          {item.label}
        </Menu.Item>
      ))}
    </Menu.Dropdown>
  </Menu>
);

const ConfirmModal = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) => (
  <Modal opened onClose={onCancel} title={title} centered size="sm">
    <Text size="sm" c="dimmed" mb="lg">
      {message}
    </Text>
    <Group justify="flex-end">
      <Button variant="default" onClick={onCancel}>cancel</Button>
      <Button color={danger ? 'red' : 'relaykit'} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </Group>
  </Modal>
);

const InlineMetric = ({ label, value, icon }: { label: string; value: string; icon: ReactNode }) => (
  <Tooltip label={label} withArrow>
    <Group
      gap={5}
      wrap="nowrap"
      style={{
        width: 'fit-content',
      }}
    >
      <Box c="dimmed" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {icon}
      </Box>
      <Text size="xs" c="dimmed" fw={500} lh={1.1} style={{ whiteSpace: 'nowrap' }}>{value}</Text>
    </Group>
  </Tooltip>
);

const FlowDot = ({ label, value, color }: { label: string; value: number | null; color: string }) => {
  const active = Number(value) > 0
  return (
    <Tooltip label={`${label}: ${formatBytesPerSecondRounded(value)}`} withArrow>
      <Box
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          border: '1px solid var(--mantine-color-gray-5)',
          background: active ? `var(--mantine-color-${color}-5)` : 'transparent',
        }}
      />
    </Tooltip>
  )
}

const MoveServiceModal = ({
  serviceName,
  currentLocation,
  currentEnvironmentId,
  targets,
  onSelect,
  onClose,
}: {
  serviceName: string;
  currentLocation: string;
  currentEnvironmentId: string;
  targets: { environmentId: string; label: string }[];
  onSelect: (environmentId: string) => void;
  onClose: () => void;
}) => {
  const [selectedTarget, setSelectedTarget] = useState<{ environmentId: string; label: string; fullLabel: string } | null>(null);
  const groupedTargets = targets.reduce<Record<string, { environmentId: string; label: string; fullLabel: string }[]>>((acc, target) => {
    const [projectName, environmentName] = target.label.includes(' → ')
      ? target.label.split(' → ')
      : ['Other', target.label];
    if (!acc[projectName]) acc[projectName] = [];
    acc[projectName].push({
      environmentId: target.environmentId,
      label: environmentName || target.label,
      fullLabel: target.label,
    });
    return acc;
  }, {});

  const groupNames = Object.keys(groupedTargets);

  return (
    <Modal opened onClose={onClose} title="move service" size="lg" centered>
      <Text size="sm" c="dimmed" mb="md">
        Select a target environment for <Text component="span" ff="monospace">{serviceName}</Text>{' '}
        <Text component="span" fs="italic">(currently in {currentLocation})</Text>.
      </Text>
      <Stack gap="sm" maw={700} style={{ maxHeight: 300, overflowY: 'auto' }}>
        {groupNames.map((groupName) => (
          <Paper key={groupName} p="sm" withBorder>
            <Text size="xs" tt="uppercase" fw={500} c="dimmed" mb="xs">{groupName}</Text>
            <Group gap="xs">
              {groupedTargets[groupName].map((target) => (
                <Badge
                  key={target.environmentId}
                  variant={selectedTarget?.environmentId === target.environmentId ? 'filled' : 'outline'}
                  color={target.environmentId === currentEnvironmentId ? 'gray' : 'relaykit'}
                  style={{ cursor: target.environmentId === currentEnvironmentId ? 'not-allowed' : 'pointer' }}
                  onClick={() => {
                    if (target.environmentId !== currentEnvironmentId) {
                      setSelectedTarget((prev) =>
                        prev?.environmentId === target.environmentId ? null : target
                      );
                    }
                  }}
                >
                  {target.label}
                </Badge>
              ))}
            </Group>
          </Paper>
        ))}
      </Stack>
      <Paper p="sm" withBorder mt="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Move to environment:{' '}
            <Text component="span" fw={500}>{selectedTarget ? selectedTarget.fullLabel : '—'}</Text>
          </Text>
          <Button
            color="relaykit"
            disabled={!selectedTarget}
            onClick={() => selectedTarget && onSelect(selectedTarget.environmentId)}
          >
            confirm move
          </Button>
        </Group>
      </Paper>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>cancel</Button>
      </Group>
    </Modal>
  );
};

const AddServiceButton = ({
  preselectedEnvironmentId,
  compact = false,
}: {
  preselectedEnvironmentId?: string;
  compact?: boolean;
}) => {
  const { triggerRefresh, refreshTrigger } = useRefreshServices();
  const { npub } = useAuth();
  const [presets, setPresets] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<{ environmentId: string; label: string }[]>([]);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<any>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [deployConfig, setDeployConfig] = useState<Record<string, string>>({});
  const [deployResult, setDeployResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [presetsResult, projectsResult] = await Promise.all([
          trpc.listPresets.query(undefined),
          trpc.listProjects.query(),
        ]);
        if (!alive) return;
        setPresets(presetsResult);
        setEnvironments(
          projectsResult.flatMap((p: any) =>
            p.environments.map((e: any) => ({ environmentId: e.environmentId, label: `${p.name} → ${e.name}` })),
          ),
        );
      } catch (error) {
        console.error('Error loading deploy data:', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshTrigger]);

  const handleSelectPreset = (preset: any) => {
    setSelectedPreset(preset);
    const isNsite = isNpanelType(preset.id);
    const defaults = isNsite
      ? buildNsiteDeployDefaults(preset, npub)
      : Object.fromEntries(
          preset.requiredConfig
            .filter((f: any) => f.default !== undefined && f.default !== null && String(f.default).length > 0)
            .map((f: any) => [f.id, f.default]),
        );
    setDeployConfig(defaults);
    setDeployResult(null);
    setSelectedEnvironmentId(preselectedEnvironmentId ?? '');
    setDeployModalOpen(true);
  };

  const handleDeploy = async (payload: { environmentId: string; config: Record<string, string> }) => {
    setLoading(true);
    setDeployResult(null);
    try {
      const isNsite = isNpanelType(selectedPreset.id);
      const config = isNsite ? prepareNsiteConfigForSave(payload.config) : payload.config;
      await trpc.deployService.mutate({
        presetId: selectedPreset.id,
        config,
        environmentId: payload.environmentId || undefined,
      });
      toast.success('Service deployment started!');
      setDeployModalOpen(false);
      triggerRefresh();
    } catch (error: any) {
      console.error('Deploy error:', error);
      setDeployResult({ error: error.message });
      toast.error(`Deploy failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Menu shadow="md" width={280} position="bottom-end">
        <Menu.Target>
          <Button
            variant="outline"
            color="relaykit"
            size={compact ? 'xs' : 'sm'}
            rightSection={<IconChevronDown size={compact ? 12 : 14} />}
          >
            add service
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {presets.map((preset) => (
            <Menu.Item
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              leftSection={preset.icon}
              rightSection={preset.repo ? (
                <Anchor href={preset.repo} target="_blank" size="xs" onClick={(e) => e.stopPropagation()}>
                  Repo ↗
                </Anchor>
              ) : undefined}
            >
              <Text fw={500} size="sm">{preset.name}</Text>
              {preset.description && <Text size="xs" c="dimmed">{preset.description}</Text>}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {deployModalOpen && selectedPreset && (
        <DeployModal
          preset={selectedPreset}
          initialConfig={deployConfig}
          loading={loading}
          deployResult={deployResult}
          onSubmit={handleDeploy}
          onClose={() => setDeployModalOpen(false)}
          environments={environments}
          initialEnvironmentId={selectedEnvironmentId}
          ownerPubkeyHex={npub}
        />
      )}
    </>
  );
};

const RelayExplorerModal = ({ relayUrl, onClose }: { relayUrl: string; onClose: () => void }) => {
  const explorerUrl = `https://relay-explorer.shakespeare.wtf/?relay=${encodeURIComponent(relayUrl)}`;
  return (
    <Modal opened onClose={onClose} title="Relay Explorer" size="90vw" centered styles={{ body: { height: '80vh', padding: 0 }, content: { height: '85vh' } }}>
      <iframe src={explorerUrl} style={{ flex: 1, width: '100%', border: 'none', height: '100%' }} title="Relay Explorer" />
    </Modal>
  );
};

const BlossomExplorerModal = ({ serverUrl, onClose }: { serverUrl: string; onClose: () => void }) => {
  const explorerUrl = `https://blossom-explorer.shakespeare.wtf/?server=${encodeURIComponent(serverUrl)}`;
  return (
    <Modal opened onClose={onClose} title="Blossom Explorer" size="90vw" centered styles={{ body: { height: '80vh', padding: 0 }, content: { height: '85vh' } }}>
      <iframe src={explorerUrl} style={{ flex: 1, width: '100%', border: 'none', height: '100%' }} title="Blossom Explorer" />
    </Modal>
  );
};

const ServiceCard = ({
  service,
  serverIp,
  editingDomain,
  newDomainHost,
  setNewDomainHost,
  onEditDomain,
  onSaveDomain,
  onCancelEdit,
  onCopy,
  onStart,
  onStop,
  onDelete,
  onEditConfig,
  onMove,
  allEnvironments,
  showDetails,
  summary,
}: {
  service: any;
  serverIp: string | null;
  editingDomain: { composeId: string; domainId: string; currentHost: string } | null;
  newDomainHost: string;
  setNewDomainHost: (v: string) => void;
  onEditDomain: (composeId: string, domain: any) => void;
  onSaveDomain: () => void;
  onCancelEdit: () => void;
  onCopy: (text: string) => void;
  onStart: (composeId: string) => void;
  onStop: (composeId: string) => void;
  onDelete: (composeId: string, name: string) => void;
  onEditConfig: (service: any) => void;
  onMove: (composeId: string, targetEnvironmentId: string) => void;
  allEnvironments: { environmentId: string; label: string }[];
  showDetails: boolean;
  summary?: {
    cpuPct: number | null;
    memoryUsedPct: number | null;
    memoryUsedBytes: number | null;
    memoryTotalBytes: number | null;
    storageUsedBytes: number | null;
    networkInBps: number | null;
    networkOutBps: number | null;
    blockReadBps: number | null;
    blockWriteBps: number | null;
  } | null;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light');
  const serviceCardBg = colorScheme === 'dark' ? theme.colors.dark[5] : theme.white;
  const [showExplorer, setShowExplorer] = useState(false);
  const [showBlossomExplorer, setShowBlossomExplorer] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const domain = service.domains?.[0];
  const isEditing = editingDomain?.domainId === domain?.domainId;
  const httpsUrl = domain ? `https://${domain.host}` : '';
  const statusNorm = String(service.status ?? '').toLowerCase();
  const moveTargets = allEnvironments.filter((env) => env.environmentId !== service.environmentId);
  const manageItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (domain && !isEditing) {
    manageItems.push({ label: 'edit domain', onClick: () => onEditDomain(service.composeId, domain) });
  }
  if (service.canEditConfig) {
    manageItems.push({ label: 'edit config', onClick: () => onEditConfig(service) });
  }
  if (statusNorm === 'running') {
    manageItems.push({ label: 'stop', onClick: () => onStop(service.composeId) });
  } else {
    manageItems.push({ label: 'start', onClick: () => onStart(service.composeId) });
  }
  if (moveTargets.length > 0) {
    manageItems.push({ label: 'move service…', onClick: () => setShowMoveModal(true) });
  }
  manageItems.push({ label: 'delete', onClick: () => onDelete(service.composeId, service.name), danger: true });

  const statusColor = statusNorm === 'running' ? 'green' : statusNorm === 'error' ? 'red' : 'gray';
  const isBrokenPreset = !!service.brokenPreset;
  const brokenCardStyle = isBrokenPreset ? { background: 'rgba(255, 59, 48, 0.06)' } : undefined;
  const brokenContentStyle = isBrokenPreset ? { opacity: 0.35, pointerEvents: 'none' as const } : undefined;
  const brokenOverlay = isBrokenPreset ? (
    <Box
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 59, 48, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <Paper p="sm" shadow="sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
        <Group gap={6} align="center" justify="center" wrap="nowrap">
          <IconAlertTriangle size={16} color="var(--mantine-color-red-7)" />
          <Text size="sm" fw={700} c="red">
            misconfigured
          </Text>
      </Group>
      </Paper>
    </Box>
  ) : null;
  const showNip42Badge = isRelayType(service.type) && service.presetId === 'nostr-rs-relay';
  const nip42Enabled = !!service.requireNip42;
  const nip42Badge = showNip42Badge ? (
    <Badge
      variant="light"
      color={nip42Enabled ? 'green' : 'gray'}
      size="xs"
      w="fit-content"
      leftSection={<IconKey size={11} />}
      style={nip42Enabled ? undefined : { textDecoration: 'line-through' }}
    >
      nip-42
    </Badge>
  ) : null;
  const summaryView = summary ?? {
    cpuPct: null,
    memoryUsedPct: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    storageUsedBytes: null,
    networkInBps: null,
    networkOutBps: null,
    blockReadBps: null,
    blockWriteBps: null,
  }

  const detailsContentProps = {
    service,
    serverIp,
    editingDomain,
    newDomainHost,
    setNewDomainHost,
    onSaveDomain,
    onCancelEdit,
    onCopy,
    onOpenRelayExplorer: () => setShowExplorer(true),
    onOpenBlossomExplorer: () => setShowBlossomExplorer(true),
    omitHostEditor: !!(isEditing && domain),
  };

  return (
    <>
      {showExplorer && domain && (
        <RelayExplorerModal relayUrl={domain.host} onClose={() => setShowExplorer(false)} />
      )}
      {showBlossomExplorer && domain && (
        <BlossomExplorerModal serverUrl={httpsUrl} onClose={() => setShowBlossomExplorer(false)} />
      )}
      {showMoveModal && (
        <MoveServiceModal
          serviceName={service.name}
          currentLocation={`${service.projectName} → ${service.environmentName}`}
          currentEnvironmentId={service.environmentId}
          targets={allEnvironments}
          onClose={() => setShowMoveModal(false)}
          onSelect={(environmentId) => {
            setShowMoveModal(false);
            onMove(service.composeId, environmentId);
          }}
        />
      )}
      <Paper
        withBorder
        p={showDetails ? 'md' : 'sm'}
        bg={serviceCardBg}
        style={
          showDetails
            ? brokenCardStyle
            : {
                width: 260,
                maxWidth: '100%',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
                ...(brokenCardStyle ?? {}),
              }
        }
      >
        {brokenOverlay}
        {showDetails ? (
          <>
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm" style={{ minHeight: INLINE_TITLE_ROW_H }}>
              <Group
                align="center"
                gap="xs"
                wrap="nowrap"
                style={{ minWidth: 0, flex: 1, minHeight: INLINE_TITLE_ROW_H, ...brokenContentStyle }}
              >
                <ServiceTypeIcon service={service} size={20} marginRight={6} />
                {isEditing && domain ? (
                  <InlineTextEditRow
                    value={newDomainHost}
                    onChange={setNewDomainHost}
                    onSave={() => void onSaveDomain()}
                    onCancel={onCancelEdit}
                    autoFocus
                    density="comfortable"
                    inputStyle={{ flex: 1, minWidth: 0 }}
                    rowStyle={{ flex: 1, minWidth: 0 }}
                    trailing={<Badge variant="filled" color={statusColor} size="sm">{statusNorm}</Badge>}
                  />
                ) : (
                  <ServiceHostTitleView
                    title={domain ? domain.host : service.name}
                    density="comfortable"
                    domain={domain}
                    canEditConfig={service.canEditConfig}
                    composeId={service.composeId}
                    service={service}
                    onEditDomain={onEditDomain}
                    onEditConfig={onEditConfig}
                    rowStyle={{ flex: 1, minWidth: 0 }}
                    trailing={
                      <Group gap={6} wrap="nowrap">
                        <Badge variant="filled" color={statusColor} size="sm">{statusNorm}</Badge>
                        {nip42Badge}
                      </Group>
                    }
                  />
                )}
              </Group>
              <Box style={{ position: 'relative', zIndex: 3 }}>
                <CogMenu showLabel items={manageItems} />
              </Box>
            </Group>
            <Stack mt="md" style={brokenContentStyle}>
              <ServiceDetailsContent {...detailsContentProps} />
            </Stack>
          </>
        ) : (
          <>
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                <Group align="flex-start" gap="xs" style={{ minWidth: 0, flex: 1, ...brokenContentStyle }}>
                  <ServiceTypeIcon service={service} size={22} />
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    {isEditing && domain ? (
                      <InlineTextEditRow
                        value={newDomainHost}
                        onChange={setNewDomainHost}
                        onSave={() => void onSaveDomain()}
                        onCancel={onCancelEdit}
                        autoFocus
                        inputStyle={{ flex: 1, minWidth: 0 }}
                        rowStyle={{ width: '100%' }}
                      />
                    ) : (
                      <ServiceHostTitleView
                        title={domain ? domain.host : service.name}
                        density="compact"
                        domain={domain}
                        canEditConfig={service.canEditConfig}
                        composeId={service.composeId}
                        service={service}
                        onEditDomain={onEditDomain}
                        onEditConfig={onEditConfig}
                        rowStyle={{ minWidth: 0, flex: 1 }}
                      />
                    )}
                    <Group gap={6} wrap="wrap">
                      <Badge variant="filled" color={statusColor} size="xs" w="fit-content">{statusNorm}</Badge>
                      {nip42Badge}
                    </Group>
                    {statusNorm === 'running' && (
                      <Stack gap={4}>
                        <Group gap={8} wrap="nowrap">
                          <InlineMetric
                            label={`CPU usage: ${formatPercentRounded(summaryView.cpuPct)}`}
                            value={formatPercentRounded(summaryView.cpuPct)}
                            icon={<IconCpu size={12} />}
                          />
                          <Text size="xs" c="gray.5">•</Text>
                          <InlineMetric
                            label={`Memory used: ${formatBytesRounded(summaryView.memoryUsedBytes)} / ${formatBytesRounded(summaryView.memoryTotalBytes)} (${formatPercentRounded(summaryView.memoryUsedPct)})`}
                            value={formatBytesRounded(summaryView.memoryUsedBytes)}
                            icon={<IconServer size={12} />}
                          />
                          <Text size="xs" c="gray.5">•</Text>
                          <InlineMetric
                            label={`Storage used on disk: ${formatBytesRounded(summaryView.storageUsedBytes)} (writable layer)`}
                            value={formatBytesRounded(summaryView.storageUsedBytes)}
                            icon={<IconDatabase size={12} />}
                          />
                        </Group>
                        <Group gap={7} wrap="nowrap">
                          <FlowDot label="Network inbound throughput" value={summaryView.networkInBps} color="blue" />
                          <FlowDot label="Network outbound throughput" value={summaryView.networkOutBps} color="blue" />
                          <Text size="xs" c="gray.5">•</Text>
                          <FlowDot label="Disk read throughput" value={summaryView.blockReadBps} color="grape" />
                          <FlowDot label="Disk write throughput" value={summaryView.blockWriteBps} color="grape" />
                        </Group>
                      </Stack>
                    )}
                  </Stack>
                </Group>
                <Box pt={2} style={{ position: 'relative', zIndex: 3 }}>
                  <CogMenu items={manageItems} />
                </Box>
              </Group>
              <Box style={brokenContentStyle}>
                {domain ? (
                  <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
                    <Anchor href={httpsUrl} target="_blank" size="xs" c="relaykit" truncate style={{ flex: 1, minWidth: 0 }} title={httpsUrl}>
                      {httpsUrl} ↗
                    </Anchor>
                    <Tooltip label="Copy URL">
                      <ActionIcon variant="subtle" size="sm" onClick={() => onCopy(httpsUrl)}>
                        <IconCopy size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">No domain configured</Text>
                )}
                <Group gap="xs" wrap="wrap">
                  {domain && isRelayType(service.type) && (
                    <Button
                      size="xs"
                      variant="light"
                      color="relaykit"
                      onClick={() => setShowExplorer(true)}
                      rightSection={<IconExternalLink size={12} />}
                    >
                      explorer
                    </Button>
                  )}
                  {domain && service.type === SERVICE_TYPE.BLOSSOM && (
                    <Button
                      size="xs"
                      variant="light"
                      color="relaykit"
                      onClick={() => setShowBlossomExplorer(true)}
                      rightSection={<IconExternalLink size={12} />}
                    >
                      explorer
                    </Button>
                  )}
                  <Button size="xs" variant="light" color="gray" onClick={() => setDetailsModalOpen(true)}>
                    details
                  </Button>
                </Group>
              </Box>
            </Stack>
            <Modal
              opened={detailsModalOpen}
              onClose={() => setDetailsModalOpen(false)}
              title={
                <Group justify="space-between" align="center" gap="sm" wrap="nowrap" w="100%" maw="calc(100% - 2.5rem)" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                  {isEditing && domain ? (
                    <InlineTextEditRow
                      value={newDomainHost}
                      onChange={setNewDomainHost}
                      onSave={() => void onSaveDomain()}
                      onCancel={onCancelEdit}
                      autoFocus
                      density="comfortable"
                      inputStyle={{ flex: 1, minWidth: 0 }}
                      rowStyle={{ flex: 1, minWidth: 0 }}
                    />
                  ) : (
                    <ServiceHostTitleView
                      title={domain ? domain.host : service.name}
                      density="comfortable"
                      domain={domain}
                      canEditConfig={service.canEditConfig}
                      composeId={service.composeId}
                      service={service}
                      onEditDomain={onEditDomain}
                      onEditConfig={onEditConfig}
                      rowStyle={{ flex: 1, minWidth: 0 }}
                      trailing={nip42Badge}
                    />
                  )}
                  <CogMenu showLabel items={manageItems} />
                </Group>
              }
              size="82vw"
              centered
              styles={{
                header: { alignItems: 'center' },
                title: { flex: 1, marginRight: 0, width: '100%' },
                ...serviceDetailsModalStyles,
              }}
            >
              <ServiceDetailsModalContext.Provider value={true}>
                <ServiceDetailsContent {...detailsContentProps} />
              </ServiceDetailsModalContext.Provider>
            </Modal>
          </>
        )}
      </Paper>
    </>
  );
};

const ServiceList = () => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme('light');
  const projectBorderColor = colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[4];
  const projectBg = colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0];
  const envBorderColor = colorScheme === 'dark' ? theme.colors.dark[3] : theme.colors.gray[4];
  const envBg = colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[1];
  const { refreshTrigger, triggerRefresh } = useRefreshServices();
  const { setDokployConnectionError, setDokployReady } = useDokploy();
  const { logout } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [serviceOverviewSummaries, setServiceOverviewSummaries] = useState<
    Record<string, {
      cpuPct: number | null;
      memoryUsedPct: number | null;
      memoryUsedBytes: number | null;
      memoryTotalBytes: number | null;
      storageUsedBytes: number | null;
      networkInBps: number | null;
      networkOutBps: number | null;
      blockReadBps: number | null;
      blockWriteBps: number | null;
    }>
  >({});

  const [editingDomain, setEditingDomain] = useState<{ composeId: string; domainId: string; currentHost: string } | null>(null);
  const [newDomainHost, setNewDomainHost] = useState('');
  const [editingConfigService, setEditingConfigService] = useState<any | null>(null);
  const [editingConfigFields, setEditingConfigFields] = useState<any[]>([]);
  const [editingConfigValues, setEditingConfigValues] = useState<Record<string, string>>({});
  const [loadingConfigModal, setLoadingConfigModal] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newEnvTarget, setNewEnvTarget] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [renamingEnvId, setRenamingEnvId] = useState<string | null>(null);
  const [renameEnvValue, setRenameEnvValue] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameProjectValue, setRenameProjectValue] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ type: 'deleteGroup'; projectId: string; name: string } | { type: 'deleteEnv'; environmentId: string; name: string } | { type: 'deleteService'; composeId: string; name: string } | null>(null);

  const allEnvironments: { environmentId: string; label: string }[] = projects.flatMap((p: any) =>
    p.environments.map((e: any) => ({ environmentId: e.environmentId, label: `${p.name} → ${e.name}` }))
  );

  const loadData = async () => {
    setDokployConnectionError(null);
    try {
      const [svcResult, projResult, ipResult] = await Promise.all([
        trpc.listServices.query(),
        trpc.listProjects.query(),
        trpc.getServerIp.query().catch(() => null),
      ]);
      setServices(svcResult);
      setProjects(projResult);
      setServerIp(ipResult?.ip ?? null);
      setDokployReady(true);
    } catch (error: any) {
      const code = error?.data?.code;
      const msg = error?.message || '';
      if (code === 'UNAUTHORIZED' && msg.includes('Authentication required')) {
        logout();
        return;
      }
      setDokployConnectionError(msg || 'Could not load services. Run the setup script (see README).');
      setServices([]);
      setProjects([]);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  useEffect(() => {
    if (showDetails) return;
    const runningComposeIds = services
      .filter((s: any) => s.status === 'running' && s.composeId)
      .map((s: any) => s.composeId);
    if (runningComposeIds.length === 0) {
      setServiceOverviewSummaries({});
      return;
    }

    let mounted = true;
    const loadSummaries = async () => {
      try {
        const result = await trpc.getServicesInsights.query({ composeIds: runningComposeIds });
        if (!mounted) return;
        const next: Record<string, {
          cpuPct: number | null;
          memoryUsedPct: number | null;
          memoryUsedBytes: number | null;
          memoryTotalBytes: number | null;
          storageUsedBytes: number | null;
          networkInBps: number | null;
          networkOutBps: number | null;
          blockReadBps: number | null;
          blockWriteBps: number | null;
        }> = {};
        for (const composeId of runningComposeIds) {
          next[composeId] = {
            cpuPct: null,
            memoryUsedPct: null,
            memoryUsedBytes: null,
            memoryTotalBytes: null,
            storageUsedBytes: null,
            networkInBps: null,
            networkOutBps: null,
            blockReadBps: null,
            blockWriteBps: null,
          }
          const insight = result[composeId];
          if (!insight) continue;
          const history = insight.history || [];
          const curr = insight.current;
          const prev = history.length >= 2 ? history[history.length - 2] : null;
          const elapsedSec = prev ? Math.max((curr.ts - prev.ts) / 1000, 1) : 1;
          const networkInBps = prev ? Math.max(0, (curr.networkInBytes - prev.networkInBytes) / elapsedSec) : 0;
          const networkOutBps = prev ? Math.max(0, (curr.networkOutBytes - prev.networkOutBytes) / elapsedSec) : 0;
          const blockReadBps = prev ? Math.max(0, (curr.blockReadBytes - prev.blockReadBytes) / elapsedSec) : 0;
          const blockWriteBps = prev ? Math.max(0, (curr.blockWriteBytes - prev.blockWriteBytes) / elapsedSec) : 0;
          next[composeId] = {
            cpuPct: curr.cpuPct,
            memoryUsedPct: curr.memoryUsedPct,
            memoryUsedBytes: curr.memoryUsedBytes,
            memoryTotalBytes: curr.memoryTotalBytes,
            storageUsedBytes: curr.storageUsedBytes,
            networkInBps,
            networkOutBps,
            blockReadBps,
            blockWriteBps,
          };
        }
        setServiceOverviewSummaries(next);
      } catch {
        if (!mounted) return;
      }
    };

    void loadSummaries();
    const poll = window.setInterval(() => {
      void loadSummaries();
    }, 7000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, [services, showDetails]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const openDeleteServiceConfirm = (composeId: string, serviceName: string) => {
    setConfirmModal({ type: 'deleteService', composeId, name: serviceName });
  };

  const handleStopService = async (composeId: string) => {
    try {
      await trpc.stopService.mutate({ composeId });
      await loadData();
      toast.success('Service stopped');
    } catch (error: any) {
      toast.error(`Failed to stop service: ${error.message}`);
    }
  };

  const handleStartService = async (composeId: string) => {
    try {
      await trpc.startService.mutate({ composeId });
      await loadData();
      toast.success('Service started');
    } catch (error: any) {
      toast.error(`Failed to start service: ${error.message}`);
    }
  };

  const handleMoveService = async (composeId: string, targetEnvironmentId: string) => {
    try {
      await trpc.moveService.mutate({ composeId, targetEnvironmentId });
      toast.success('Service moved');
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to move service: ${error.message}`);
    }
  };

  const handleEditDomain = (composeId: string, domain: any) => {
    setEditingDomain({ composeId, domainId: domain.domainId, currentHost: domain.host });
    setNewDomainHost(domain.host);
  };

  const handleSaveDomain = async () => {
    if (!editingDomain) return;
    try {
      await trpc.updateServiceDomain.mutate({
        composeId: editingDomain.composeId,
        domainId: editingDomain.domainId,
        newHost: newDomainHost
      });
      setEditingDomain(null);
      await loadData();
      toast.success('Domain updated successfully');
    } catch (error: any) {
      toast.error(`Failed to update domain: ${error.message}`);
    }
  };

  const handleEditConfig = async (service: any) => {
    setLoadingConfigModal(true);
    try {
      const result = await trpc.getServiceConfig.query({ composeId: service.composeId });
      setEditingConfigService(service);
      setEditingConfigFields(result.fields || []);
      setEditingConfigValues(result.config || {});
    } catch (error: any) {
      toast.error(`Failed to load service config: ${error.message}`);
    } finally {
      setLoadingConfigModal(false);
    }
  };

  const handleSaveConfig = async (nextValues: Record<string, string>) => {
    if (!editingConfigService) return;
    setSavingConfig(true);
    try {
      const configToSave =
        isNpanelType(editingConfigService.type)
          ? prepareNsiteConfigForSave(nextValues)
          : nextValues;
      await trpc.updateServiceConfig.mutate({
        composeId: editingConfigService.composeId,
        config: configToSave,
      });
      toast.success('Service config updated and redeploy started');
      setEditingConfigService(null);
      setEditingConfigFields([]);
      setEditingConfigValues({});
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to update config: ${error.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await trpc.createProject.mutate({ name: newProjectName.trim() });
      setNewProjectName('');
      toast.success('Group created');
      triggerRefresh();
    } catch (error: any) {
      toast.error(`Failed to create group: ${error.message}`);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateEnvironment = async (projectId: string) => {
    if (!newEnvName.trim()) return;
    try {
      await trpc.createEnvironment.mutate({ projectId, name: newEnvName.trim() });
      setNewEnvTarget(null);
      setNewEnvName('');
      toast.success('Environment created');
      triggerRefresh();
    } catch (error: any) {
      toast.error(`Failed to create environment: ${error.message}`);
    }
  };

  const handleRenameEnvironment = async (environmentId: string) => {
    if (!renameEnvValue.trim()) return;
    try {
      await trpc.renameEnvironment.mutate({ environmentId, name: renameEnvValue.trim() });
      setRenamingEnvId(null);
      setRenameEnvValue('');
      toast.success('Environment renamed');
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to rename environment: ${error.message}`);
    }
  };

  const openDeleteGroupConfirm = (projectId: string, projectName: string) => {
    setConfirmModal({ type: 'deleteGroup', projectId, name: projectName });
  };

  const openDeleteEnvConfirm = (environmentId: string, envName: string) => {
    setConfirmModal({ type: 'deleteEnv', environmentId, name: envName });
  };

  const handleConfirmDelete = async () => {
    if (!confirmModal) return;
    if (confirmModal.type === 'deleteGroup') {
      try {
        await trpc.deleteProject.mutate({ projectId: confirmModal.projectId });
        toast.success('Group deleted');
        await loadData();
      } catch (error: any) {
        toast.error(`Failed to delete group: ${error.message}`);
      }
    } else if (confirmModal.type === 'deleteEnv') {
      try {
        await trpc.deleteEnvironment.mutate({ environmentId: confirmModal.environmentId });
        toast.success('Environment deleted');
        await loadData();
      } catch (error: any) {
        toast.error(`Failed to delete environment: ${error.message}`);
      }
    } else {
      try {
        await trpc.deleteService.mutate({ composeId: confirmModal.composeId });
        toast.success('Service deleted');
        await loadData();
      } catch (error: any) {
        toast.error(`Failed to delete service: ${error.message}`);
      }
    }
    setConfirmModal(null);
  };

  const handleRenameProject = async (projectId: string) => {
    if (!renameProjectValue.trim()) return;
    try {
      await trpc.renameProject.mutate({ projectId, name: renameProjectValue.trim() });
      setRenamingProjectId(null);
      setRenameProjectValue('');
      toast.success('Group renamed');
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to rename group: ${error.message}`);
    }
  };

  const grouped = projects.map((project: any) => ({
    ...project,
    environments: project.environments.map((env: any) => ({
      ...env,
      services: services.filter((s: any) => s.environmentId === env.environmentId),
    })),
  }));

  const isDefaultProject = (name: string) => name === 'relaykit.ungrouped';

  const displayProjectName = (name: string) => 
    name === 'relaykit.ungrouped' ? '' : name;
  const viewToggleBg = colorScheme === 'dark' ? '#111315' : theme.colors.gray[1];

  return (
    <Stack gap="xl">
      <Group justify="flex-end">
        <Box
          style={{
            border: 'none',
            background: viewToggleBg,
            paddingTop: 3,
            paddingBottom: 4,
            paddingInline: 4,
          }}
        >
          <SegmentedControl
            size="xs"
            color="relaykit"
            value={showDetails ? 'details' : 'overview'}
            onChange={(v) => setShowDetails(v === 'details')}
            data={[
              { label: 'overview', value: 'overview' },
              { label: 'details', value: 'details' },
            ]}
            styles={{
              root: {
                border: 'none',
                background: 'transparent',
                padding: 0,
              },
              indicator: {
                border: 'none',
                boxShadow: 'none',
              },
              control: {
                border: 'none',
              },
              label: {
                paddingInline: 18,
              },
            }}
          />
        </Box>
      </Group>

      {grouped.length === 0 ? (
        <Paper withBorder p="xl">
          <Stack align="center" gap="sm">
            <Text c="dimmed">No services yet.</Text>
            <Text size="sm" c="dimmed">Deploy your first relay or media server.</Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="md">
          {grouped.map((project: any) => {
            const projectItems = [
              {
                label: 'Add environment…',
                onClick: () => {
                  setNewEnvTarget(project.projectId);
                  setNewEnvName('');
                },
              },
              {
                label: 'Delete group',
                onClick: () => openDeleteGroupConfirm(project.projectId, project.name),
                danger: true,
              },
            ];
            return (
              <Paper
                key={project.projectId}
                withBorder
                p="md"
                style={{
                  backgroundColor: projectBg,
                  borderColor: projectBorderColor,
                }}
              >
                <Group justify="space-between" mb="md" wrap="wrap" align="center" w="100%" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                  {renamingProjectId === project.projectId ? (
                    <>
                      <InlineTextEditRow
                        value={renameProjectValue}
                        onChange={setRenameProjectValue}
                        onSave={() => handleRenameProject(project.projectId)}
                        onCancel={() => { setRenamingProjectId(null); setRenameProjectValue(''); }}
                        saveDisabled={!renameProjectValue.trim()}
                        autoFocus
                        inputStyle={{ flex: 1, minWidth: 120 }}
                        rowStyle={{ flex: 1, minWidth: 0 }}
                      />
                      <CogMenu items={projectItems} />
                    </>
                  ) : (
                    <>
                      <Group gap={4} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0, minHeight: INLINE_TITLE_ROW_H }}>
                        {displayProjectName(project.name) && (
                          <Text fw={600} fz="md" style={{ lineHeight: INLINE_TITLE_ROW_H, display: 'flex', alignItems: 'center' }}>
                            {displayProjectName(project.name)}
                          </Text>
                        )}
                        {displayProjectName(project.name) && !isDefaultProject(project.name) && (
                          <ActionIcon variant="subtle" size="xs" onClick={() => { setRenamingProjectId(project.projectId); setRenameProjectValue(project.name); }} aria-label="Rename group">
                            <IconPencil size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                      <CogMenu items={projectItems} />
                    </>
                  )}
                </Group>
                <Stack gap="sm">
                  {showDetails ? (
                    project.environments.map((env: any) => {
                      const isDefaultEnv = env.isDefault === true;
                      return (
                        <Card
                          key={env.environmentId}
                          withBorder
                          padding="sm"
                          style={{
                            backgroundColor: envBg,
                            borderColor: envBorderColor,
                            borderStyle: 'dashed',
                          }}
                        >
                          <Group justify="space-between" align="center" mb="xs" wrap="nowrap" w="100%" gap="xs" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                            {renamingEnvId === env.environmentId ? (
                              <InlineTextEditRow
                                value={renameEnvValue}
                                onChange={setRenameEnvValue}
                                onSave={() => handleRenameEnvironment(env.environmentId)}
                                onCancel={() => { setRenamingEnvId(null); setRenameEnvValue(''); }}
                                saveDisabled={!renameEnvValue.trim()}
                                autoFocus
                                inputStyle={{ width: rem(200), maxWidth: '100%', flexShrink: 1 }}
                                rowStyle={{ maxWidth: '100%' }}
                              />
                            ) : (
                              <>
                                <Group gap={4} wrap="nowrap" align="center" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                                  <Badge variant="light" color="relaykit" size="sm">{env.name}</Badge>
                                  {!isDefaultEnv && (
                                    <ActionIcon variant="subtle" size="xs" onClick={() => { setRenamingEnvId(env.environmentId); setRenameEnvValue(env.name); }} aria-label="Rename environment">
                                      <IconPencil size={14} />
                                    </ActionIcon>
                                  )}
                                </Group>
                                <CogMenu items={[
                                  { label: 'Delete environment', onClick: () => openDeleteEnvConfirm(env.environmentId, env.name), danger: true },
                                ]} />
                              </>
                            )}
                          </Group>
                          <Stack gap="sm">
                            {env.services.length === 0 ? (
                              <Text c="dimmed" size="sm" fs="italic">No services in this environment.</Text>
                            ) : (
                              env.services.map((service: any) => (
                                <ServiceCard
                                  key={service.composeId}
                                  service={service}
                                  serverIp={serverIp}
                                  editingDomain={editingDomain}
                                  newDomainHost={newDomainHost}
                                  setNewDomainHost={setNewDomainHost}
                                  onEditDomain={handleEditDomain}
                                  onSaveDomain={handleSaveDomain}
                                  onCancelEdit={() => setEditingDomain(null)}
                                  onCopy={copyToClipboard}
                                  onStart={handleStartService}
                                  onStop={handleStopService}
                                  onDelete={openDeleteServiceConfirm}
                                  onEditConfig={handleEditConfig}
                                  onMove={handleMoveService}
                                  allEnvironments={allEnvironments}
                                  showDetails={showDetails}
                                  summary={serviceOverviewSummaries[service.composeId] ?? null}
                                />
                              ))
                            )}
                            <Group justify="flex-end" wrap="wrap" gap="sm" align="center">
                              <AddServiceButton compact preselectedEnvironmentId={env.environmentId} />
                            </Group>
                          </Stack>
                        </Card>
                      );
                    })
                  ) : (
                    <>
                      <Group align="flex-start" gap="md" wrap="wrap">
                        {project.environments.map((env: any) => {
                          const isDefaultEnv = env.isDefault === true;
                          return (
                            <Box
                              key={env.environmentId}
                              style={{
                                flex: '0 1 auto',
                                minWidth: rem(200),
                                maxWidth: '100%',
                                border: `1px dashed ${envBorderColor}`,
                                borderRadius: 0,
                                backgroundColor: envBg,
                              }}
                            >
                              <Stack gap="sm" p="sm" pt="sm">
                                <Group justify="space-between" align="center" wrap="nowrap" gap="xs" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                                  {renamingEnvId === env.environmentId ? (
                                    <InlineTextEditRow
                                      value={renameEnvValue}
                                      onChange={setRenameEnvValue}
                                      onSave={() => handleRenameEnvironment(env.environmentId)}
                                      onCancel={() => { setRenamingEnvId(null); setRenameEnvValue(''); }}
                                      saveDisabled={!renameEnvValue.trim()}
                                      autoFocus
                                      inputStyle={{ width: rem(200), maxWidth: '100%', flexShrink: 1 }}
                                      rowStyle={{ maxWidth: '100%' }}
                                    />
                                  ) : (
                                    <>
                                      <Group gap={4} wrap="nowrap" align="center" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                                        <Badge variant="light" color="relaykit" size="sm">{env.name}</Badge>
                                        {!isDefaultEnv && (
                                          <ActionIcon variant="subtle" size="xs" onClick={() => { setRenamingEnvId(env.environmentId); setRenameEnvValue(env.name); }} aria-label="Rename environment">
                                            <IconPencil size={14} />
                                          </ActionIcon>
                                        )}
                                      </Group>
                                      <CogMenu items={[
                                        { label: 'Delete environment', onClick: () => openDeleteEnvConfirm(env.environmentId, env.name), danger: true },
                                      ]} />
                                    </>
                                  )}
                                </Group>
                              <Group gap="sm" wrap="wrap" align="flex-start">
                                {env.services.length === 0 ? (
                                  <Text c="dimmed" size="sm" fs="italic">No services</Text>
                                ) : (
                                  env.services.map((service: any) => (
                                    <ServiceCard
                                      key={service.composeId}
                                      service={service}
                                      serverIp={serverIp}
                                      editingDomain={editingDomain}
                                      newDomainHost={newDomainHost}
                                      setNewDomainHost={setNewDomainHost}
                                      onEditDomain={handleEditDomain}
                                      onSaveDomain={handleSaveDomain}
                                      onCancelEdit={() => setEditingDomain(null)}
                                      onCopy={copyToClipboard}
                                      onStart={handleStartService}
                                      onStop={handleStopService}
                                      onDelete={openDeleteServiceConfirm}
                                      onEditConfig={handleEditConfig}
                                      onMove={handleMoveService}
                                      allEnvironments={allEnvironments}
                                      showDetails={showDetails}
                                      summary={serviceOverviewSummaries[service.composeId] ?? null}
                                    />
                                  ))
                                )}
                              </Group>
                              <Group justify="flex-end">
                                <AddServiceButton compact preselectedEnvironmentId={env.environmentId} />
                              </Group>
                              </Stack>
                            </Box>
                          );
                        })}
                      </Group>
                    </>
                  )}
                  {newEnvTarget === project.projectId && (
                    <Group justify="flex-end" wrap="wrap">
                      <TextInput
                        size="xs"
                        placeholder="Environment name…"
                        value={newEnvName}
                        onChange={(e) => setNewEnvName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateEnvironment(project.projectId)}
                        style={{ width: 170 }}
                        autoFocus
                      />
                      <Button size="xs" color="relaykit" onClick={() => handleCreateEnvironment(project.projectId)} disabled={!newEnvName.trim()}>
                        Add
                      </Button>
                      <Button size="xs" variant="default" onClick={() => { setNewEnvTarget(null); setNewEnvName(''); }}>
                        Cancel
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Stack
        gap="md"
        pt="xl"
        mt="md"
        style={{
          borderTop: '1px solid var(--mantine-color-gray-4)',
        }}
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder p="md">
            <Text fw={500} size="sm" mb={4}>add a new group</Text>
            <Text size="xs" c="dimmed" mb="md">create a group to organise services within.</Text>
            <Group wrap="nowrap" align="flex-end">
              <TextInput
                style={{ flex: 1, minWidth: 0 }}
                placeholder="group name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
              <Button variant="outline" color="relaykit" onClick={handleCreateProject} loading={creatingProject} disabled={!newProjectName.trim()}>
                add group
              </Button>
            </Group>
          </Paper>
          <Paper withBorder p="md" id="add-service">
            <Text fw={500} size="sm" mb={4}>
              add service
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              deploy a relay or media server into a group.
            </Text>
            <Group justify="flex-start" wrap="wrap">
              <AddServiceButton />
            </Group>
          </Paper>
        </SimpleGrid>
      </Stack>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.type === 'deleteGroup' ? 'Delete group?' : confirmModal.type === 'deleteEnv' ? 'Delete environment?' : 'Delete service?'}
          message={confirmModal.type === 'deleteGroup'
            ? `Delete group "${confirmModal.name}" and all its environments and services?`
            : confirmModal.type === 'deleteEnv'
              ? `Delete environment "${confirmModal.name}" and all its services?`
              : `Delete service "${confirmModal.name}"?`}
          confirmLabel={confirmModal.type === 'deleteGroup' ? 'Delete group' : confirmModal.type === 'deleteEnv' ? 'Delete environment' : 'Delete service'}
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {(loadingConfigModal || editingConfigService) && (
        <ConfigEditModal
          loading={loadingConfigModal}
          service={editingConfigService}
          fields={editingConfigFields}
          initialValues={editingConfigValues}
          onSubmit={handleSaveConfig}
          onClose={() => {
            if (savingConfig) return;
            setEditingConfigService(null);
            setEditingConfigFields([]);
            setEditingConfigValues({});
          }}
          saving={savingConfig}
        />
      )}
    </Stack>
  );
};

const DeployModal = ({
  preset,
  initialConfig,
  loading,
  deployResult,
  onSubmit,
  onClose,
  environments,
  initialEnvironmentId,
  ownerPubkeyHex,
}: {
  preset: any;
  initialConfig: Record<string, string>;
  loading: boolean;
  deployResult: any;
  onSubmit: (payload: { environmentId: string; config: Record<string, string> }) => void | Promise<void>;
  onClose: () => void;
  environments: { environmentId: string; label: string }[];
  initialEnvironmentId: string;
  ownerPubkeyHex: string | null;
}) => {
  const byGroup = environments.reduce<Record<string, { environmentId: string; label: string }[]>>((acc, env) => {
    const [groupName, envName] = env.label.includes(' → ') ? env.label.split(' → ') : [env.label, ''];
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push({ environmentId: env.environmentId, label: envName || env.label });
    return acc;
  }, {});
  const groupNames = Object.keys(byGroup);
  const isNsite = isNpanelType(preset.id);
  const form = useForm<Record<string, string>>({
    initialValues: { environmentId: initialEnvironmentId || '', ...initialConfig },
    validateInputOnChange: true,
    validate: (values: Record<string, string>) => {
      const errors: Record<string, string> = {};
      if (!(values.environmentId || '').trim()) {
        errors.environmentId = 'Environment is required';
      }
      if (!isNsite) {
        for (const field of preset.requiredConfig || []) {
          if (!field.required || field.type === 'boolean') continue;
          if (!(values[field.id] || '').trim()) {
            errors[field.id] = `${field.name} is required`;
          }
        }
      }
      return errors;
    },
  });

  useEffect(() => {
    form.setValues({ environmentId: initialEnvironmentId || '', ...initialConfig });
    form.clearErrors();
  }, [initialEnvironmentId, initialConfig]);

  const canSubmit = !loading && form.isValid();

  const renderField = (field: any) => {
    if (field.type === 'boolean') {
      const checked = (form.values[field.id] || String(field.default || 'false')).toLowerCase() === 'true';
      return (
        <Switch
          key={field.id}
          label={field.name}
          description={field.description}
          checked={checked}
          onChange={(e) => form.setFieldValue(field.id, e.currentTarget.checked ? 'true' : 'false')}
        />
      );
    }

    return (
      <TextInput
        key={field.id}
        label={field.name}
        description={field.description}
        required={field.required}
        {...form.getInputProps(field.id)}
        value={form.values[field.id] ?? String(field.default ?? '')}
      />
    );
  };

  return (
    <Modal opened onClose={onClose} title={
      <Group gap="xs">
        {preset.icon}
        <Text fw={700}>Deploy {preset.name}</Text>
      </Group>
    } size="md" centered styles={{ body: { maxHeight: '85vh', overflow: 'auto' } }}>
      <Stack gap="md">
        {preset.description && <Text size="sm" c="dimmed">{preset.description}</Text>}
        <form
          onSubmit={form.onSubmit((values: Record<string, string>) => {
            const { environmentId, ...config } = values;
            void onSubmit({ environmentId, config });
          })}
        >
          <Stack gap="md">
            <Select
              label="Deploy into"
              placeholder="Select environment…"
              value={form.values.environmentId || null}
              onChange={(v) => form.setFieldValue('environmentId', v || '')}
              error={form.errors.environmentId}
              required
              data={groupNames.flatMap((groupName) => [
                { group: groupName, items: byGroup[groupName].map((env) => ({ value: env.environmentId, label: env.label })) }
              ])}
            />
            {isNsite ? (
              <NsiteDeployFields
                preset={preset}
                config={Object.fromEntries(Object.entries(form.values).filter(([k]) => k !== 'environmentId')) as Record<string, string>}
                setConfig={(next) => {
                  const prev = Object.fromEntries(Object.entries(form.values).filter(([k]) => k !== 'environmentId')) as Record<string, string>;
                  const resolved = typeof next === 'function' ? next(prev) : next;
                  for (const [key, value] of Object.entries(resolved)) {
                    form.setFieldValue(key, String(value ?? ''));
                  }
                }}
                ownerPubkeyHex={ownerPubkeyHex}
                autoFetchProfile
              />
            ) : (
              preset.requiredConfig.map(renderField)
            )}
            {deployResult && (
              <Paper color={deployResult.error ? 'red' : 'green'} p="md">
                <Text fw={700}>{deployResult.error ? 'Error:' : 'Success!'}</Text>
                <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(deployResult, null, 2)}</pre>
              </Paper>
            )}
            <Group justify="space-between">
              <Button variant="default" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" color="green" loading={loading} disabled={!canSubmit}>
                {loading ? 'Deploying...' : 'Deploy'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Modal>
  );
};

const ConfigEditModal = ({
  loading,
  service,
  fields,
  initialValues,
  onSubmit,
  onClose,
  saving,
}: {
  loading: boolean;
  service: any | null;
  fields: any[];
  initialValues: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
  saving: boolean;
}) => {
  const isNsite = isNpanelType(service?.type);
  const fakePreset = isNsite ? { id: SERVICE_TYPE.NPANEL, requiredConfig: fields } : null;
  const form = useForm<Record<string, string>>({
    initialValues,
    validateInputOnChange: true,
    validate: (vals: Record<string, string>) => {
      const errors: Record<string, string> = {};
      if (isNsite) return errors;
      for (const field of fields) {
        if (!field.required || field.type === 'boolean') continue;
        if (!(vals[field.id] || '').trim()) {
          errors[field.id] = `${field.name} is required`;
        }
      }
      return errors;
    },
  });

  useEffect(() => {
    form.setValues(initialValues);
    form.clearErrors();
  }, [initialValues]);

  const canSubmit = !saving && form.isValid();

  const renderConfigField = (field: any) => {
    if (field.type === 'boolean') {
      const checked = (form.values[field.id] || String(field.default || 'false')).toLowerCase() === 'true';
      return (
        <Switch
          key={field.id}
          label={field.name}
          description={field.description}
          checked={checked}
          onChange={(e) => form.setFieldValue(field.id, e.currentTarget.checked ? 'true' : 'false')}
        />
      );
    }

    return (
      <TextInput
        key={field.id}
        label={field.name}
        description={field.description}
        required={field.required}
        {...form.getInputProps(field.id)}
        value={form.values[field.id] ?? String(field.default ?? '')}
      />
    );
  };

  return (
    <Modal opened onClose={onClose} title="edit config" size="md" centered styles={{ body: { maxHeight: '85vh', overflow: 'auto' } }}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {service ? `Update environment config for ${service.name}` : 'Loading service config...'}
        </Text>
        {loading ? (
          <Text c="dimmed">Loading...</Text>
        ) : fields.length === 0 ? (
          <>
            <Text c="dimmed">No editable config fields for this service.</Text>
            <Button onClick={onClose} fullWidth>close</Button>
          </>
        ) : (
          <form onSubmit={form.onSubmit((vals: Record<string, string>) => void onSubmit(vals))}>
            <Stack gap="md">
              {isNsite && fakePreset ? (
                <NsiteDeployFields
                  preset={fakePreset}
                  config={form.values}
                  setConfig={(next) => {
                    const resolved = typeof next === 'function' ? next(form.values) : next;
                    for (const [key, value] of Object.entries(resolved)) {
                      form.setFieldValue(key, String(value ?? ''));
                    }
                  }}
                  ownerPubkeyHex={null}
                />
              ) : (
                fields.map(renderConfigField)
              )}
              <Group justify="space-between">
                <Button variant="default" onClick={onClose} disabled={saving}>
                  cancel
                </Button>
                <Button type="submit" color="green" loading={saving} disabled={!canSubmit}>
                  {saving ? 'saving…' : 'save + redeploy'}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  );
};

const LoginScreen = () => {
  const { login, hasNostrExtension, isLoading } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = async () => {
    setLoggingIn(true);
    try {
      await login();
      toast.success('Logged in successfully');
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" h="100vh">
        <Text size="xl">Loading...</Text>
      </Stack>
    );
  }

  return (
    <Stack align="center" justify="center" h="100vh" bg="dark.8">
      <Paper withBorder p="xl" maw={400} w="100%" bg="dark.7">
        <Title order={1} mb={8}>RelayKit</Title>
        <Text c="dimmed" mb="xl">Nostr service deployment platform</Text>

        {!hasNostrExtension ? (
          <Paper color="yellow" p="md" mb="md">
            <Text fw={700} mb={8}>Nostr Extension Required</Text>
            <Text size="sm" c="dimmed" mb="md">
              Please install a Nostr browser extension to continue:
            </Text>
            <Stack gap="xs">
              <Anchor href="https://getalby.com" target="_blank">
                Alby (Chrome, Firefox)
              </Anchor>
              <Anchor href="https://nos2x.org" target="_blank">
                nos2x (Chrome, Firefox)
              </Anchor>
              <Anchor href="https://blockcore.net/wallet" target="_blank">
                Blockcore (Chrome, Edge, Firefox, Brave)
              </Anchor>
            </Stack>
          </Paper>
        ) : (
          <Button size="lg" fullWidth onClick={handleLogin} loading={loggingIn} color="relaykit">
            Connect with Nostr
          </Button>
        )}
      </Paper>
    </Stack>
  );
};

const DokployConnectionAlert = ({ message }: { message: string }) => (
  <Paper color="red" p="md">
    <Text fw={700}>Dokploy connection problem</Text>
    <Text size="sm" mt="xs">{message}</Text>
    <Text size="sm" mt="xs" c="dimmed">
      To fix: run the setup script with your npub, or add a valid Dokploy API key to the bootstrap key file (see README).
    </Text>
  </Paper>
);

const ServicesPage = () => {
  const { dokployConnectionError, dokployReady } = useDokploy();

  if (dokployConnectionError) {
    return (
      <Stack gap="xl" p="xl">
        <DokployConnectionAlert message={dokployConnectionError} />
      </Stack>
    );
  }

  return (
    <Stack gap="xl" p="xl">
      <DokployInitialCheck />
      {!dokployReady ? (
        <Stack align="center" justify="center" gap="sm" style={{ minHeight: rem(480) }}>
          <RubixLoader size={144} colors={[RubixLoaderColor.RelayKit]} speed={1.35} />
          <Text size="sm" c="dimmed">loading services…</Text>
        </Stack>
      ) : (
        <ServiceList />
      )}
    </Stack>
  );
};

const AccountModal = ({ opened, onClose }: { opened: boolean; onClose: () => void }) => {
  const { npub } = useAuth();
  const { hex, npub: encodedNpub } = getIdentityKeys(npub);

  return (
    <Modal opened={opened} onClose={onClose} title="identity" size="md" centered>
      <Stack gap="md">
        <Paper withBorder p="md">
          <Stack gap="sm">
            {hex && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">hex</Text>
                  <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(hex)}>copy</Button>
                </Group>
                <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                  {hex}
                </Text>
              </Stack>
            )}
            {encodedNpub && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">npub</Text>
                  <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(encodedNpub)}>copy</Button>
                </Group>
                <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                  {encodedNpub}
                </Text>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Modal>
  );
};

const DebugPage = () => {
  const { npub, token } = useAuth();
  const { hex, npub: encodedNpub } = getIdentityKeys(npub);

  return (
    <Stack gap="xl" p="xl">
      <Paper withBorder p="md">
        <Text fw={500} mb="sm">identity</Text>
        <Stack gap="sm">
          {hex && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">hex</Text>
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(hex)}>copy</Button>
              </Group>
              <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {hex}
              </Text>
            </Stack>
          )}
          {encodedNpub && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">npub</Text>
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(encodedNpub)}>copy</Button>
              </Group>
              <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {encodedNpub}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={500}>dokploy key</Text>
            <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(token || '')}>copy</Button>
          </Group>
          <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
            {token || '—'}
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
};

const DokployInitialCheck = () => {
  const { setDokployConnectionError, setDokployReady } = useDokploy();
  const { logout } = useAuth();
  useEffect(() => {
    trpc.listServices
      .query()
      .then(() => setDokployReady(true))
      .catch((error: any) => {
        const code = error?.data?.code;
        const msg = error?.message || '';
        if (code === 'UNAUTHORIZED' && msg.includes('Authentication required')) {
          logout();
          return;
        }
        setDokployConnectionError(msg || 'Could not load services. Run the setup script (see README).');
      });
  }, [setDokployConnectionError, setDokployReady, logout]);
  return null;
};

const NavServerSummary = () => {
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof trpc.getServerInsights.query>> | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await trpc.getServerInsights.query();
        if (!mounted) return;
        setInsights(next);
      } catch {
        // Keep nav quiet if insights endpoint is unavailable.
      }
    };

    void load();
    const poll = window.setInterval(() => {
      void load();
    }, 10000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  if (!insights) return null;
  return (
    <Paper withBorder p="xs" mt="sm">
      <Text size="xs" fw={600} mb={4}>server</Text>
      <Group gap={8} wrap="nowrap">
        <InlineMetric
          label={`CPU usage: ${formatPercentRounded(insights.current.cpuPct)} (load ${Math.round(insights.current.load1)}/${Math.round(insights.current.load5)}/${Math.round(insights.current.load15)})`}
          value={formatPercentRounded(insights.current.cpuPct)}
          icon={<IconCpu size={12} />}
        />
        <Text size="xs" c="gray.5">•</Text>
        <InlineMetric
          label={`Memory usage: ${formatBytesRounded(insights.current.memoryUsedBytes)} / ${formatBytesRounded(insights.current.memoryTotalBytes)} (${formatPercentRounded(insights.current.memoryUsedPct)})`}
          value={formatBytesRounded(insights.current.memoryUsedBytes)}
          icon={<IconServer size={12} />}
        />
        <Text size="xs" c="gray.5">•</Text>
        <InlineMetric
          label={`Disk usage: ${formatPercentRounded(insights.current.diskUsedPct)} (${formatBytesRounded(insights.current.diskUsedBytes)} / ${formatBytesRounded(insights.current.diskTotalBytes)})`}
          value={formatBytesRounded(insights.current.diskUsedBytes)}
          icon={<IconDatabase size={12} />}
        />
      </Group>
    </Paper>
  );
};

const AppContent = () => {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [mobileMenuOpened, { toggle: toggleMobileMenu, close: closeMobileMenu }] = useDisclosure(false);
  const [accountModalOpen, { open: openAccountModal, close: closeAccountModal }] = useDisclosure(false);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppShell
        header={{ height: 60 }}
        navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !mobileMenuOpened } }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group gap="sm" align="center">
              <Burger opened={mobileMenuOpened} onClick={toggleMobileMenu} hiddenFrom="sm" size="sm" />
              <Box style={{ lineHeight: 0, flexShrink: 0, height: 34, display: 'inline-flex', alignItems: 'center' }}>
                <RubixLoader
                  size={48}
                  speed={0.9}
                  colors={rubixLoaderColors}
                />
              </Box>
              <Title
                order={3}
                c="relaykit"
                className="brand-title"
                style={{
                  fontSize: rem(30),
                  lineHeight: '34px',
                  margin: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  transform: 'translateY(2px)',
                }}
              >
                RelayKit
              </Title>
            </Group>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button variant="default" size="sm" rightSection={<IconChevronDown size={14} />}>
                  init
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={openAccountModal}>
                  identity
                </Menu.Item>
                <Menu.Item
                  closeMenuOnClick={false}
                  onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
                >
                  <Group justify="space-between" wrap="nowrap" w="100%">
                    <Text size="sm">dark mode</Text>
                    <Switch
                      size="sm"
                      checked={colorScheme === 'dark'}
                      readOnly
                      tabIndex={-1}
                    />
                  </Group>
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={logout}>
                  logout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <AppShell.Section grow component={ScrollArea}>
            <NavLink
              component={RouterNavLink}
              to="/"
              label="services"
              onClick={closeMobileMenu}
            />
            <NavLink
              component={RouterNavLink}
              to="/debug"
              label="debug"
              onClick={closeMobileMenu}
            />
            <NavLink
              component={RouterNavLink}
              to="/insights"
              label="insights"
              onClick={closeMobileMenu}
            />
          </AppShell.Section>
          <AppShell.Section>
            <NavServerSummary />
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main>
          <Routes>
            <Route path="/" element={<ServicesPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="/insights" element={<InsightsPage />} />
          </Routes>
        </AppShell.Main>
      </AppShell>

      <AccountModal opened={accountModalOpen} onClose={closeAccountModal} />
    </>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
