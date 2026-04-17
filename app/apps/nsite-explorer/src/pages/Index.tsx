import { useSeoMeta } from '@unhead/react';
import { useState, useEffect } from 'react';
import { nip19 } from 'nostr-tools';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, AlertCircle, Search, Globe, FileText, Server, ChevronDown, ChevronUp, User, Wifi } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { LoginArea } from '@/components/auth/LoginArea';

interface PathMapping {
  path: string;
  hash: string;
}

interface SiteData {
  event: NostrEvent;
  title?: string;
  description?: string;
  paths: PathMapping[];
  servers: string[];
  source?: string;
  siteType: 'root' | 'named' | 'legacy';
  identifier?: string;
  isLegacy?: boolean;
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
  error?: string;
}

const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const isEmbedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embedded') === '1';

const Index = () => {
  useSeoMeta({
    title: 'nsite Debugger - Test Your Nostr Static Sites',
    description: 'Debug and investigate nsite deployments. Check manifests, verify files on Blossom servers, and troubleshoot your Nostr static websites.',
  });

  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  
  const [npubInput, setNpubInput] = useState('');
  const [siteIdentifier, setSiteIdentifier] = useState('');
  const [selectedRelays, setSelectedRelays] = useState<string[]>(DEFAULT_RELAYS);
  const [customRelay, setCustomRelay] = useState('');
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [useMyRelays, setUseMyRelays] = useState(false);

  // Auto-populate user's relays when they toggle "Use My Relays"
  useEffect(() => {
    if (useMyRelays && config.relayMetadata?.relays) {
      const userRelayUrls = config.relayMetadata.relays
        .filter(r => r.read)
        .map(r => r.url);
      
      if (userRelayUrls.length > 0) {
        setSelectedRelays(userRelayUrls);
      }
    } else if (!useMyRelays) {
      setSelectedRelays(DEFAULT_RELAYS);
    }
  }, [useMyRelays, config.relayMetadata]);

  // Auto-fill npub input when user logs in
  useEffect(() => {
    if (user?.pubkey && !npubInput) {
      setNpubInput(nip19.npubEncode(user.pubkey));
    }
  }, [user?.pubkey]);

  const handleSearch = () => {
    try {
      let decodedPubkey: string;
      
      if (npubInput.startsWith('npub1')) {
        const decoded = nip19.decode(npubInput);
        if (decoded.type !== 'npub') {
          throw new Error('Invalid npub format');
        }
        decodedPubkey = decoded.data;
      } else if (npubInput.match(/^[0-9a-f]{64}$/i)) {
        // Raw hex pubkey
        decodedPubkey = npubInput.toLowerCase();
      } else {
        throw new Error('Please enter a valid npub or hex pubkey');
      }
      
      setPubkey(decodedPubkey);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Invalid input'}`);
    }
  };

  const handleSearchMyNsites = () => {
    if (user?.pubkey) {
      setNpubInput(nip19.npubEncode(user.pubkey));
      setPubkey(user.pubkey);
    }
  };

  const toggleRelay = (relay: string) => {
    setSelectedRelays(prev =>
      prev.includes(relay) ? prev.filter(r => r !== relay) : [...prev, relay]
    );
  };

  const addCustomRelay = () => {
    if (customRelay && customRelay.startsWith('wss://') && !selectedRelays.includes(customRelay)) {
      setSelectedRelays(prev => [...prev, customRelay]);
      setCustomRelay('');
    }
  };

  // Query for ALL site types at once
  const { data: allSites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ['nsite-all', pubkey, siteIdentifier, selectedRelays],
    queryFn: async (): Promise<AllSitesData> => {
      if (!pubkey) return { namedSites: [] };

      const relayGroup = nostr.group(selectedRelays);
      
      // Query all types at once
      const filters = [
        { kinds: [15128], authors: [pubkey], limit: 1 }, // Root site
        { kinds: [35128], authors: [pubkey], limit: 50 }, // Named sites (get up to 50)
        { kinds: [34128], authors: [pubkey], limit: 100 }, // Legacy events
      ];

      const allEvents = await relayGroup.query(filters);
      
      const result: AllSitesData = { namedSites: [] };

      // Process root site (kind 15128)
      const rootEvents = allEvents.filter(e => e.kind === 15128);
      if (rootEvents.length > 0) {
        result.rootSite = parseSiteEvent(rootEvents[0], 'root');
      }

      // Process named sites (kind 35128)
      const namedEvents = allEvents.filter(e => e.kind === 35128);
      
      // Filter by identifier if provided
      const filteredNamedEvents = siteIdentifier
        ? namedEvents.filter(e => e.tags.find(t => t[0] === 'd' && t[1] === siteIdentifier))
        : namedEvents;

      result.namedSites = filteredNamedEvents.map(e => {
        const identifier = e.tags.find(t => t[0] === 'd')?.[1];
        return parseSiteEvent(e, 'named', identifier);
      });

      // Process legacy events (kind 34128)
      const legacyEvents = allEvents.filter(e => e.kind === 34128);
      if (legacyEvents.length > 0) {
        result.legacySite = parseLegacyEvents(legacyEvents);
      }

      return result;
    },
    enabled: !!pubkey,
  });

  function parseSiteEvent(event: NostrEvent, siteType: 'root' | 'named', identifier?: string): SiteData {
    const paths: PathMapping[] = [];
    const servers: string[] = [];
    let title: string | undefined;
    let description: string | undefined;
    let source: string | undefined;

    for (const tag of event.tags) {
      if (tag[0] === 'path' && tag[1] && tag[2]) {
        paths.push({ path: tag[1], hash: tag[2] });
      } else if (tag[0] === 'server' && tag[1]) {
        servers.push(tag[1]);
      } else if (tag[0] === 'title' && tag[1]) {
        title = tag[1];
      } else if (tag[0] === 'description' && tag[1]) {
        description = tag[1];
      } else if (tag[0] === 'source' && tag[1]) {
        source = tag[1];
      }
    }

    return {
      event,
      title,
      description,
      paths,
      servers,
      source,
      siteType,
      identifier,
    };
  }

  function parseLegacyEvents(events: NostrEvent[]): SiteData {
    const paths: PathMapping[] = [];
    const servers: string[] = [];
    let title: string | undefined;
    let description: string | undefined;

    for (const event of events) {
      let path: string | undefined;
      let hash: string | undefined;

      for (const tag of event.tags) {
        if (tag[0] === 'd' && tag[1]) {
          path = tag[1];
        } else if (tag[0] === 'x' && tag[1]) {
          hash = tag[1];
        } else if (tag[0] === 'server' && tag[1] && !servers.includes(tag[1])) {
          servers.push(tag[1]);
        } else if (tag[0] === 'title' && tag[1] && !title) {
          title = tag[1];
        } else if (tag[0] === 'description' && tag[1] && !description) {
          description = tag[1];
        }
      }

      if (path && hash) {
        paths.push({ path, hash });
      }
    }

    return {
      event: events[0],
      title,
      description,
      paths,
      servers,
      siteType: 'legacy',
      isLegacy: true,
      legacyEvents: events,
    };
  }

  // Query for user's Blossom servers (kind 10063)
  const { data: userServers } = useQuery({
    queryKey: ['user-blossom-servers', pubkey, selectedRelays],
    queryFn: async (): Promise<string[]> => {
      if (!pubkey) return [];

      const relayGroup = nostr.group(selectedRelays);
      const events = await relayGroup.query([
        { kinds: [10063], authors: [pubkey], limit: 1 }
      ]);

      if (events.length === 0) return [];

      const servers: string[] = [];
      for (const tag of events[0].tags) {
        if (tag[0] === 'server' && tag[1]) {
          servers.push(tag[1]);
        }
      }

      return servers;
    },
    enabled: !!pubkey,
  });

  const hasAnySites = allSites && (allSites.rootSite || allSites.namedSites.length > 0 || allSites.legacySite);
  const totalSites = (allSites?.rootSite ? 1 : 0) + (allSites?.namedSites.length || 0) + (allSites?.legacySite ? 1 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {!isEmbedded && (
        <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Search className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    nsite Debugger
                  </h1>
                  <p className="text-sm text-muted-foreground">Test and diagnose your Nostr static sites</p>
                </div>
              </div>
              <LoginArea className="max-w-60" />
            </div>
          </div>
        </header>
      )}

      <div className={`container mx-auto px-4 max-w-6xl ${isEmbedded ? 'py-4' : 'py-8'}`}>
        {/* Search Section */}
        <Card className="mb-6 shadow-lg border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Search for nsites
            </CardTitle>
            <CardDescription>
              Enter an npub or hex pubkey to find all their nsite deployments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Actions */}
            {user && (
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <Button 
                  onClick={handleSearchMyNsites} 
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                >
                  <User className="h-4 w-4" />
                  Find My Sites
                </Button>
                <Button
                  onClick={() => setUseMyRelays(!useMyRelays)}
                  variant={useMyRelays ? 'default' : 'outline'}
                  size="sm"
                  className="gap-2"
                >
                  <Wifi className="h-4 w-4" />
                  {useMyRelays ? 'Using My Relays' : 'Use My Relays'}
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="npub1... or hex pubkey"
                value={npubInput}
                onChange={(e) => setNpubInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <label className="text-sm font-medium text-muted-foreground">Filter named sites:</label>
              <Input
                placeholder="Site identifier (optional)"
                value={siteIdentifier}
                onChange={(e) => setSiteIdentifier(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Relay Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Relays to check:</label>
                {useMyRelays && config.relayMetadata?.relays && (
                  <Badge variant="secondary" className="text-xs">
                    Using {config.relayMetadata.relays.filter(r => r.read).length} of your relays
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedRelays.slice(0, 8).map(relay => (
                  <Badge
                    key={relay}
                    variant="default"
                    className="cursor-pointer"
                    onClick={() => toggleRelay(relay)}
                  >
                    {relay.replace('wss://', '')}
                  </Badge>
                ))}
                {selectedRelays.length > 8 && (
                  <Badge variant="outline">
                    +{selectedRelays.length - 8} more
                  </Badge>
                )}
              </div>
              {!useMyRelays && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_RELAYS.filter(r => !selectedRelays.includes(r)).map(relay => (
                      <Badge
                        key={relay}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => toggleRelay(relay)}
                      >
                        {relay.replace('wss://', '')}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add custom relay (wss://...)"
                      value={customRelay}
                      onChange={(e) => setCustomRelay(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomRelay()}
                      className="max-w-md"
                    />
                    <Button onClick={addCustomRelay} variant="outline" size="sm">
                      Add
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {pubkey && (
          <>
            {sitesLoading ? (
              <Card>
                <CardHeader>
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-96" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </CardContent>
              </Card>
            ) : sitesError ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Error loading sites: {sitesError instanceof Error ? sitesError.message : 'Unknown error'}
                </AlertDescription>
              </Alert>
            ) : !hasAnySites ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  No nsite deployments found for this pubkey on the selected relays.
                  {siteIdentifier && ' Try removing the identifier filter to see all sites.'}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-6">
                {/* Summary Card */}
                <Card className="border-2 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                      <CheckCircle2 className="h-5 w-5" />
                      Found {totalSites} site{totalSites !== 1 ? 's' : ''}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-green-800 dark:text-green-200">
                    <div className="flex flex-wrap gap-2">
                      {allSites.rootSite && (
                        <Badge variant="secondary">1 Root Site (15128)</Badge>
                      )}
                      {allSites.namedSites.length > 0 && (
                        <Badge variant="secondary">{allSites.namedSites.length} Named Site{allSites.namedSites.length !== 1 ? 's' : ''} (35128)</Badge>
                      )}
                      {allSites.legacySite && (
                        <Badge variant="secondary">1 Legacy Site (34128)</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Root Site */}
                {allSites.rootSite && (
                  <SiteCard 
                    site={allSites.rootSite} 
                    userServers={userServers}
                    title="Root Site (kind 15128)"
                  />
                )}

                {/* Named Sites */}
                {allSites.namedSites.map((site, idx) => (
                  <SiteCard 
                    key={site.identifier || idx}
                    site={site} 
                    userServers={userServers}
                    title={`Named Site: ${site.identifier || 'Unknown'} (kind 35128)`}
                  />
                ))}

                {/* Legacy Site */}
                {allSites.legacySite && (
                  <SiteCard 
                    site={allSites.legacySite} 
                    userServers={userServers}
                    title="Legacy Site (kind 34128 - deprecated)"
                    isLegacy
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Info Card */}
        {!pubkey && (
          <Card className="mt-8 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-100">About nsite Debugger</CardTitle>
            </CardHeader>
            <CardContent className="text-blue-800 dark:text-blue-200 space-y-3">
              <p>This tool helps you debug and investigate Nostr static site (nsite) deployments using NIP-5A.</p>
              
              {user ? (
                <Alert className="bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-900 dark:text-blue-100">
                    <strong>You're logged in!</strong> Click "Find My Sites" to automatically debug your nsites using your relay list.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-900 dark:text-blue-100">
                    <strong>Log in</strong> to automatically use your npub and relay list for quick debugging.
                  </AlertDescription>
                </Alert>
              )}

              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Automatically finds all nsite types: root sites (15128), named sites (35128), and legacy sites (34128)</li>
                <li>Smart relay discovery: use your NIP-65 relay list or default relays</li>
                <li>Verify manifest events are published to relays</li>
                <li>Check if files are available on Blossom servers</li>
                <li>Validate manifest structure and metadata</li>
                <li>View raw event data for debugging</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Built with{' '}
            <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Shakespeare
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

// Separate component for each site card
function SiteCard({ 
  site, 
  userServers, 
  title, 
  isLegacy = false 
}: { 
  site: SiteData; 
  userServers?: string[]; 
  title: string;
  isLegacy?: boolean;
}) {
  const { nostr } = useNostr();
  const [isOpen, setIsOpen] = useState(true);

  // Check file availability on Blossom servers
  const { data: blossomChecks, isLoading: blossomLoading } = useQuery({
    queryKey: ['blossom-checks', site.event.id, site.paths, site.servers, userServers],
    queryFn: async (): Promise<BlossomCheckResult[]> => {
      const allServers = [
        ...(site.servers || []),
        ...(userServers || []),
      ];

      // Remove duplicates
      const uniqueServers = [...new Set(allServers)];

      if (uniqueServers.length === 0) {
        return site.paths.map(p => ({
          hash: p.hash,
          path: p.path,
          available: false,
          error: 'No Blossom servers configured',
        }));
      }

      const results: BlossomCheckResult[] = [];

      for (const pathMapping of site.paths) {
        let found = false;
        let result: BlossomCheckResult = {
          hash: pathMapping.hash,
          path: pathMapping.path,
          available: false,
        };

        for (const server of uniqueServers) {
          try {
            const url = `${server}/${pathMapping.hash}`;
            const response = await fetch(url, { method: 'HEAD' });
            
            if (response.ok) {
              found = true;
              result = {
                hash: pathMapping.hash,
                path: pathMapping.path,
                available: true,
                server,
                size: parseInt(response.headers.get('content-length') || '0'),
                mimeType: response.headers.get('content-type') || undefined,
              };
              break;
            }
          } catch (error) {
            // Continue to next server
          }
        }

        if (!found) {
          result.error = 'File not found on any Blossom server';
        }

        results.push(result);
      }

      return results;
    },
  });

  const allFilesAvailable = blossomChecks?.every(check => check.available) ?? false;
  const someFilesAvailable = blossomChecks?.some(check => check.available) ?? false;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="shadow-lg">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {title}
              </CardTitle>
              {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
            <CardDescription className="text-left">
              {site.title || 'No title'} • {site.paths.length} file{site.paths.length !== 1 ? 's' : ''}
              {isLegacy && ' (deprecated format)'}
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent>
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="manifest">Manifest</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="raw">Raw Data</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                {isLegacy && (
                  <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                      This is a legacy nsite using kind 34128 (deprecated). Each file is a separate event. 
                      Consider migrating to kind 15128 (root site) or 35128 (named site) for better performance.
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="grid gap-4 md:grid-cols-2">
                  {site.title && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Title</label>
                      <p className="text-lg">{site.title}</p>
                    </div>
                  )}
                  {site.identifier && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Identifier</label>
                      <p className="text-lg font-mono">{site.identifier}</p>
                    </div>
                  )}
                  {isLegacy && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Event Count</label>
                      <p className="text-lg">{site.legacyEvents?.length || 0} events found</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Files</label>
                    <p className="text-lg">{site.paths.length} paths mapped</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Blossom Servers</label>
                    <p className="text-lg">{site.servers.length || 0} server hints</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">User Servers (10063)</label>
                    <p className="text-lg">{userServers?.length || 0} configured</p>
                  </div>
                </div>

                {site.description && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p className="mt-1">{site.description}</p>
                  </div>
                )}

                {site.source && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Source</label>
                    <a
                      href={site.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {site.source}
                    </a>
                  </div>
                )}

                <Separator />

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">File Availability</label>
                  {blossomLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : blossomChecks && blossomChecks.length > 0 ? (
                    <div className="space-y-2">
                      {allFilesAvailable ? (
                        <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-900 dark:text-green-100">
                            All {blossomChecks.length} files are available on Blossom servers!
                          </AlertDescription>
                        </Alert>
                      ) : someFilesAvailable ? (
                        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950">
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                          <AlertDescription className="text-yellow-900 dark:text-yellow-100">
                            {blossomChecks.filter(c => c.available).length} of {blossomChecks.length} files available. Some files are missing.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert variant="destructive">
                          <XCircle className="h-4 w-4" />
                          <AlertDescription>
                            No files found on Blossom servers. Check the Files tab for details.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No Blossom servers configured for this pubkey.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </TabsContent>

              {/* Manifest Tab */}
              <TabsContent value="manifest" className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {isLegacy ? 'First Event ID' : 'Event ID'}
                    </label>
                    <p className="font-mono text-sm break-all">{site.event.id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {isLegacy ? 'First Event Created At' : 'Created At'}
                    </label>
                    <p>{new Date(site.event.created_at * 1000).toLocaleString()}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Path Mappings</label>
                  <ScrollArea className="h-[300px] rounded-md border p-4">
                    <div className="space-y-3">
                      {site.paths.map((path, idx) => (
                        <div key={idx} className="space-y-1">
                          <p className="font-medium">{path.path}</p>
                          <p className="text-xs font-mono text-muted-foreground break-all">{path.hash}</p>
                          {idx < site.paths.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {(site.servers.length > 0 || (userServers && userServers.length > 0)) && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Blossom Servers</label>
                      {site.servers.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">From manifest (server tags):</p>
                          <ul className="space-y-1 list-disc list-inside">
                            {site.servers.map((server, idx) => (
                              <li key={idx} className="text-sm break-all">{server}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {userServers && userServers.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">From user (kind 10063):</p>
                          <ul className="space-y-1 list-disc list-inside">
                            {userServers.map((server, idx) => (
                              <li key={idx} className="text-sm break-all">{server}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Files Tab */}
              <TabsContent value="files" className="space-y-4">
                {blossomLoading ? (
                  <div className="space-y-4">
                    {site.paths.map((_, idx) => (
                      <div key={idx} className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ) : blossomChecks && blossomChecks.length > 0 ? (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {blossomChecks.map((check, idx) => (
                        <div key={idx} className="border rounded-lg p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium">{check.path}</p>
                              <p className="text-xs font-mono text-muted-foreground break-all mt-1">{check.hash}</p>
                            </div>
                            {check.available ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 ml-2 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 ml-2 flex-shrink-0" />
                            )}
                          </div>
                          
                          {check.available ? (
                            <div className="text-sm space-y-1">
                              <p className="text-green-600">✓ File found</p>
                              {check.server && (
                                <p className="text-muted-foreground">Server: {check.server}</p>
                              )}
                              {check.size !== undefined && (
                                <p className="text-muted-foreground">Size: {(check.size / 1024).toFixed(2)} KB</p>
                              )}
                              {check.mimeType && (
                                <p className="text-muted-foreground">Type: {check.mimeType}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-red-600">{check.error || 'File not available'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No Blossom servers configured. Add server tags to the manifest or publish a kind 10063 event.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              {/* Raw Data Tab */}
              <TabsContent value="raw" className="space-y-4">
                <ScrollArea className="h-[500px]">
                  <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-950 p-4 rounded-md overflow-x-auto">
                    {isLegacy && site.legacyEvents
                      ? JSON.stringify(site.legacyEvents, null, 2)
                      : JSON.stringify(site.event, null, 2)
                    }
                  </pre>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default Index;
