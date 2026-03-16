import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { trpc } from './trpc';
import { useAuth } from './contexts/AuthContext';
import { useDokploy } from './contexts/DokployContext';
import { useRefreshServices } from './contexts/RefreshServicesContext';

const CogMenu = ({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-ink-subtle/40 hover:text-ink-muted transition-colors p-1 text-lg leading-none"
        title="Options"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-paper-elevated border border-border rounded shadow-lg z-[100] min-w-[140px] py-1">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-border-soft transition-colors ${item.danger ? 'text-error' : 'text-ink'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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
  <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50" onClick={onCancel}>
    <div
      className="bg-paper-elevated rounded-lg p-6 max-w-sm w-full border border-border shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-lg font-semibold text-ink m-0 mb-2">{title}</h3>
      <p className="text-ink-muted text-sm m-0 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded bg-paper-elevated text-ink-muted hover:bg-border-soft text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 rounded text-sm ${danger ? 'bg-error text-paper-elevated hover:opacity-90' : 'bg-primary text-paper-elevated hover:bg-primary-hover'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

const AddServiceButton = ({ preselectedEnvironmentId }: { preselectedEnvironmentId?: string }) => {
  const { triggerRefresh } = useRefreshServices();
  const [presets, setPresets] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<{ environmentId: string; label: string }[]>([]);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<any>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [deployConfig, setDeployConfig] = useState<Record<string, string>>({});
  const [deployResult, setDeployResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [presetsResult, projectsResult] = await Promise.all([
        trpc.listPresets.query(undefined),
        trpc.listProjects.query(),
      ]);
      setPresets(presetsResult);
      setEnvironments(
        projectsResult.flatMap((p: any) =>
          p.environments.map((e: any) => ({ environmentId: e.environmentId, label: `${p.name} → ${e.name}` }))
        )
      );
    } catch (error) {
      console.error('Error loading deploy data:', error);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPosition({ top: rect.bottom + 4, left: rect.left });
    } else {
      setDropdownPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelectPreset = (preset: any) => {
    setOpen(false);
    loadData();
    setSelectedPreset(preset);
    const defaults: Record<string, string> = {};
    preset.requiredConfig.forEach((field: any) => {
      if (field.default) defaults[field.id] = field.default;
    });
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
      await trpc.deployService.mutate({
        presetId: selectedPreset.id,
        config: deployConfig,
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 border border-primary/40 rounded-lg bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60 transition-colors text-sm font-medium"
      >
        + Add Service
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-4 h-4 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      {open && presets.length > 0 && dropdownPosition &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed min-w-[240px] bg-paper-elevated border border-border rounded-lg shadow-lg py-1 z-[100]"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          >
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="block w-full text-left px-4 py-2.5 hover:bg-border-soft transition-colors border-b border-border-soft last:border-b-0"
              >
                <span className="text-sm font-medium text-primary">{preset.name}</span>
                {preset.description && (
                  <p className="text-xs text-ink-muted m-0 mt-0.5">{preset.description}</p>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
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
        />
      )}
    </div>
  );
};

const dnsRecordNameForHost = (host: string): { zone: string; name: string } => {
  const parts = host.toLowerCase().trim().split('.');
  if (parts.length < 2) return { zone: host, name: '@' };
  const zone = parts.slice(-2).join('.');
  const name = host.toLowerCase() === zone ? '@' : host.toLowerCase().slice(0, -(zone.length + 1));
  return { zone, name };
};

const RelayExplorerModal = ({ relayUrl, onClose }: { relayUrl: string; onClose: () => void }) => {
  const explorerUrl = `https://relay-explorer.shakespeare.wtf/?relay=${encodeURIComponent(relayUrl)}`;
  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-paper-elevated rounded-lg w-[90vw] h-[90vh] flex flex-col border border-border shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-xl font-bold m-0 text-ink">Relay Explorer</h2>
          <button onClick={onClose} className="px-3 py-1.5 bg-ink text-paper-elevated rounded hover:opacity-90 text-sm">Close</button>
        </div>
        <iframe src={explorerUrl} className="flex-1 w-full border-0" title="Relay Explorer" />
      </div>
    </div>
  );
};

const BlossomExplorerModal = ({ serverUrl, onClose }: { serverUrl: string; onClose: () => void }) => {
  const explorerUrl = `https://blossom-explorer.shakespeare.wtf/?server=${encodeURIComponent(serverUrl)}`;
  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-paper-elevated rounded-lg w-[90vw] h-[90vh] flex flex-col border border-border shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-xl font-bold m-0 text-ink">Blossom Explorer</h2>
          <button onClick={onClose} className="px-3 py-1.5 bg-ink text-paper-elevated rounded hover:opacity-90 text-sm">Close</button>
        </div>
        <iframe src={explorerUrl} className="flex-1 w-full border-0" title="Blossom Explorer" />
      </div>
    </div>
  );
};

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
}) => {
  const [showExplorer, setShowExplorer] = useState(false);
  const [showBlossomExplorer, setShowBlossomExplorer] = useState(false);
  const domain = service.domains?.[0];

  const isEditing = editingDomain?.domainId === domain?.domainId;
  const createdAt = new Date(service.createdAt);
  const createdStr = format(createdAt, 'd MMM yyyy, h:mm a');
  const createdAgo = formatDistanceToNow(createdAt, { addSuffix: true });
  const httpsUrl = domain ? `https://${domain.host}` : '';
  const wssUrl = domain ? `wss://${domain.host}` : '';

  const deploymentPillColor =
    service.status === 'running' ? 'bg-success-bg text-success-text' :
    service.status === 'error' ? 'bg-error-bg text-error-text' : 'bg-border-soft text-ink-muted';
  return (
    <>
      {showExplorer && domain && (
        <RelayExplorerModal relayUrl={domain.host} onClose={() => setShowExplorer(false)} />
      )}
      {showBlossomExplorer && domain && (
        <BlossomExplorerModal serverUrl={httpsUrl} onClose={() => setShowBlossomExplorer(false)} />
      )}
      <div className="bg-paper-elevated border border-border rounded-lg p-4 shadow-sm">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold m-0 text-ink truncate">
              {domain ? domain.host : service.name}
            </h3>
            <ul className="mt-3 pl-4 space-y-1.5 text-sm text-ink-muted list-none border-l-2 border-border ml-1">
              <li className="flex items-center gap-2">
                <span className="text-ink-subtle font-medium w-20 shrink-0">ID</span>
                <span className="font-mono text-xs truncate" title={service.name}>{service.name}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-ink-subtle font-medium w-20 shrink-0">Service</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary inline-block">
                  {service.serviceType}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-ink-subtle font-medium w-20 shrink-0">Deployment</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium inline-block ${deploymentPillColor}`}>
                  {service.status}
                </span>
              </li>
              {domain && (
                <>
                  <li className="flex items-center gap-2 flex-wrap">
                    <span className="text-ink-subtle font-medium w-20 shrink-0">HTTPS</span>
                    <a
                      href={httpsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {httpsUrl} ↗
                    </a>
                    <button
                      onClick={() => onCopy(httpsUrl)}
                      className="shrink-0 px-2 py-0.5 text-xs rounded border border-border bg-paper-elevated hover:bg-border-soft text-ink-muted"
                    >
                      Copy
                    </button>
                    {service.type === 'blossom' && (
                      <button
                        onClick={() => setShowBlossomExplorer(true)}
                        className="shrink-0 px-2 py-0.5 text-xs rounded border border-primary bg-paper-elevated hover:bg-primary/5 text-primary"
                      >
                        Explore
                      </button>
                    )}
                  </li>
                  {service.type === 'relay' && (
                    <li className="flex items-center gap-2 flex-wrap">
                      <span className="text-ink-subtle font-medium w-20 shrink-0">WSS</span>
                      <span className="font-mono text-xs truncate">{wssUrl}</span>
                      <button
                        onClick={() => onCopy(wssUrl)}
                        className="shrink-0 px-2 py-0.5 text-xs rounded border border-border bg-paper-elevated hover:bg-border-soft text-ink-muted"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => setShowExplorer(true)}
                        className="shrink-0 px-2 py-0.5 text-xs rounded border border-primary bg-paper-elevated hover:bg-primary/5 text-primary"
                      >
                        Explore
                      </button>
                    </li>
                  )}
                </>
              )}
            {domain && serverIp && (
              <li className="flex flex-col gap-2 pt-2 mt-2 border-t border-border-soft">
                <span className="text-ink-subtle font-medium text-xs uppercase tracking-wide">DNS Setup</span>
                <p className="text-sm text-ink-muted m-0">
                  Add this A record to <strong>{dnsRecordNameForHost(domain.host).zone}</strong>:
                </p>
                <div className="bg-paper rounded px-3 py-2 text-sm font-mono flex items-center justify-between text-ink-muted">
                  <span><strong className="text-ink">{dnsRecordNameForHost(domain.host).name}</strong> → {serverIp}</span>
                  <button
                    type="button"
                    onClick={() => onCopy(serverIp)}
                    className="ml-2 p-1 text-ink-subtle hover:text-ink"
                    title="Copy IP address"
                  >
                    📋
                  </button>
                </div>
              </li>
            )}
            {isEditing && domain && (
              <li className="flex items-center gap-2 pt-1">
                <span className="text-ink-subtle font-medium w-20 shrink-0">Host</span>
                <input
                  type="text"
                  value={newDomainHost}
                  onChange={(e) => setNewDomainHost(e.target.value)}
                  className="px-2 py-1 border border-border rounded text-xs flex-1 max-w-xs bg-paper-elevated text-ink"
                />
                <button onClick={onSaveDomain} className="px-2 py-1 bg-success text-paper-elevated rounded text-xs hover:opacity-90 shrink-0">
                  Save
                </button>
                <button onClick={onCancelEdit} className="px-2 py-1 bg-ink text-paper-elevated rounded text-xs hover:opacity-90 shrink-0">
                  Cancel
                </button>
              </li>
            )}
            <li className="flex items-center gap-2">
              <span className="text-ink-subtle font-medium w-20 shrink-0">Created</span>
              <span>{createdStr}</span>
              <span className="text-ink-subtle">({createdAgo})</span>
            </li>
          </ul>
          {!domain && (
            <p className="mt-2 pl-5 text-ink-subtle text-xs italic">No domain configured</p>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-end">
          <div className="flex gap-2">
            {domain && !isEditing && (
              <button
                onClick={() => onEditDomain(service.composeId, domain)}
                className="px-2 py-1.5 bg-primary text-paper-elevated rounded text-xs hover:bg-primary-hover"
              >
                Edit Domain
              </button>
            )}
            {service.canEditConfig && (
              <button
                onClick={() => onEditConfig(service)}
                className="px-2 py-1.5 bg-primary text-paper-elevated rounded text-xs hover:bg-primary-hover"
              >
                Edit Config
              </button>
            )}
            {service.status === 'running' ? (
              <button
                onClick={() => onStop(service.composeId)}
                className="px-4 py-2 bg-warning text-warning-text rounded hover:opacity-90 text-sm"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => onStart(service.composeId)}
                className="px-4 py-2 bg-success text-paper-elevated rounded hover:opacity-90 text-sm"
              >
                Start
              </button>
            )}
            <button
              onClick={() => onDelete(service.composeId, service.name)}
              className="px-4 py-2 bg-error text-paper-elevated rounded hover:opacity-90 text-sm"
            >
              Delete
            </button>
          </div>
          {allEnvironments.length > 1 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onMove(service.composeId, e.target.value); }}
              className="text-xs border border-border rounded px-2 py-1 bg-paper-elevated text-ink-muted"
            >
              <option value="">Move to…</option>
              {allEnvironments
                .filter((env) => env.environmentId !== service.environmentId)
                .map((env) => (
                  <option key={env.environmentId} value={env.environmentId}>{env.label}</option>
                ))}
            </select>
          )}
        </div>
      </div>
      </div>
    </>
  );
};

