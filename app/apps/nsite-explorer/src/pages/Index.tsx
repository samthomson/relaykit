import { useState } from 'react';
import { nip19, SimplePool } from 'nostr-tools';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';

const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

interface PathMapping {
  path: string;
  hash: string;
}

interface SiteData {
  event: NostrEvent;
  title?: string;
  paths: PathMapping[];
  blossomServers: string[];
  siteType: 'root' | 'named' | 'legacy';
  identifier?: string;
  legacyEvents?: NostrEvent[];
}

interface AllSitesData {
  rootSite?: SiteData;
  namedSites: SiteData[];
  legacySite?: SiteData;
}

interface BlossomCheckResult {
  hash: string;
  path: string;
  available: boolean;
  server?: string;
  size?: number;
  mimeType?: string;
}

const parsePubkeyHex = (input: string): string | null => {
  const t = input.trim();
  if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase();
  if (t.startsWith('npub1')) {
    try {
      const d = nip19.decode(t);
      return d.type === 'npub' ? d.data : null;
    } catch { return null; }
  }
  return null;
};

const parseSiteEvent = (event: NostrEvent, siteType: 'root' | 'named', identifier?: string): SiteData => {
  const paths: PathMapping[] = [];
  const blossomServers: string[] = [];
  let title: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] === 'path' && tag[1] && tag[2]) paths.push({ path: tag[1], hash: tag[2] });
    else if (tag[0] === 'server' && tag[1]) blossomServers.push(tag[1]);
    else if (tag[0] === 'title' && tag[1]) title = tag[1];
  }
  return { event, title, paths, blossomServers, siteType, identifier };
};

const parseLegacyEvents = (events: NostrEvent[]): SiteData => {
  const paths: PathMapping[] = [];
  const blossomServers: string[] = [];
  let title: string | undefined;
  for (const event of events) {
    let path: string | undefined;
    let hash: string | undefined;
    for (const tag of event.tags) {
      if (tag[0] === 'd' && tag[1]) path = tag[1];
      else if (tag[0] === 'x' && tag[1]) hash = tag[1];
      else if (tag[0] === 'server' && tag[1] && !blossomServers.includes(tag[1])) blossomServers.push(tag[1]);
      else if (tag[0] === 'title' && tag[1] && !title) title = tag[1];
    }
    if (path && hash) paths.push({ path, hash });
  }
  return { event: events[0], title, paths, blossomServers, siteType: 'legacy', legacyEvents: events };
};

const parseRelayList = (raw: string): string[] =>
  raw.split(/[\n,\s]+/).map(r => r.trim()).filter(r => r.startsWith('ws://') || r.startsWith('wss://'));

