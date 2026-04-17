import { useSeoMeta } from '@unhead/react';
import { useState, useEffect } from 'react';
import {
  Anchor,
  Box,
  Button,
  Collapse,
  Flex,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  rem,
} from '@mantine/core';
import { ChevronDown, Trash2, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface NostrFilter {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  limit?: number;
}

const COMMON_KINDS = [
  { value: 0, label: 'Metadata' },
  { value: 1, label: 'Text Note' },
  { value: 3, label: 'Contacts' },
  { value: 4, label: 'Encrypted DM' },
  { value: 5, label: 'Delete' },
  { value: 6, label: 'Repost' },
  { value: 7, label: 'Reaction' },
  { value: 9735, label: 'Zap' },
  { value: 10002, label: 'Relay List' },
  { value: 30023, label: 'Long-form' },
  { value: 31990, label: 'App Handler' },
];

const Index = () => {
  useSeoMeta({
    title: 'Relay Note Explorer',
    description: 'Simple Nostr relay explorer to view events from any relay',
  });

  const { user } = useCurrentUser();

  const [iframeMode, setIframeMode] = useState(false);
  const [iframeRelay, setIframeRelay] = useState<string | null>(null);

  const [relayUrl, setRelayUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const relayParam = params.get('relay');
    if (relayParam) {
      return relayParam;
    }
    return localStorage.getItem('relay-explorer:url') || '';
  });

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState<string>('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionTimeout, setConnectionTimeout] = useState<NodeJS.Timeout | null>(null);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [authorNpub, setAuthorNpub] = useState('');
  const [eventId, setEventId] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<number[]>([]);
  const [customKind, setCustomKind] = useState('');
  const [kindSearchQuery, setKindSearchQuery] = useState('');
  const [showKindDropdown, setShowKindDropdown] = useState(false);

  const isValidUrl = relayUrl.length > 0;
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const relayParam = params.get('relay');

    if (relayParam) {
      setIframeMode(true);
      setIframeRelay(relayParam);
      setRelayUrl(relayParam);
    }
  }, []);

  useEffect(() => {
    if (relayUrl && !iframeMode) {
      localStorage.setItem('relay-explorer:url', relayUrl);
    }
  }, [relayUrl, iframeMode]);

  useEffect(() => {
    if (ws && isConnected) {
      const timer = setTimeout(() => {
        ws.send(JSON.stringify(['CLOSE', 'all-events']));
        setEvents([]);
        setSelectedEvent(null);
        const filter = buildFilter();
        console.log('AUTO-RESUBSCRIBE with filter:', filter);
        ws.send(JSON.stringify(['REQ', 'all-events', filter]));
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [eventId, authorNpub, selectedKinds, isConnected, ws]); // eslint-disable-line react-hooks/exhaustive-deps -- buildFilter closure

  useEffect(() => {
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws]);

  useEffect(() => {
    if (iframeMode && iframeRelay && !isConnected && !isConnecting) {
      setTimeout(() => {
        handleConnect();
      }, 100);
    }
  }, [iframeMode, iframeRelay]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot iframe connect

  const buildFilter = (): NostrFilter => {
    const filter: NostrFilter = {};

    if (eventId.trim()) {
      filter.ids = [eventId.trim()];
    }

    if (selectedKinds.length > 0) {
      filter.kinds = selectedKinds;
    }

    if (authorNpub.trim()) {
      try {
        const decoded = nip19.decode(authorNpub.trim());
        if (decoded.type === 'npub') {
          filter.authors = [decoded.data];
        } else if (decoded.type === 'nprofile') {
          filter.authors = [decoded.data.pubkey];
        }
      } catch (e) {
        console.error('Invalid npub:', e);
      }
    }

    filter.limit = 500;

    return filter;
  };

  const handleConnect = () => {
    if (connectionState === 'connected' || connectionState === 'connecting') {
      if (ws) {
        ws.close();
      }
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      setWs(null);
      setConnectionState('disconnected');
      setConnectionError('');
      setEvents([]);
      setSelectedEvent(null);
      return;
    }

    let url = relayUrl;
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = url.includes('.local') ? `ws://${url}` : `wss://${url}`;
    }
    setConnectionState('connecting');
    setConnectionError('');

    console.log('Connecting to:', url);

    const websocket = new WebSocket(url);

    const timeout = setTimeout(() => {
      if (websocket.readyState === WebSocket.CONNECTING) {
        console.log('⏱️ Connection timeout - closing');
        websocket.close();
        setConnectionState('disconnected');
        setConnectionError('Connection timeout - relay took too long to respond');
      }
    }, 10000);

    setConnectionTimeout(timeout);

    websocket.onopen = () => {
      console.log('✅ WebSocket connected successfully');
      clearTimeout(timeout);
      setConnectionState('connected');
      setConnectionError('');
      const filter = buildFilter();
      console.log('📤 Sending REQ with filter:', filter);
      const subscription = JSON.stringify(['REQ', 'all-events', filter]);
      websocket.send(subscription);
    };

    websocket.onmessage = async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        console.log('📨 Received message:', data);

        if (data[0] === 'AUTH' && data[1]) {
          const challenge = data[1];
          console.log('🔐 AUTH challenge received:', challenge);

          if (user && user.signer) {
            try {
              const authEvent = await user.signer.signEvent({
                kind: 22242,
                content: '',
                tags: [
                  ['relay', url],
                  ['challenge', challenge],
                ],
                created_at: Math.floor(Date.now() / 1000),
              });

              console.log('🔑 Sending AUTH response:', authEvent);
              websocket.send(JSON.stringify(['AUTH', authEvent]));
            } catch (e) {
              console.error('❌ Failed to sign AUTH event:', e);
              setConnectionError('Failed to authenticate - check your signer');
            }
          } else {
            console.warn('⚠️ AUTH challenge received but user not logged in');
            setConnectionError('Authentication required - please log in');
          }
        }

        if (data[0] === 'EVENT' && data[2]) {
          console.log('📄 Event received:', data[2].kind, data[2].id.substring(0, 8));
          setEvents((prev) => {
            if (prev.some((e) => e.id === data[2].id)) {
              return prev;
            }
            return [...prev, data[2]].sort((a, b) => b.created_at - a.created_at);
          });
        }

        if (data[0] === 'CLOSED') {
          console.log('🚫 Subscription closed:', data[1], 'reason:', data[2]);
          setConnectionError(`Subscription closed: ${data[2] || 'Unknown reason'}`);
        }

        if (data[0] === 'OK') {
          console.log('✅ OK response:', data);
        }

        if (data[0] === 'NOTICE') {
          console.log('📢 NOTICE:', data[1]);
          setConnectionError(`Relay notice: ${data[1]}`);
        }

        if (data[0] === 'EOSE') {
          console.log('✔️ EOSE - End of stored events for subscription:', data[1]);
        }
      } catch (e) {
        console.error('❌ Failed to parse message:', e, 'raw:', msg.data);
      }
    };

    websocket.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      clearTimeout(timeout);
      setConnectionError('Connection failed - check relay URL or network');
      setConnectionState('disconnected');
    };

    websocket.onclose = (event) => {
      console.log('🔌 WebSocket closed - code:', event.code, 'reason:', event.reason || 'none', 'clean:', event.wasClean);
      clearTimeout(timeout);

      if (event.code === 1006) {
        setConnectionError('Connection failed - DNS/network error (is the relay reachable?)');
      } else if (event.code !== 1000) {
        setConnectionError(`Connection closed (code ${event.code}): ${event.reason || 'Unknown reason'}`);
      }
      setConnectionState('disconnected');
    };

    setWs(websocket);
  };

  const handleRelayUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRelayUrl(e.target.value);
  };

  const handleAddKind = (kind: number) => {
    if (!selectedKinds.includes(kind)) {
      setSelectedKinds([...selectedKinds, kind]);
    }
    setKindSearchQuery('');
    setShowKindDropdown(false);
  };

  const handleRemoveKind = (kind: number) => {
    setSelectedKinds(selectedKinds.filter((k) => k !== kind));
  };

  const handleAddCustomKind = () => {
    const kind = parseInt(customKind, 10);
    if (!isNaN(kind) && kind >= 0 && !selectedKinds.includes(kind)) {
      setSelectedKinds([...selectedKinds, kind]);
      setCustomKind('');
    }
  };

  const handleDeleteEvent = async (eventIdToDelete: string) => {
    if (!user) {
      alert('You must be logged in to delete events');
      return;
    }

    if (!ws || !isConnected) return;

    try {
      const unsignedEvent = {
        kind: 5,
        content: 'Deleted via relay-explorer',
        tags: [['e', eventIdToDelete]],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await user.signer.signEvent(unsignedEvent);

      console.log('Sending deletion event:', signedEvent);

      ws.send(JSON.stringify(['EVENT', signedEvent]));

      setTimeout(() => {
        if (ws && isConnected) {
          ws.send(JSON.stringify(['CLOSE', 'all-events']));
          setEvents([]);
          setSelectedEvent(null);
          const filter = buildFilter();
          ws.send(JSON.stringify(['REQ', 'all-events', filter]));
        }
      }, 500);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const filteredCommonKinds = COMMON_KINDS.filter(
    (k) =>
      k.label.toLowerCase().includes(kindSearchQuery.toLowerCase()) ||
      k.value.toString().includes(kindSearchQuery),
  );

  const protocolPrefix =
    relayUrl.includes('.local') || relayUrl.startsWith('ws://') ? 'ws://' : 'wss://';

  const listHeight = iframeMode ? 'calc(100vh - 120px)' : 'calc(100vh - 340px)';

  const renderKindPills = () =>
    selectedKinds.length > 0 ? (
      <Group gap={6} mt="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        {selectedKinds
          .slice()
          .sort((a, b) => a - b)
          .map((kind) => (
            <UnstyledButton
              key={kind}
              onClick={() => handleRemoveKind(kind)}
              px={6}
              py={2}
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                background: 'var(--mantine-color-body)',
              }}
            >
              <Group gap={4} wrap="nowrap">
                <Text size="xs" ff="monospace" c="dimmed">
                  {kind}
                </Text>
                <Text size="xs" c="dimmed">
                  ·
                </Text>
                <Text size="xs" ff="monospace">
                  {COMMON_KINDS.find((k) => k.value === kind)?.label || 'Custom'}
                </Text>
                <X size={12} color="var(--mantine-color-dimmed)" />
              </Group>
            </UnstyledButton>
          ))}
      </Group>
    ) : null;

  const renderFiltersGrid = (ids: { event: string; author: string }) => (
    <Box>
      <Group grow align="flex-start" gap="xs" wrap="wrap">
        <Stack gap={4}>
          <Text component="label" htmlFor={ids.event} size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Event ID
          </Text>
          <TextInput
            id={ids.event}
            placeholder="hex event id..."
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            size="xs"
            ff="monospace"
          />
        </Stack>
        <Stack gap={4}>
          <Text component="label" htmlFor={ids.author} size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Authors
          </Text>
          <TextInput
            id={ids.author}
            placeholder="npub1..."
            value={authorNpub}
            onChange={(e) => setAuthorNpub(e.target.value)}
            size="xs"
            ff="monospace"
          />
        </Stack>
        <Stack gap={4}>
          <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Kinds
          </Text>
          <Group gap={6} wrap="nowrap" align="flex-start">
            <Box pos="relative" style={{ flex: 1, minWidth: rem(120) }}>
              <TextInput
                placeholder="Search..."
                value={kindSearchQuery}
                onChange={(e) => {
                  setKindSearchQuery(e.target.value);
                  setShowKindDropdown(true);
                }}
                onFocus={() => setShowKindDropdown(true)}
                onBlur={() => setTimeout(() => setShowKindDropdown(false), 200)}
                size="xs"
                ff="monospace"
              />
              {showKindDropdown && kindSearchQuery && filteredCommonKinds.length > 0 && (
                <Paper
                  withBorder
                  shadow="md"
                  pos="absolute"
                  left={0}
                  right={0}
                  top="calc(100% + 4px)"
                  mah={192}
                  style={{ zIndex: 10, overflowY: 'auto' }}
                >
                  {filteredCommonKinds.map((kind) => (
                    <UnstyledButton
                      key={kind.value}
                      onClick={() => handleAddKind(kind.value)}
                      w="100%"
                      px="sm"
                      py={8}
                      style={{ textAlign: 'left' }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" ff="monospace">
                          {kind.label}
                        </Text>
                        <Text size="xs" ff="monospace" c="dimmed">
                          {kind.value}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Paper>
              )}
            </Box>
            <TextInput
              type="number"
              placeholder="#"
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomKind()}
              size="xs"
              w={48}
              ta="center"
              ff="monospace"
              min={0}
            />
            <Button
              onClick={handleAddCustomKind}
              disabled={!customKind || isNaN(parseInt(customKind, 10))}
              size="xs"
              variant="default"
            >
              +
            </Button>
          </Group>
        </Stack>
      </Group>
      {renderKindPills()}
    </Box>
  );

  return (
    <Box mih="100vh" bg="var(--mantine-color-body)">
      <Box maw={1200} mx="auto" p="md">
        {!iframeMode && (
          <Box mb="lg" pb="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Box>
                <Text size="xl" fw={600} ff="monospace" mb={4}>
                  relay-explorer
                </Text>
                <Text size="sm" c="dimmed" ff="monospace">
                  WebSocket event inspector for Nostr relays
                </Text>
              </Box>
              <LoginArea w={240} />
            </Group>
          </Box>
        )}

        {!iframeMode && (
          <Paper withBorder p="md" mb="lg" radius={0}>
            <Group gap="sm" align="flex-start" wrap="nowrap" mb="sm">
              <TextInput
                style={{ flex: 1 }}
                type="text"
                placeholder="relay.ditto.pub (or chapartest.local)"
                value={relayUrl}
                onChange={handleRelayUrlChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValidUrl && !isConnected && !isConnecting) {
                    handleConnect();
                  }
                }}
                disabled={isConnected || isConnecting}
                leftSection={
                  <Text size="xs" c="dimmed" ff="monospace" style={{ minWidth: rem(44) }}>
                    {protocolPrefix}
                  </Text>
                }
                size="sm"
                ff="monospace"
              />
              <Button
                onClick={handleConnect}
                disabled={!isValidUrl && !isConnected && !isConnecting}
                color={isConnected ? 'red' : undefined}
                loading={isConnecting}
                size="sm"
                ff="monospace"
              >
                {isConnecting ? 'connecting...' : isConnected ? 'disconnect' : 'connect'}
              </Button>
            </Group>

            {connectionError && (
              <Paper p="sm" mb="sm" radius={0} bg="var(--mantine-color-red-light)" c="var(--mantine-color-red-filled)">
                <Text size="xs" ff="monospace">
                  ⚠ {connectionError}
                </Text>
              </Paper>
            )}

            <Stack gap="xs">
              <UnstyledButton onClick={() => setShowAdvanced((o) => !o)} c="dimmed">
                <Group gap={6}>
                  <Text size="xs" ff="monospace" tt="uppercase">
                    filters
                  </Text>
                  <ChevronDown
                    size={12}
                    style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined }}
                  />
                  {isConnected && (selectedKinds.length > 0 || authorNpub || eventId) && (
                    <>
                      <Text size="xs" c="dimmed">
                        ·
                      </Text>
                      <Text size="xs" c="dimmed">
                        live update enabled
                      </Text>
                    </>
                  )}
                </Group>
              </UnstyledButton>

              <Collapse in={showAdvanced}>
                <Box pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                  {renderFiltersGrid({ event: 'event-id', author: 'author-npub' })}
                </Box>
              </Collapse>
            </Stack>
          </Paper>
        )}

        {iframeMode && (
          <Box mb="md" pb="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="xs">
                <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                  Connected to
                </Text>
                <Text size="xs" ff="monospace" c="dimmed">
                  {relayUrl}
                </Text>
              </Group>
              <Group gap="md">
                <UnstyledButton onClick={() => setShowAdvanced((o) => !o)} c="dimmed">
                  <Group gap={6}>
                    <Text size="xs" ff="monospace" tt="uppercase">
                      filters
                    </Text>
                    <ChevronDown
                      size={12}
                      style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined }}
                    />
                  </Group>
                </UnstyledButton>
                <Text size="xs" ff="monospace" c="dimmed">
                  {events.length} events
                </Text>
                <LoginArea w={160} />
              </Group>
            </Group>

            <Collapse in={showAdvanced}>
              <Box pt="sm" mt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                {renderFiltersGrid({ event: 'event-id-iframe', author: 'author-npub-iframe' })}
              </Box>
            </Collapse>
          </Box>
        )}

        {(isConnected || isConnecting) && (
          <Flex gap="md" align="stretch" direction={{ base: 'column', md: 'row' }}>
            <Box style={{ flex: '5 1 0%', minWidth: 0 }}>
              <Paper withBorder radius={0} h={listHeight} style={{ overflow: 'hidden' }}>
                <Stack gap={0} h="100%">
                  <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                    <Group justify="space-between">
                      <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                        Events
                      </Text>
                      <Text size="xs" ff="monospace" c="dimmed">
                        {events.length}
                      </Text>
                    </Group>
                  </Box>
                  <ScrollArea flex={1} type="auto">
                    {events.length === 0 ? (
                      <Box p="xl" ta="center">
                        <Text size="xs" ff="monospace" c="dimmed">
                          Listening for events...
                        </Text>
                      </Box>
                    ) : (
                      <Stack gap={0}>
                        {events.map((event) => (
                          <Box
                            key={event.id}
                            pos="relative"
                            style={{
                              borderBottom: '1px solid var(--mantine-color-default-border)',
                            }}
                            className="relay-explorer-event-row"
                          >
                            <UnstyledButton
                              onClick={() => setSelectedEvent(event)}
                              w="100%"
                              p="md"
                              styles={{
                                root: {
                                  textAlign: 'left',
                                  background:
                                    selectedEvent?.id === event.id
                                      ? 'color-mix(in srgb, var(--mantine-primary-color-filled) 15%, transparent)'
                                      : undefined,
                                  borderLeft:
                                    selectedEvent?.id === event.id
                                      ? '2px solid var(--mantine-primary-color-filled)'
                                      : undefined,
                                  '&:hover': {
                                    backgroundColor: 'var(--mantine-color-default-hover)',
                                  },
                                },
                              }}
                            >
                              <Group justify="space-between" align="flex-start" wrap="nowrap" mb={8}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="xs" ff="monospace" c="dimmed">
                                    kind
                                  </Text>
                                  <Text size="xs" ff="monospace">
                                    {event.kind}
                                  </Text>
                                </Group>
                                <Box ta="right">
                                  <Text size="xs" ff="monospace" c="dimmed">
                                    {new Date(event.created_at * 1000).toLocaleTimeString('en-US', {
                                      hour12: false,
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </Text>
                                  <Text fz={10} ff="monospace" c="dimmed">
                                    ({formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true })})
                                  </Text>
                                </Box>
                              </Group>
                              <Text size="xs" ff="monospace" c="dimmed" truncate mb={4}>
                                {event.id.substring(0, 32)}...
                              </Text>
                              {event.content && (
                                <Text size="xs" truncate pr={32}>
                                  {event.content.substring(0, 60)}
                                  {event.content.length > 60 ? '...' : ''}
                                </Text>
                              )}
                            </UnstyledButton>
                            {user && event.pubkey === user.pubkey && (
                              <UnstyledButton
                                pos="absolute"
                                right={8}
                                bottom={8}
                                p={4}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEvent(event.id);
                                }}
                                title="Delete your event (kind 5)"
                                style={{
                                  opacity: 0,
                                  background: 'rgba(127, 29, 29, 0.9)',
                                  border: '1px solid rgb(185, 28, 28)',
                                }}
                                className="relay-explorer-delete-btn"
                              >
                                <Trash2 size={12} color="rgb(254, 202, 202)" />
                              </UnstyledButton>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </ScrollArea>
                </Stack>
              </Paper>
            </Box>

            <Box style={{ flex: '8 1 0%', minWidth: 0 }}>
              <Paper withBorder radius={0} h={listHeight} style={{ overflow: 'hidden' }}>
                <Stack gap={0} h="100%">
                  <Box px="md" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                    <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                      Event Inspector
                    </Text>
                  </Box>
                  <ScrollArea flex={1} p="md" type="auto">
                    {selectedEvent ? (
                      <Text component="pre" size="xs" ff="monospace" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                        {JSON.stringify(selectedEvent, null, 2)}
                      </Text>
                    ) : (
                      <Flex align="center" justify="center" mih={200}>
                        <Text size="xs" ff="monospace" c="dimmed">
                          Select an event to inspect
                        </Text>
                      </Flex>
                    )}
                  </ScrollArea>
                </Stack>
              </Paper>
            </Box>
          </Flex>
        )}

        {!iframeMode && (
          <Box mt="lg" ta="center">
            <Anchor href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" size="xs" ff="monospace" c="dimmed">
              built with shakespeare
            </Anchor>
          </Box>
        )}
      </Box>
      <style>{`
        .relay-explorer-event-row:hover .relay-explorer-delete-btn {
          opacity: 1 !important;
        }
      `}</style>
    </Box>
  );
};

export default Index;