const ServiceList = () => {
  const { refreshTrigger } = useRefreshServices();
  const { setDokployConnectionError, setDokployReady } = useDokploy();
  const { logout } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverIp, setServerIp] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await trpc.updateServiceConfig.mutate({
        composeId: editingConfigService.composeId,
        config: editingConfigValues,
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
      await loadData();
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
      await loadData();
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

  return (
    <div className="mt-12">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold m-0 text-ink">Services</h2>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2 bg-primary text-paper-elevated rounded hover:bg-primary-hover disabled:bg-border disabled:cursor-not-allowed text-sm"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {grouped.length === 0 ? (
        <p className="text-ink-muted italic">No groups yet.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((project: any) => (
            <div key={project.projectId} className="border border-border rounded-lg overflow-hidden">
              {renamingProjectId === project.projectId ? (
                <div className="bg-border-soft px-4 py-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={renameProjectValue}
                    onChange={(e) => setRenameProjectValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameProject(project.projectId)}
                    className="px-3 py-1.5 border border-border rounded text-sm bg-paper-elevated text-ink flex-1 max-w-xs"
                    autoFocus
                  />
                  <button onClick={() => handleRenameProject(project.projectId)} disabled={!renameProjectValue.trim()} className="px-2 py-1 bg-primary text-paper-elevated rounded text-xs hover:bg-primary-hover disabled:bg-border">Save</button>
                  <button onClick={() => { setRenamingProjectId(null); setRenameProjectValue(''); }} className="px-2 py-1 bg-ink text-paper-elevated rounded text-xs hover:opacity-90">Cancel</button>
                </div>
              ) : !isDefaultProject(project.name) ? (
                <div className="bg-border-soft px-4 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-ink m-0">{project.name}</h3>
                    <button onClick={() => { setRenamingProjectId(project.projectId); setRenameProjectValue(project.name); }} className="text-ink-subtle/30 hover:text-primary transition-colors" title="Rename group">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.445l-.813 3.04a.5.5 0 0 0 .608.608l3.04-.813a1 1 0 0 0 .445-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.544-.544ZM11.72 3.22a.25.25 0 0 1 .354 0l.544.544a.25.25 0 0 1 0 .354L5.126 11.61l-1.907.51.51-1.907L11.72 3.22Z" /></svg>
                    </button>
                  </div>
                  <CogMenu items={[
                    { label: 'Delete group', onClick: () => openDeleteGroupConfirm(project.projectId, project.name), danger: true },
                  ]} />
                </div>
              ) : (
                <div className="flex justify-end px-4 pt-2">
                  <CogMenu items={[
                    { label: 'Delete group', onClick: () => openDeleteGroupConfirm(project.projectId, project.name), danger: true },
                  ]} />
                </div>
              )}
              {project.environments.map((env: any) => {
                const isDefaultEnv = env.isDefault === true;
                return (
                <div key={env.environmentId} className="border-t border-border">
                  <div className="px-4 py-2.5 bg-paper-elevated/30 flex items-center gap-2 group/env border-l-2 border-l-primary/20">
                    {renamingEnvId === env.environmentId ? (
                      <>
                        <input
                          type="text"
                          value={renameEnvValue}
                          onChange={(e) => setRenameEnvValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameEnvironment(env.environmentId)}
                          className="px-2 py-0.5 border border-border rounded text-sm bg-paper-elevated text-ink"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameEnvironment(env.environmentId)}
                          disabled={!renameEnvValue.trim()}
                          className="px-2 py-0.5 bg-primary text-paper-elevated rounded text-xs hover:bg-primary-hover disabled:bg-border"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setRenamingEnvId(null); setRenameEnvValue(''); }}
                          className="px-2 py-0.5 bg-ink text-paper-elevated rounded text-xs hover:opacity-90"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-ink">{env.name}</span>
                        {!isDefaultEnv && (
                          <button
                            onClick={() => { setRenamingEnvId(env.environmentId); setRenameEnvValue(env.name); }}
                            className="text-ink-subtle/30 hover:text-primary transition-colors"
                            title="Rename environment"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.22 10.306a1 1 0 0 0-.26.445l-.813 3.04a.5.5 0 0 0 .608.608l3.04-.813a1 1 0 0 0 .445-.26l7.793-7.793a1.75 1.75 0 0 0 0-2.475l-.544-.544ZM11.72 3.22a.25.25 0 0 1 .354 0l.544.544a.25.25 0 0 1 0 .354L5.126 11.61l-1.907.51.51-1.907L11.72 3.22Z" />
                            </svg>
                          </button>
                        )}
                        <div className="flex-1" />
                        <CogMenu items={[
                          { label: 'Delete environment', onClick: () => openDeleteEnvConfirm(env.environmentId, env.name), danger: true },
                        ]} />
                      </>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {env.services.length === 0 ? (
                      <p className="text-ink-subtle text-sm italic">No services in this environment.</p>
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
                        />
                      ))
                    )}
                    <AddServiceButton preselectedEnvironmentId={env.environmentId} />
                  </div>
                </div>
                );
              })}
              {newEnvTarget === project.projectId ? (
                <div className="border-t border-border px-4 py-3 flex items-center gap-2 bg-paper">
                  <input
                    type="text"
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateEnvironment(project.projectId)}
                    placeholder="Environment name…"
                    className="px-2 py-1 border border-border rounded text-xs bg-paper-elevated text-ink"
                    autoFocus
                  />
                  <button
                    onClick={() => handleCreateEnvironment(project.projectId)}
                    disabled={!newEnvName.trim()}
                    className="px-2 py-1 bg-primary text-paper-elevated rounded text-xs hover:bg-primary-hover disabled:bg-border"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setNewEnvTarget(null); setNewEnvName(''); }}
                    className="px-2 py-1 bg-ink text-paper-elevated rounded text-xs hover:opacity-90"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setNewEnvTarget(project.projectId)}
                  className="w-full border-t border-border px-4 py-2.5 text-xs text-primary hover:bg-border-soft/50 transition-colors text-left"
                >
                  + Add an environment within this group
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 border border-border/60 rounded-lg overflow-hidden bg-paper-elevated/50 hover:bg-paper-elevated hover:border-border transition-colors">
        <div className="px-4 pt-3 pb-1">
          <h3 className="text-sm font-semibold text-ink m-0">Add a new group</h3>
          <p className="text-xs text-ink-muted m-0 mt-0.5">Create a group to organise services within.</p>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            placeholder="Group name"
            className="flex-1 min-w-0 px-3 py-2 border border-border rounded text-sm bg-paper text-ink placeholder:text-ink-subtle"
          />
          <button
            onClick={handleCreateProject}
            disabled={creatingProject || !newProjectName.trim()}
            className="px-4 py-2 bg-primary text-paper-elevated rounded text-sm font-medium hover:bg-primary-hover disabled:bg-border disabled:cursor-not-allowed shrink-0"
          >
            Add group
          </button>
        </div>
      </div>

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
    </div>
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
}) => {
  const byGroup = environments.reduce<Record<string, { environmentId: string; label: string }[]>>((acc, env) => {
    const [groupName, envName] = env.label.includes(' → ') ? env.label.split(' → ') : [env.label, ''];
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push({ environmentId: env.environmentId, label: envName || env.label });
    return acc;
  }, {});
  const groupNames = Object.keys(byGroup);

  return (
  <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
    <div className="bg-paper-elevated rounded-lg p-8 max-w-lg w-full max-h-[80vh] overflow-auto border border-border shadow-lg">
      <h2 className="text-2xl font-bold mt-0 text-ink">Deploy {preset.name}</h2>
      <p className="text-ink-muted">{preset.description}</p>
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <label className="block mb-2 font-medium text-ink">
            Deploy into:
            <select
              value={selectedEnvironmentId}
              onChange={(e) => setSelectedEnvironmentId(e.target.value)}
              required
              className="block w-full px-3 py-2 mt-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-paper-elevated text-ink"
            >
              <option value="">Select environment…</option>
              {groupNames.map((groupName) => (
                <optgroup key={groupName} label={groupName}>
                  {byGroup[groupName].map((env) => (
                    <option key={env.environmentId} value={env.environmentId}>
                      {env.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {preset.requiredConfig.map((field: any) => (
          <div key={field.id} className="mb-4">
            <label className="block mb-2 font-medium text-ink">
              {field.name}:
              <PresetConfigFieldInput
                field={field}
                value={deployConfig[field.id] ?? field.default ?? ''}
                onChange={(next) => setDeployConfig({ ...deployConfig, [field.id]: next })}
              />
            </label>
            {field.description && <small className="text-ink-muted text-xs">{field.description}</small>}
          </div>
        ))}
        {deployResult && (
          <div className={`mb-4 p-4 rounded ${deployResult.error ? 'bg-error-bg text-error-text' : 'bg-success-bg text-success-text'}`}>
            <strong>{deployResult.error ? 'Error:' : 'Success!'}</strong>
            <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(deployResult, null, 2)}</pre>
          </div>
        )}
        <div className="flex gap-4 mt-6">
          <button
            type="submit"
            disabled={loading || !selectedEnvironmentId}
            className="flex-1 px-4 py-3 bg-success text-paper-elevated rounded hover:opacity-90 disabled:bg-border disabled:cursor-not-allowed"
          >
            {loading ? 'Deploying...' : 'Deploy'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-ink text-paper-elevated rounded hover:opacity-90 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
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
  setValues: (next: Record<string, string>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) => (
  <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50">
    <div className="bg-paper-elevated rounded-lg p-8 max-w-lg w-full max-h-[80vh] overflow-auto border border-border shadow-lg">
      <h2 className="text-2xl font-bold mt-0 text-ink">Edit Config</h2>
      <p className="text-ink-muted">
        {service ? `Update environment config for ${service.name}` : 'Loading service config...'}
      </p>
      {loading ? (
        <p className="text-ink-muted">Loading...</p>
      ) : fields.length === 0 ? (
        <>
          <p className="text-ink-muted">No editable config fields for this service.</p>
          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-ink text-paper-elevated rounded hover:opacity-90"
            >
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          {fields.map((field) => (
            <div key={field.id} className="mb-4">
              <label className="block mb-2 font-medium text-ink">
                {field.name}:
                <PresetConfigFieldInput
                  field={field}
                  value={values[field.id] ?? field.default ?? ''}
                  onChange={(next) => setValues({ ...values, [field.id]: next })}
                />
              </label>
              {field.description && <small className="text-ink-muted text-xs">{field.description}</small>}
            </div>
          ))}
          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-success text-paper-elevated rounded hover:opacity-90 disabled:bg-border disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save + Redeploy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-3 bg-ink text-paper-elevated rounded hover:opacity-90 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  </div>
);

const DeploySection = () => (
  <div className="mt-12">
    <h2 className="text-2xl font-bold text-ink mb-1">Add service</h2>
    <p className="text-ink-muted text-sm m-0 mb-4">Deploy a relay or media server into a group.</p>
    <AddServiceButton />
  </div>
);

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="max-w-md w-full p-8 bg-paper-elevated rounded-lg shadow-lg border border-border">
        <h1 className="text-3xl font-bold mb-2 text-ink">RelayKit</h1>
        <p className="text-ink-muted mb-8">Nostr service deployment platform</p>

        {!hasNostrExtension ? (
          <div className="p-4 bg-warning-bg rounded-lg border border-warning/30">
            <p className="font-semibold mb-2 text-warning-text">Nostr Extension Required</p>
            <p className="text-sm text-ink-muted mb-4">
              Please install a Nostr browser extension to continue:
            </p>
            <ul className="text-sm space-y-2">
              <li>
                <a
                  href="https://getalby.com"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  Alby (Chrome, Firefox)
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/fiatjaf/nos2x"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  nos2x (Chrome)
                </a>
              </li>
            </ul>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="w-full px-6 py-3 bg-primary text-paper-elevated rounded hover:bg-primary-hover disabled:bg-border disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loggingIn ? 'Signing in...' : 'Sign in with Nostr'}
          </button>
        )}
      </div>
    </div>
  );
};

const DokployConnectionAlert = ({ message }: { message: string }) => (
  <div className="p-6 bg-error-bg border border-error/40 rounded-lg" role="alert">
    <p className="font-semibold text-error-text m-0">Dokploy connection problem</p>
    <p className="text-error-text text-sm mt-2 m-0">{message}</p>
    <p className="text-error-text/90 text-sm mt-2 m-0">
      To fix: run the setup script with your npub, or add a valid Dokploy API key to the bootstrap key file (see README).
    </p>
  </div>
);

/** Runs initial listServices when mounted; sets dokployReady, or handles errors so we never hang on loading. */
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

const App = () => {
  const { isAuthenticated, isLoading, npub, logout, token } = useAuth();
  const { dokployConnectionError, dokployReady } = useDokploy();
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetch('/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(setDebugInfo)
        .catch(console.error);
    }
  }, [isAuthenticated, token]);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto min-h-screen">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-4xl font-bold text-ink">RelayKit</h1>
          <p className="text-ink-muted">Nostr service deployment platform</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-subtle mb-2">
            {npub ? `${npub.slice(0, 8)}...${npub.slice(-4)}` : ''}
          </p>
          <button
            onClick={logout}
            className="text-sm text-ink-muted hover:text-ink underline"
          >
            Logout
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-ink-subtle hover:text-ink-muted underline ml-2"
          >
            {showDebug ? 'Hide' : 'Debug'}
          </button>
        </div>
      </div>
      {showDebug && debugInfo && (
        <div className="mb-4 p-4 bg-border-soft rounded text-xs font-mono text-ink-muted">
          <div><strong className="text-ink">NPub:</strong> {debugInfo.npub}</div>
          <div><strong className="text-ink">Dokploy Key:</strong> {debugInfo.dokployApiKey?.slice(0, 20)}...</div>
        </div>
      )}
      {dokployConnectionError ? (
        <DokployConnectionAlert message={dokployConnectionError} />
      ) : (
        <>
          <DokployInitialCheck />
          {!dokployReady ? (
            <p className="text-ink-muted">Loading…</p>
          ) : (
            <>
              <ServiceList />
              <DeploySection />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default App;
