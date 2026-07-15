import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { CodeHighlight } from '@mantine/code-highlight';
import {
  IconBraces,
  IconCheck,
  IconCopy,
  IconGitBranch,
  IconPlugConnected,
  IconRefresh,
  IconWorld,
} from '@tabler/icons-react';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';

// NIP-34: git repositories over nostr.
const KIND_REPO_ANNOUNCEMENT = 30617;
const KIND_REPO_STATE = 30618;
// Time to wait for stored events after EOSE before considering the load settled.
const EOSE_SETTLE_MS = 500;

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface GitRef {
  name: string;
  commit: string;
}

interface Repo {
  key: string; // `${pubkey}:${identifier}`
  pubkey: string;
  identifier: string;
  name: string;
  description: string;
  clone: string[];
  web: string[];
  relays: string[];
  maintainers: string[];
  euc: string; // earliest unique commit
  announcement: NostrEvent;
  state?: NostrEvent;
  head?: string; // e.g. refs/heads/master
  refs: GitRef[];
}

const params = new URLSearchParams(window.location.search);
const isEmbedded = params.get('embedded') === '1';

const firstTag = (event: NostrEvent, name: string): string =>
  event.tags.find((t) => t[0] === name)?.[1] ?? '';

const tagValues = (event: NostrEvent, name: string): string[] => {
  const tag = event.tags.find((t) => t[0] === name);
  return tag ? tag.slice(1).filter(Boolean) : [];
};

const shortId = (id: string, head = 8): string => (id.length > head ? `${id.slice(0, head)}` : id);

const npubOf = (pubkey: string): string => {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
};

const shortNpub = (pubkey: string): string => {
  const npub = npubOf(pubkey);
  return npub.startsWith('npub1') ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub;
};

// wss for the relay half, https for the git-http host — grasp serves both on one origin.
const deriveEndpoints = (input: string): { relay: string; server: string; host: string } => {
  const relayParam = params.get('relay');
  const serverParam = params.get('server');
  if (relayParam || serverParam) {
    const host = (serverParam || relayParam || '').replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      relay: relayParam || `wss://${host}`,
      server: serverParam || `https://${host}`,
      host,
    };
  }
  const host = input.trim().replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  return { relay: host ? `wss://${host}` : '', server: host ? `https://${host}` : '', host };
};

const buildRepo = (announcement: NostrEvent, state?: NostrEvent): Repo => {
  const identifier = firstTag(announcement, 'd');
  const refs: GitRef[] = [];
  let head: string | undefined;
  if (state) {
    for (const tag of state.tags) {
      if (tag[0] === 'HEAD') {
        head = (tag[1] || '').replace(/^ref:\s*/, '');
      } else if (tag[0]?.startsWith('refs/') && tag[1]) {
        refs.push({ name: tag[0], commit: tag[1] });
      }
    }
  }
  refs.sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: `${announcement.pubkey}:${identifier}`,
    pubkey: announcement.pubkey,
    identifier,
    name: firstTag(announcement, 'name') || identifier,
    description: firstTag(announcement, 'description'),
    clone: tagValues(announcement, 'clone'),
    web: tagValues(announcement, 'web'),
    relays: tagValues(announcement, 'relays'),
    maintainers: tagValues(announcement, 'maintainers'),
    euc: announcement.tags.find((t) => t[0] === 'r' && t[2] === 'euc')?.[1] ?? '',
    announcement,
    state,
    head,
    refs,
  };
};

const CopyIcon = ({ value }: { value: string }) => (
  <CopyButton value={value} timeout={1500}>
    {({ copied, copy }) => (
      <Tooltip label={copied ? 'copied' : 'copy'} withArrow>
        <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy} size="sm">
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </ActionIcon>
      </Tooltip>
    )}
  </CopyButton>
);

