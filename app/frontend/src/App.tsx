import { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { trpc } from './trpc';
import { useAuth } from './contexts/AuthContext';
import { useDokploy } from './contexts/DokployContext';
import { useRefreshServices } from './contexts/RefreshServicesContext';

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
                Edit
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

  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newEnvTarget, setNewEnvTarget] = useState<string | null>(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [renamingEnvId, setRenamingEnvId] = useState<string | null>(null);
  const [renameEnvValue, setRenameEnvValue] = useState('');

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

  const handleDeleteService = async (composeId: string, serviceName: string) => {
    if (!confirm(`Are you sure you want to delete ${serviceName}?`)) return;
    try {
      await trpc.deleteService.mutate({ composeId });
      toast.success('Service deleted successfully');
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to delete service: ${error.message}`);
    }
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      await trpc.createProject.mutate({ name: newProjectName.trim() });
      setNewProjectName('');
      toast.success('Project created');
      await loadData();
    } catch (error: any) {
      toast.error(`Failed to create project: ${error.message}`);
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

  const grouped = projects.map((project: any) => ({
    ...project,
    environments: project.environments.map((env: any) => ({
      ...env,
      services: services.filter((s: any) => s.environmentId === env.environmentId),
    })),
  }));

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

      <div className="flex items-center gap-2 mb-6">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
          placeholder="New project name…"
          className="px-3 py-1.5 border border-border rounded text-sm bg-paper-elevated text-ink flex-1 max-w-xs"
        />
        <button
          onClick={handleCreateProject}
          disabled={creatingProject || !newProjectName.trim()}
          className="px-3 py-1.5 bg-primary text-paper-elevated rounded text-sm hover:bg-primary-hover disabled:bg-border disabled:cursor-not-allowed"
        >
          Create Project
        </button>
      </div>

      {grouped.length === 0 ? (
        <p className="text-ink-muted italic">No projects yet.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((project: any) => (
            <div key={project.projectId} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-border-soft px-4 py-3 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-ink m-0">{project.name}</h3>
                {newEnvTarget === project.projectId ? (
                  <div className="flex items-center gap-2">
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
                    className="text-xs text-primary hover:underline"
                  >
                    + Environment
                  </button>
                )}
              </div>
              {project.environments.map((env: any) => (
                <div key={env.environmentId} className="border-t border-border">
                  <div className="px-4 py-2 bg-paper flex items-center gap-2">
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
                        <span className="text-sm font-medium text-ink-muted">{env.name}</span>
                        <button
                          onClick={() => { setRenamingEnvId(env.environmentId); setRenameEnvValue(env.name); }}
                          className="text-xs text-ink-subtle hover:text-primary"
                        >
                          Rename
                        </button>
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
                          onDelete={handleDeleteService}
                          onMove={handleMoveService}
                          allEnvironments={allEnvironments}
                        />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
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
}) => (
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
              {environments.map((env) => (
                <option key={env.environmentId} value={env.environmentId}>{env.label}</option>
              ))}
            </select>
          </label>
        </div>
        {preset.requiredConfig.map((field: any) => (
          <div key={field.id} className="mb-4">
            <label className="block mb-2 font-medium text-ink">
              {field.name}:
              {field.type === 'select' ? (
                <select
                  value={deployConfig[field.id] || field.default || ''}
                  onChange={(e) => setDeployConfig({ ...deployConfig, [field.id]: e.target.value })}
                  required={field.required}
                  className="block w-full px-3 py-2 mt-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-paper-elevated text-ink"
                >
                  {field.options?.map((option: any) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={deployConfig[field.id] || ''}
                  onChange={(e) => setDeployConfig({ ...deployConfig, [field.id]: e.target.value })}
                  required={field.required}
                  placeholder={field.placeholder || field.description}
                  className="block w-full px-3 py-2 mt-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary bg-paper-elevated text-ink"
                />
              )}
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

const DeploySection = () => {
  const { triggerRefresh } = useRefreshServices();
  const [presets, setPresets] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<{ environmentId: string; label: string }[]>([]);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<any>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [deployConfig, setDeployConfig] = useState<Record<string, string>>({});
  const [deployResult, setDeployResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

  const handleDeployClick = (preset: any) => {
    loadData();
    setSelectedPreset(preset);
    const defaults: Record<string, string> = {};
    preset.requiredConfig.forEach((field: any) => {
      if (field.default) defaults[field.id] = field.default;
    });
    setDeployConfig(defaults);
    setDeployResult(null);
    setSelectedEnvironmentId('');
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
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-ink">Deploy a Service</h2>
      <p className="text-ink-muted">Choose a Nostr service to deploy:</p>
      <div className="mt-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {presets.map((preset) => (
          <div key={preset.id} className="p-6 border border-border rounded-lg bg-paper-elevated">
            <h3 className="text-lg font-semibold m-0 mb-2 text-ink">{preset.name}</h3>
            <p className="text-ink-muted text-sm m-0 mb-4">{preset.description}</p>
            <button
              onClick={() => handleDeployClick(preset)}
              className="w-full px-4 py-3 bg-success text-paper-elevated rounded hover:opacity-90 text-sm font-medium"
            >
              Deploy {preset.name}
            </button>
          </div>
        ))}
      </div>
      {presets.length === 0 && <p className="text-ink-subtle italic">No services available yet.</p>}
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
        const isConfigError =
          code === 'PRECONDITION_FAILED' ||
          msg.includes('not configured') ||
          msg.includes('invalid or expired') ||
          msg.includes('bootstrap key');
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
