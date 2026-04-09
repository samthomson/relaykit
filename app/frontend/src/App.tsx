import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { BrowserRouter, Routes, Route, NavLink as RouterNavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { nip19 } from 'nostr-tools';
import pluralize from 'pluralize';
import { trpc } from './trpc';
import { useAuth } from './contexts/AuthContext';
import { useDokploy } from './contexts/DokployContext';
import { useRefreshServices } from './contexts/RefreshServicesContext';
import { SERVICE_TYPE } from '../../shared/serviceType';
import { NsiteDeployFields, buildNsiteDeployDefaults, prepareNsiteConfigForSave } from './components/NsiteDeployFields';
import { ServiceDetailsContent } from './components/ServiceDetailsContent';
import { InlineTextEditRow, INLINE_TITLE_ROW_H } from './components/InlineTextEditRow';
import { ServiceHostTitleView } from './components/ServiceHostTitleView';
import { Menu, Button, Text, Modal, Group, Badge, ActionIcon, TextInput, Select, Stack, Paper, Anchor, Title, AppShell, Burger, NavLink, ScrollArea, Card, Tooltip, SegmentedControl, Box, SimpleGrid, rem } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconCopy, IconExternalLink, IconPencil } from '@tabler/icons-react';

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
          Actions
        </Button>
      ) : (
        <Tooltip label="Actions" position="bottom">
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Actions">
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
      <Button variant="default" onClick={onCancel}>Cancel</Button>
      <Button color={danger ? 'red' : 'relay-orange'} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </Group>
  </Modal>
);

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
    <Modal opened onClose={onClose} title="Move Service" size="lg" centered>
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
                  color={target.environmentId === currentEnvironmentId ? 'gray' : 'relay-orange'}
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
            color="relay-orange"
            disabled={!selectedTarget}
            onClick={() => selectedTarget && onSelect(selectedTarget.environmentId)}
          >
            Confirm Move
          </Button>
        </Group>
      </Paper>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>Cancel</Button>
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
    const isNsite = preset.id === SERVICE_TYPE.NSITE;
    const defaults = isNsite
      ? buildNsiteDeployDefaults(preset, npub)
      : Object.fromEntries(
          preset.requiredConfig
            .filter((f: any) => f.default)
            .map((f: any) => [f.id, f.default]),
        );
    setDeployConfig(defaults);
    setDeployResult(null);
    setSelectedEnvironmentId(preselectedEnvironmentId ?? '');
    setDeployModalOpen(true);
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setDeployResult(null);
    try {
      const isNsite = selectedPreset.id === SERVICE_TYPE.NSITE;
      const config = isNsite ? prepareNsiteConfigForSave(deployConfig) : deployConfig;
      await trpc.deployService.mutate({
        presetId: selectedPreset.id,
        config,
        environmentId: selectedEnvironmentId || undefined,
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
            color="relay-orange"
            size={compact ? 'xs' : 'sm'}
            rightSection={<IconChevronDown size={compact ? 12 : 14} />}
          >
            Add service
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
          deployConfig={deployConfig}
          setDeployConfig={setDeployConfig}
          loading={loading}
          deployResult={deployResult}
          onSubmit={handleDeploy}
          onClose={() => setDeployModalOpen(false)}
          environments={environments}
          selectedEnvironmentId={selectedEnvironmentId}
          setSelectedEnvironmentId={setSelectedEnvironmentId}
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
}) => {
  const [showExplorer, setShowExplorer] = useState(false);
  const [showBlossomExplorer, setShowBlossomExplorer] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const domain = service.domains?.[0];
  const isEditing = editingDomain?.domainId === domain?.domainId;
  const httpsUrl = domain ? `https://${domain.host}` : '';
  const moveTargets = allEnvironments.filter((env) => env.environmentId !== service.environmentId);
  const manageItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (domain && !isEditing) {
    manageItems.push({ label: 'Edit Domain', onClick: () => onEditDomain(service.composeId, domain) });
  }
  if (service.canEditConfig) {
    manageItems.push({ label: 'Edit Config', onClick: () => onEditConfig(service) });
  }
  if (service.status === 'running') {
    manageItems.push({ label: 'Stop', onClick: () => onStop(service.composeId) });
  } else {
    manageItems.push({ label: 'Start', onClick: () => onStart(service.composeId) });
  }
  if (moveTargets.length > 0) {
    manageItems.push({ label: 'Move Service…', onClick: () => setShowMoveModal(true) });
  }
  manageItems.push({ label: 'Delete', onClick: () => onDelete(service.composeId, service.name), danger: true });

  const statusColor = service.status === 'running' ? 'green' : service.status === 'error' ? 'red' : 'gray';

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
        bg="white"
        radius="md"
        style={showDetails ? undefined : { width: 260, maxWidth: '100%', flexShrink: 0 }}
      >
        {showDetails ? (
          <>
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm" style={{ minHeight: INLINE_TITLE_ROW_H }}>
              <Group align="center" gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1, minHeight: INLINE_TITLE_ROW_H }}>
                {service.icon && (
                  <span style={{ display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: 6, flexShrink: 0 }}>
                    {service.icon}
                  </span>
                )}
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
                    trailing={<Badge variant="filled" color={statusColor} size="sm">{service.status}</Badge>}
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
                    trailing={<Badge variant="filled" color={statusColor} size="sm">{service.status}</Badge>}
                  />
                )}
              </Group>
              <CogMenu showLabel items={manageItems} />
            </Group>
            <Stack mt="md">
              <ServiceDetailsContent {...detailsContentProps} />
            </Stack>
          </>
        ) : (
          <>
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="nowrap" gap="xs" style={{ minHeight: INLINE_TITLE_ROW_H }}>
                <Group align="center" gap="xs" style={{ minWidth: 0, flex: 1, minHeight: INLINE_TITLE_ROW_H }}>
                  {service.icon && (
                    <span style={{ display: 'inline-flex', width: 22, height: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {service.icon}
                    </span>
                  )}
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
                    <Badge variant="filled" color={statusColor} size="xs" w="fit-content">{service.status}</Badge>
                  </Stack>
                </Group>
                <CogMenu items={manageItems} />
              </Group>
              {domain ? (
                <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
                  <Anchor href={httpsUrl} target="_blank" size="xs" c="relay-orange" truncate style={{ flex: 1, minWidth: 0 }} title={httpsUrl}>
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
                {domain && service.type === SERVICE_TYPE.RELAY && (
                  <Button
                    size="xs"
                    variant="light"
                    color="relay-orange"
                    onClick={() => setShowExplorer(true)}
                    rightSection={<IconExternalLink size={12} />}
                  >
                    Explorer
                  </Button>
                )}
                {domain && service.type === SERVICE_TYPE.BLOSSOM && (
                  <Button
                    size="xs"
                    variant="light"
                    color="relay-orange"
                    onClick={() => setShowBlossomExplorer(true)}
                    rightSection={<IconExternalLink size={12} />}
                  >
                    Explorer
                  </Button>
                )}
                <Button size="xs" variant="light" color="gray" onClick={() => setDetailsModalOpen(true)}>
                  Details
                </Button>
              </Group>
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
                    />
                  )}
                  <CogMenu showLabel items={manageItems} />
                </Group>
              }
              size="lg"
              centered
              styles={{
                header: { alignItems: 'center' },
                title: { flex: 1, marginRight: 0, width: '100%' },
                body: { maxHeight: '85vh', overflow: 'auto' },
              }}
            >
              <ServiceDetailsContent {...detailsContentProps} />
            </Modal>
          </>
        )}
      </Paper>
    </>
  );
};