const RepoCard = ({ repo }: { repo: Repo }) => {
  const [showJson, setShowJson] = useState(false);
  const cloneUrl = repo.clone[0] ?? '';
  const headCommit = repo.head ? repo.refs.find((r) => r.name === repo.head)?.commit : undefined;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <IconGitBranch size={18} />
              <Text fw={600} truncate>
                {repo.name}
              </Text>
              {repo.head && (
                <Badge size="sm" variant="light" color="grape">
                  {repo.head.replace('refs/heads/', '')}
                </Badge>
              )}
            </Group>
            {repo.description && (
              <Text size="sm" c="dimmed" mt={4}>
                {repo.description}
              </Text>
            )}
          </Box>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="raw events" withArrow>
              <ActionIcon
                variant={showJson ? 'filled' : 'subtle'}
                color="gray"
                onClick={() => setShowJson((v) => !v)}
              >
                <IconBraces size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Group gap="lg" wrap="wrap">
          <Box>
            <Text size="xs" c="dimmed">
              maintainer
            </Text>
            <Text size="sm" ff="monospace">
              {shortNpub(repo.pubkey)}
            </Text>
          </Box>
          {repo.maintainers.length > 0 && (
            <Box>
              <Text size="xs" c="dimmed">
                co-maintainers
              </Text>
              <Text size="sm">{repo.maintainers.length}</Text>
            </Box>
          )}
          <Box>
            <Text size="xs" c="dimmed">
              announced
            </Text>
            <Text size="sm">{formatDistanceToNow(repo.announcement.created_at * 1000, { addSuffix: true })}</Text>
          </Box>
        </Group>

        {cloneUrl && (
          <Box>
            <Text size="xs" c="dimmed" mb={4}>
              clone
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{cloneUrl}</Code>
              <CopyIcon value={cloneUrl} />
            </Group>
          </Box>
        )}

        <Divider label="git state (proof)" labelPosition="left" />
        {repo.refs.length === 0 ? (
          <Text size="sm" c="dimmed">
            no state event published yet — the server has an announcement but no refs.
          </Text>
        ) : (
          <Table withRowBorders={false} verticalSpacing={4} horizontalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ref</Table.Th>
                <Table.Th>commit</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {repo.refs.map((ref) => (
                <Table.Tr key={ref.name}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" ff="monospace">
                        {ref.name.replace('refs/heads/', '').replace('refs/tags/', '')}
                      </Text>
                      {ref.name.startsWith('refs/tags/') && (
                        <Badge size="xs" variant="outline" color="gray">
                          tag
                        </Badge>
                      )}
                      {ref.name === repo.head && (
                        <Badge size="xs" variant="light" color="grape">
                          HEAD
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" ff="monospace" c="dimmed">
                        {shortId(ref.commit, 12)}
                      </Text>
                      <CopyIcon value={ref.commit} />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {headCommit && (
          <Text size="xs" c="dimmed">
            HEAD → {repo.head?.replace('refs/heads/', '')} @ {shortId(headCommit, 12)}
          </Text>
        )}

        {(repo.web.length > 0 || repo.relays.length > 0) && (
          <Group gap="lg" wrap="wrap">
            {repo.web.length > 0 && (
              <Anchor href={repo.web[0]} target="_blank" size="sm">
                <Group gap={4} wrap="nowrap">
                  <IconWorld size={14} />
                  browse
                </Group>
              </Anchor>
            )}
            {repo.relays.length > 0 && (
              <Text size="xs" c="dimmed">
                relays: {repo.relays.length}
              </Text>
            )}
          </Group>
        )}

        {showJson && (
          <CodeHighlight
            code={JSON.stringify({ announcement: repo.announcement, state: repo.state }, null, 2)}
            language="json"
            withCopyButton
            mah={360}
            style={{ overflow: 'auto', borderRadius: 8 }}
          />
        )}
      </Stack>
    </Paper>
  );
};

const Index = () => {
  const [hostInput, setHostInput] = useState('');
  const [endpoints, setEndpoints] = useState(() => deriveEndpoints(''));
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState<Map<string, NostrEvent>>(new Map());
  const [states, setStates] = useState<Map<string, NostrEvent>>(new Map());
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback((relay: string) => {
    if (!relay) return;
    wsRef.current?.close();
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setAnnouncements(new Map());
    setStates(new Map());
    setError('');
    setStatus('connecting');
    setLoading(true);

    const ws = new WebSocket(relay);
    wsRef.current = ws;
    const subId = `grasp-${Math.random().toString(36).slice(2, 10)}`;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify(['REQ', subId, { kinds: [KIND_REPO_ANNOUNCEMENT, KIND_REPO_STATE] }]));
    };
    ws.onerror = () => {
      setStatus('error');
      setError('could not connect to the grasp relay (check the url and that the server trusts your browser cert)');
      setLoading(false);
    };
    ws.onclose = () => {
      setStatus((prev) => (prev === 'error' ? prev : 'closed'));
      setLoading(false);
    };
    ws.onmessage = (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(msg.data as string);
      } catch {
        return;
      }
      if (!Array.isArray(data)) return;
      const [type] = data;
      if (type === 'EVENT') {
        const event = data[2] as NostrEvent;
        const identifier = firstTag(event, 'd');
        const key = `${event.pubkey}:${identifier}`;
        if (event.kind === KIND_REPO_ANNOUNCEMENT) {
          setAnnouncements((prev) => {
            const existing = prev.get(key);
            if (existing && existing.created_at >= event.created_at) return prev;
            return new Map(prev).set(key, event);
          });
        } else if (event.kind === KIND_REPO_STATE) {
          setStates((prev) => {
            const existing = prev.get(key);
            if (existing && existing.created_at >= event.created_at) return prev;
            return new Map(prev).set(key, event);
          });
        }
      } else if (type === 'EOSE') {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => setLoading(false), EOSE_SETTLE_MS);
      }
    };
  }, []);

  // Auto-connect in embedded mode (relay/server passed by relaykit).
  useEffect(() => {
    const initial = deriveEndpoints('');
    if (initial.relay) {
      setEndpoints(initial);
      connect(initial.relay);
    }
    return () => {
      wsRef.current?.close();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [connect]);

  const handleConnect = () => {
    const next = deriveEndpoints(hostInput);
    if (!next.relay) {
      setError('enter a grasp server host, e.g. grasp.example.com');
      return;
    }
    setEndpoints(next);
    connect(next.relay);
  };

  const repos = useMemo(() => {
    const list: Repo[] = [];
    for (const [key, announcement] of announcements) {
      list.push(buildRepo(announcement, states.get(key)));
    }
    list.sort((a, b) => b.announcement.created_at - a.announcement.created_at);
    return list;
  }, [announcements, states]);

  const statusColor: Record<ConnectionState, string> = {
    idle: 'gray',
    connecting: 'yellow',
    connected: 'teal',
    closed: 'gray',
    error: 'red',
  };

  return (
    <Box p={isEmbedded ? 'md' : 'xl'} maw={960} mx="auto">
      <Stack gap="lg">
        {!isEmbedded && (
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconGitBranch size={24} />
              <Title order={3}>grasp explorer</Title>
            </Group>
          </Group>
        )}

        {!params.get('relay') && (
          <Group gap="xs" align="flex-end">
            <TextInput
              label="grasp server"
              placeholder="grasp.example.com"
              value={hostInput}
              onChange={(e) => setHostInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              style={{ flex: 1 }}
            />
            <Button leftSection={<IconPlugConnected size={16} />} onClick={handleConnect}>
              connect
            </Button>
          </Group>
        )}

        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Badge color={statusColor[status]} variant="light" size="sm">
              {status}
            </Badge>
            {endpoints.host && (
              <Text size="sm" c="dimmed" ff="monospace">
                {endpoints.host}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            {loading && <Loader size="xs" />}
            <Text size="sm" c="dimmed">
              {repos.length} repo{repos.length === 1 ? '' : 's'}
            </Text>
            <Tooltip label="refresh" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => endpoints.relay && connect(endpoints.relay)}
                disabled={!endpoints.relay}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {error && (
          <Paper withBorder radius="md" p="sm" bg="var(--mantine-color-red-light)">
            <Text size="sm" c="red">
              {error}
            </Text>
          </Paper>
        )}

        <ScrollArea.Autosize mah={isEmbedded ? 'calc(100vh - 160px)' : undefined}>
          <Stack gap="md">
            {!loading && repos.length === 0 && status === 'connected' && (
              <Paper withBorder radius="md" p="xl">
                <Stack align="center" gap="xs">
                  <IconGitBranch size={32} opacity={0.4} />
                  <Text c="dimmed">no repositories hosted on this grasp server yet</Text>
                  <Text size="sm" c="dimmed">
                    push one with: <Code>ngit init --grasp-server {endpoints.relay || 'wss://…'}</Code>
                  </Text>
                </Stack>
              </Paper>
            )}
            {repos.map((repo) => (
              <RepoCard key={repo.key} repo={repo} />
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Box>
  );
};

export default Index;