const Index = () => {
  const { user } = useCurrentUser();
  const [npubInput, setNpubInput] = useState('');
  const [relayInput, setRelayInput] = useState(DEFAULT_RELAYS.join('\n'));
  const [showRelayEdit, setShowRelayEdit] = useState(false);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [activeRelays, setActiveRelays] = useState<string[]>(DEFAULT_RELAYS);

  const handleSearch = () => {
    const hex = parsePubkeyHex(npubInput);
    if (!hex) { alert('invalid npub or hex pubkey'); return; }
    const relays = parseRelayList(relayInput);
    setActiveRelays(relays.length > 0 ? relays : DEFAULT_RELAYS);
    setPubkey(hex);
  };

  const { data: allSites, isLoading, error, refetch } = useQuery({
    queryKey: ['nsite-all', pubkey, activeRelays],
    queryFn: async (): Promise<AllSitesData> => {
      if (!pubkey) return { namedSites: [] };
      const pool = new SimplePool();
      try {
        const events = await pool.querySync(activeRelays, [
          { kinds: [15128], authors: [pubkey], limit: 1 },
          { kinds: [35128], authors: [pubkey], limit: 50 },
          { kinds: [34128], authors: [pubkey], limit: 100 },
        ]);
        const result: AllSitesData = { namedSites: [] };
        const root = events.filter(e => e.kind === 15128);
        if (root.length > 0) result.rootSite = parseSiteEvent(root[0], 'root');
        const named = events.filter(e => e.kind === 35128);
        result.namedSites = named.map(e => parseSiteEvent(e, 'named', e.tags.find(t => t[0] === 'd')?.[1]));
        const legacy = events.filter(e => e.kind === 34128);
        if (legacy.length > 0) result.legacySite = parseLegacyEvents(legacy);
        return result;
      } finally {
        pool.close(activeRelays);
      }
    },
    enabled: !!pubkey,
  });

  const { data: userBlossomServers = [] } = useQuery({
    queryKey: ['user-blossom', pubkey, activeRelays],
    queryFn: async (): Promise<string[]> => {
      if (!pubkey) return [];
      const pool = new SimplePool();
      try {
        const events = await pool.querySync(activeRelays, [{ kinds: [10063], authors: [pubkey], limit: 1 }]);
        return events[0]?.tags.filter(t => t[0] === 'server' && t[1]).map(t => t[1]) ?? [];
      } finally {
        pool.close(activeRelays);
      }
    },
    enabled: !!pubkey,
  });

  const totalSites = (allSites?.rootSite ? 1 : 0) + (allSites?.namedSites.length ?? 0) + (allSites?.legacySite ? 1 : 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-semibold">nsite-explorer</h1>
            <p className="text-sm text-muted-foreground font-mono">nsite manifest inspector</p>
          </div>
          <LoginArea className="max-w-52" />
        </div>

        <div className="mb-4 border rounded-md p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="npub1... or 64-char hex pubkey"
              value={npubInput}
              onChange={e => setNpubInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-sm"
            />
            {user && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNpubInput(nip19.npubEncode(user.pubkey))}
              >
                use mine
              </Button>
            )}
            <Button onClick={handleSearch} size="sm">search</Button>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowRelayEdit(v => !v)}
              className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              relays ({parseRelayList(relayInput).length})
              {showRelayEdit ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showRelayEdit && (
              <textarea
                className="mt-2 w-full font-mono text-xs bg-muted/40 border rounded p-2 resize-y"
                rows={DEFAULT_RELAYS.length}
                value={relayInput}
                onChange={e => setRelayInput(e.target.value)}
              />
            )}
          </div>
        </div>

        {pubkey && (
          <div>
            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-3/4" />
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-mono text-xs">
                  {error instanceof Error ? error.message : 'unknown error'}
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && !error && totalSites === 0 && (
              <p className="text-sm text-muted-foreground font-mono">no nsite events found on selected relays</p>
            )}
            {!isLoading && !error && totalSites > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span>
                    {totalSites} site{totalSites !== 1 ? 's' : ''}
                    {allSites?.rootSite ? ' · 1 root (15128)' : ''}
                    {(allSites?.namedSites.length ?? 0) > 0 ? ` · ${allSites!.namedSites.length} named (35128)` : ''}
                    {allSites?.legacySite ? ' · 1 legacy (34128)' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="hover:text-foreground transition-colors"
                    title="refresh"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
                {allSites?.rootSite && (
                  <SiteCard site={allSites.rootSite} userBlossomServers={userBlossomServers} label="root (15128)" />
                )}
                {allSites?.namedSites.map((site, i) => (
                  <SiteCard
                    key={site.identifier ?? i}
                    site={site}
                    userBlossomServers={userBlossomServers}
                    label={`named: ${site.identifier ?? '?'} (35128)`}
                  />
                ))}
                {allSites?.legacySite && (
                  <SiteCard site={allSites.legacySite} userBlossomServers={userBlossomServers} label="legacy (34128)" isLegacy />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function SiteCard({
  site,
  userBlossomServers,
  label,
  isLegacy = false,
}: {
  site: SiteData;
  userBlossomServers: string[];
  label: string;
  isLegacy?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const allServers = [...new Set([...site.blossomServers, ...userBlossomServers])];

  const { data: blossomChecks, isLoading: checksLoading } = useQuery({
    queryKey: ['blossom-checks', site.event.id, allServers],
    queryFn: async (): Promise<BlossomCheckResult[]> =>
      Promise.all(
        site.paths.map(async p => {
          for (const server of allServers) {
            try {
              const res = await fetch(`${server.replace(/\/$/, '')}/${p.hash}`, { method: 'HEAD' });
              if (res.ok) return {
                hash: p.hash,
                path: p.path,
                available: true,
                server,
                size: parseInt(res.headers.get('content-length') ?? '0') || undefined,
                mimeType: res.headers.get('content-type') ?? undefined,
              };
            } catch { /* try next server */ }
          }
          return { hash: p.hash, path: p.path, available: false };
        }),
      ),
    enabled: site.paths.length > 0 && allServers.length > 0,
  });

  const allOk = blossomChecks?.every(c => c.available) ?? false;
  const someOk = blossomChecks?.some(c => c.available) ?? false;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-sm font-semibold shrink-0">{label}</span>
              {site.title && <span className="text-xs text-muted-foreground truncate">{site.title}</span>}
              <span className="text-xs text-muted-foreground shrink-0">{site.paths.length} files</span>
              {isLegacy && <Badge variant="outline" className="text-xs shrink-0">deprecated</Badge>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {allServers.length > 0 && !checksLoading && blossomChecks && (
                allOk
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : someOk
                    ? <AlertCircle className="h-4 w-4 text-yellow-500" />
                    : <XCircle className="h-4 w-4 text-red-500" />
              )}
              {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4">
            <Tabs defaultValue="files">
              <TabsList className="mb-4">
                <TabsTrigger value="files">files</TabsTrigger>
                <TabsTrigger value="info">info</TabsTrigger>
                <TabsTrigger value="raw">raw</TabsTrigger>
              </TabsList>

              <TabsContent value="files">
                {site.paths.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono">no paths in manifest</p>
                ) : (
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          {allServers.length > 0 && <th className="w-6 p-2" />}
                          <th className="text-left p-2 font-medium text-muted-foreground">path</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">sha256</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">size</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.paths.map((p, i) => {
                          const check = blossomChecks?.[i];
                          return (
                            <tr key={p.hash} className="border-b last:border-0 hover:bg-muted/20">
                              {allServers.length > 0 && (
                                <td className="p-2">
                                  {checksLoading
                                    ? <span className="block h-3.5 w-3.5 rounded-full bg-muted-foreground/30 animate-pulse" />
                                    : check?.available
                                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                      : <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  }
                                </td>
                              )}
                              <td className="p-2">{p.path}</td>
                              <td className="p-2 text-muted-foreground">{p.hash.slice(0, 12)}…</td>
                              <td className="p-2 text-muted-foreground">
                                {check?.size ? `${(check.size / 1024).toFixed(1)}k` : '—'}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {check?.mimeType?.split('/')[1] ?? '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {allServers.length === 0 && site.paths.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground font-mono">
                    no blossom servers found — add server tags to the manifest or publish a kind 10063 event
                  </p>
                )}
              </TabsContent>

              <TabsContent value="info" className="space-y-4 text-xs font-mono">
                <div className="space-y-1">
                  <div className="text-muted-foreground">event id</div>
                  <div className="break-all">{site.event.id}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">created</div>
                  <div>{new Date(site.event.created_at * 1000).toISOString()}</div>
                </div>
                {isLegacy && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">file events</div>
                    <div>{site.legacyEvents?.length ?? 1} kind 34128 events</div>
                  </div>
                )}
                <Separator />
                {site.blossomServers.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">blossom servers (manifest server tags)</div>
                    {site.blossomServers.map(s => <div key={s}>{s}</div>)}
                  </div>
                )}
                {userBlossomServers.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-muted-foreground">blossom servers (kind 10063)</div>
                    {userBlossomServers.map(s => <div key={s}>{s}</div>)}
                  </div>
                )}
                {site.blossomServers.length === 0 && userBlossomServers.length === 0 && (
                  <div className="text-muted-foreground">no blossom servers configured</div>
                )}
              </TabsContent>

              <TabsContent value="raw">
                <ScrollArea className="h-96">
                  <pre className="text-xs font-mono bg-muted/40 p-3 rounded overflow-x-auto">
                    {isLegacy && site.legacyEvents
                      ? JSON.stringify(site.legacyEvents, null, 2)
                      : JSON.stringify(site.event, null, 2)}
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default Index;