const ServiceList = () => {
  const { refreshTrigger, triggerRefresh } = useRefreshServices();
  const { setDokployConnectionError, setDokployReady } = useDokploy();
  const { logout } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverIp, setServerIp] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfigService) return;
    setSavingConfig(true);
    try {
      const configToSave =
        editingConfigService.type === SERVICE_TYPE.NSITE
          ? prepareNsiteConfigForSave(editingConfigValues)
          : editingConfigValues;
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

  return (
    <Stack gap="xl" mt="xl">
      <Group justify="space-between">
        <Title order={2}>Services</Title>
        <Group gap="xs">
          <Group gap="xs">
            <Text size="sm" c="dimmed">View:</Text>
            <SegmentedControl
              size="sm"
              color="relay-orange"
              value={showDetails ? 'details' : 'overview'}
              onChange={(v) => setShowDetails(v === 'details')}
              data={[
                { label: 'Overview', value: 'overview' },
                { label: 'Details', value: 'details' },
              ]}
            />
          </Group>
          <Button color="relay-orange" onClick={() => triggerRefresh()} loading={loading} leftSection={loading ? undefined : '↻'}>
            Refresh
          </Button>
        </Group>
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
            const projectServiceCount = project.environments.reduce((acc: number, e: any) => acc + e.services.length, 0);
            return (
              <Paper key={project.projectId} withBorder p="md" bg="white">
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
                      <Group gap="xs" wrap="nowrap" style={{ minHeight: INLINE_TITLE_ROW_H }} align="center">
                        <Badge variant="filled" color="gray" size="sm">{projectServiceCount} {pluralize('service', projectServiceCount)}</Badge>
                        <CogMenu items={[
                          { label: 'Delete group', onClick: () => openDeleteGroupConfirm(project.projectId, project.name), danger: true },
                        ]} />
                      </Group>
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
                      <Group gap="xs" wrap="nowrap" style={{ minHeight: INLINE_TITLE_ROW_H }} align="center">
                        <Badge variant="filled" color="gray" size="sm">{projectServiceCount} {pluralize('service', projectServiceCount)}</Badge>
                        <CogMenu items={[
                          { label: 'Delete group', onClick: () => openDeleteGroupConfirm(project.projectId, project.name), danger: true },
                        ]} />
                      </Group>
                    </>
                  )}
                </Group>
                <Stack gap="sm">
                  {showDetails ? (
                    project.environments.map((env: any) => {
                      const isDefaultEnv = env.isDefault === true;
                      return (
                        <Card key={env.environmentId} withBorder padding="sm" bg="gray.0">
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
                                  <Badge variant="light" color="relay-orange" size="sm">{env.name}</Badge>
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
                                />
                              ))
                            )}
                            <Group justify="flex-end" wrap="wrap" gap="sm" align="center">
                              <AddServiceButton compact preselectedEnvironmentId={env.environmentId} />
                              {newEnvTarget === project.projectId ? (
                                <>
                                  <TextInput
                                    size="xs"
                                    placeholder="Environment name…"
                                    value={newEnvName}
                                    onChange={(e) => setNewEnvName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateEnvironment(project.projectId)}
                                    style={{ width: 150 }}
                                    autoFocus
                                  />
                                  <Button size="xs" color="relay-orange" onClick={() => handleCreateEnvironment(project.projectId)} disabled={!newEnvName.trim()}>Add</Button>
                                  <Button size="xs" variant="default" onClick={() => { setNewEnvTarget(null); setNewEnvName(''); }}>Cancel</Button>
                                </>
                              ) : (
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => setNewEnvTarget(project.projectId)}
                                >
                                  + Add environment
                                </Button>
                              )}
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
                                border: '1px solid var(--mantine-color-gray-4)',
                                borderRadius: 'var(--mantine-radius-md)',
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
                                        <Badge variant="light" color="relay-orange" size="sm">{env.name}</Badge>
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
                      <Group justify="flex-end">
                        {newEnvTarget === project.projectId ? (
                          <>
                            <TextInput
                              size="xs"
                              placeholder="Environment name…"
                              value={newEnvName}
                              onChange={(e) => setNewEnvName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleCreateEnvironment(project.projectId)}
                              style={{ width: 150 }}
                              autoFocus
                            />
                            <Button size="xs" color="relay-orange" onClick={() => handleCreateEnvironment(project.projectId)} disabled={!newEnvName.trim()}>Add</Button>
                            <Button size="xs" variant="default" onClick={() => { setNewEnvTarget(null); setNewEnvName(''); }}>Cancel</Button>
                          </>
                        ) : (
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => setNewEnvTarget(project.projectId)}
                          >
                            + Add environment
                          </Button>
                        )}
                      </Group>
                    </>
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
          borderTop: '1px solid var(--mantine-color-gray-3)',
        }}
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder p="md">
            <Text fw={500} size="sm" mb={4}>Add a new group</Text>
            <Text size="xs" c="dimmed" mb="md">Create a group to organise services within.</Text>
            <Group wrap="nowrap" align="flex-end">
              <TextInput
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Group name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
              <Button variant="outline" color="relay-orange" onClick={handleCreateProject} loading={creatingProject} disabled={!newProjectName.trim()}>
                Add group
              </Button>
            </Group>
          </Paper>
          <Paper withBorder p="md" id="add-service">
            <Text fw={500} size="sm" mb={4}>
              Add service
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              Deploy a relay or media server into a group.
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
          values={editingConfigValues}
          setValues={setEditingConfigValues}
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
  deployConfig,
  setDeployConfig,
  loading,
  deployResult,
  onSubmit,
  onClose,
  environments,
  selectedEnvironmentId,
  setSelectedEnvironmentId,
  ownerPubkeyHex,
}: {
  preset: any;
  deployConfig: Record<string, string>;
  setDeployConfig: (c: Record<string, string> | ((p: Record<string, string>) => Record<string, string>)) => void;
  loading: boolean;
  deployResult: any;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  environments: { environmentId: string; label: string }[];
  selectedEnvironmentId: string;
  setSelectedEnvironmentId: (id: string) => void;
  ownerPubkeyHex: string | null;
}) => {
  const byGroup = environments.reduce<Record<string, { environmentId: string; label: string }[]>>((acc, env) => {
    const [groupName, envName] = env.label.includes(' → ') ? env.label.split(' → ') : [env.label, ''];
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push({ environmentId: env.environmentId, label: envName || env.label });
    return acc;
  }, {});
  const groupNames = Object.keys(byGroup);
  const isNsite = preset.id === SERVICE_TYPE.NSITE;

  const renderField = (field: any) => (
    <div key={field.id} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
      <TextInput
        label={field.name}
        description={field.description}
        required={field.required}
        value={deployConfig[field.id] ?? field.default ?? ''}
        onChange={(e) => setDeployConfig((c) => ({ ...c, [field.id]: e.target.value }))}
      />
    </div>
  );

  return (
    <Modal opened onClose={onClose} title={
      <Group gap="xs">
        {preset.icon}
        <Text fw={700}>Deploy {preset.name}</Text>
      </Group>
    } size="md" centered styles={{ body: { maxHeight: '85vh', overflow: 'auto' } }}>
      <Stack gap="md">
        {preset.description && <Text size="sm" c="dimmed">{preset.description}</Text>}
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <Select
              label="Deploy into"
              placeholder="Select environment…"
              value={selectedEnvironmentId}
              onChange={(v) => setSelectedEnvironmentId(v || '')}
              required
              data={groupNames.flatMap((groupName) => [
                { group: groupName, items: byGroup[groupName].map((env) => ({ value: env.environmentId, label: env.label })) }
              ])}
            />
            {isNsite ? (
              <NsiteDeployFields
                preset={preset}
                config={deployConfig}
                setConfig={setDeployConfig}
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
            <Group grow>
              <Button type="submit" color="green" loading={loading} disabled={!selectedEnvironmentId}>
                {loading ? 'Deploying...' : 'Deploy'}
              </Button>
              <Button variant="default" onClick={onClose} disabled={loading}>
                Cancel
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
  values,
  setValues,
  onSubmit,
  onClose,
  saving,
}: {
  loading: boolean;
  service: any | null;
  fields: any[];
  values: Record<string, string>;
  setValues: Dispatch<SetStateAction<Record<string, string>>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) => {
  const isNsite = service?.type === SERVICE_TYPE.NSITE;
  const fakePreset = isNsite ? { id: SERVICE_TYPE.NSITE, requiredConfig: fields } : null;

  const renderConfigField = (field: any) => (
    <div key={field.id} style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
      <TextInput
        label={field.name}
        description={field.description}
        value={values[field.id] ?? field.default ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
      />
    </div>
  );

  return (
    <Modal opened onClose={onClose} title="Edit Config" size="md" centered styles={{ body: { maxHeight: '85vh', overflow: 'auto' } }}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {service ? `Update environment config for ${service.name}` : 'Loading service config...'}
        </Text>
        {loading ? (
          <Text c="dimmed">Loading...</Text>
        ) : fields.length === 0 ? (
          <>
            <Text c="dimmed">No editable config fields for this service.</Text>
            <Button onClick={onClose} fullWidth>Close</Button>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <Stack gap="md">
              {isNsite && fakePreset ? (
                <NsiteDeployFields
                  preset={fakePreset}
                  config={values}
                  setConfig={setValues}
                  ownerPubkeyHex={null}
                />
              ) : (
                fields.map(renderConfigField)
              )}
              <Group grow>
                <Button type="submit" color="green" loading={saving}>
                  {saving ? 'Saving...' : 'Save + Redeploy'}
                </Button>
                <Button variant="default" onClick={onClose} disabled={saving}>
                  Cancel
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
    <Stack align="center" justify="center" h="100vh" bg="paper.2">
      <Paper withBorder p="xl" maw={400} w="100%">
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
          <Button size="lg" fullWidth onClick={handleLogin} loading={loggingIn} color="relay-orange">
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
        <Text c="dimmed">Loading…</Text>
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
    <Modal opened={opened} onClose={onClose} title="Identity" size="md" centered>
      <Stack gap="md">
        <Paper withBorder p="md">
          <Text fw={500} mb="sm">Identity</Text>
          <Stack gap="sm">
            {hex && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">hex</Text>
                  <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(hex)}>Copy</Button>
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
                  <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(encodedNpub)}>Copy</Button>
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
      <Title order={2}>Debug Info</Title>
      <Paper withBorder p="md">
        <Text fw={500} mb="sm">Identity</Text>
        <Stack gap="sm">
          {hex && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">hex</Text>
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(hex)}>Copy</Button>
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
                <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(encodedNpub)}>Copy</Button>
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
            <Text fw={500}>Dokploy Key</Text>
            <Button size="xs" variant="subtle" onClick={() => navigator.clipboard.writeText(token || '')}>Copy</Button>
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

const AppContent = () => {
  const { isAuthenticated, isLoading, logout } = useAuth();
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
            <Group gap="xs">
              <Burger opened={mobileMenuOpened} onClick={toggleMobileMenu} hiddenFrom="sm" size="sm" />
              <Title order={3} c="relay-orange">RelayKit</Title>
            </Group>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button variant="default" size="sm" rightSection={<IconChevronDown size={14} />}>
                  Profile
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={openAccountModal}>
                  Identity
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" onClick={logout}>
                  Logout
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
              label="Services"
              onClick={closeMobileMenu}
            />
            <NavLink
              component={RouterNavLink}
              to="/debug"
              label="Debug"
              onClick={closeMobileMenu}
            />
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main bg="paper.2">
          <Routes>
            <Route path="/" element={<ServicesPage />} />
            <Route path="/debug" element={<DebugPage />} />
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
