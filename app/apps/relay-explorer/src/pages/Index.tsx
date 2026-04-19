import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Combobox,
  Flex,
  Group,
  Menu,
  Pill,
  PillsInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  UnstyledButton,
  rem,
  useCombobox,
} from '@mantine/core';
import { CodeHighlight } from '@mantine/code-highlight';
import { Trash2 } from 'lucide-react';
import { IconBraces, IconChevronDown, IconTable, IconX } from '@tabler/icons-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { formatDistanceToNow } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import LoginDialog from '@/components/auth/LoginDialog';
import { CopyControl } from '@/components/CopyControl';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface NostrFilter {
  ids?: string[];
  kinds?: number[];
  authors?: string[];
  limit?: number;
}

const PREVIOUS_RELAYS_STORAGE_KEY = 'relay-explorer:previous-relays';
const MAX_PREVIOUS_RELAYS = 20;
const MAX_EVENT_COUNT = 500;

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

const normalizeRelayUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed;
  }
  return `wss://${trimmed}`;
};

const isStandaloneEmbeddedMode = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.get('standalone') === '1';
};

const Index = () => {
  const { user } = useCurrentUser();
  const standaloneEmbeddedMode = isStandaloneEmbeddedMode();

  const [iframeMode, setIframeMode] = useState(false);
  const [iframeRelay, setIframeRelay] = useState<string | null>(null);

  const [relayUrl, setRelayUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('standalone') === '1') {
      return '';
    }
    const relayParam = params.get('relay');
    if (relayParam) {
      return relayParam;
    }
    return localStorage.getItem('relay-explorer:url') || '';
  });
  const [relayDraft, setRelayDraft] = useState('');
  const [previousRelays, setPreviousRelays] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PREVIOUS_RELAYS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((relay) => normalizeRelayUrl(String(relay ?? '').trim()))
        .filter(Boolean);
    } catch {
      return [];
    }
  });

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState<string>('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionTimeout, setConnectionTimeout] = useState<NodeJS.Timeout | null>(null);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<NostrEvent | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const [authorNpub, setAuthorNpub] = useState('');
  const [authorDraft, setAuthorDraft] = useState('');
  const [eventId, setEventId] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<number[]>([]);
  const [kindSearchQuery, setKindSearchQuery] = useState('');
  const [showKindDropdown, setShowKindDropdown] = useState(false);
  const [showInspectorTable, setShowInspectorTable] = useState(true);
  const [showInspectorJson, setShowInspectorJson] = useState(true);
  const relayCombobox = useCombobox();

  const { currentUser, removeLogin } = useLoggedInAccounts();

  const isValidUrl = relayUrl.length > 0;
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const hasActiveConnection = isConnected || isConnecting;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embeddedParam = params.get('embedded');
    const relayParam = params.get('relay');
    const standaloneParam = params.get('standalone');

    if (standaloneParam === '1') {
      setIframeMode(true);
      setIframeRelay(null);
      setRelayUrl('');
      return;
    }

    if (embeddedParam === '1') {
      setIframeMode(true);
    }

    if (relayParam) {
      setIframeRelay(relayParam);
      setRelayUrl(relayParam);
    }
  }, []);

  useEffect(() => {
    if (relayUrl && !iframeMode && !standaloneEmbeddedMode) {
      localStorage.setItem('relay-explorer:url', relayUrl);
    }
  }, [relayUrl, iframeMode, standaloneEmbeddedMode]);

  useEffect(() => {
    setRelayDraft('');
  }, [relayUrl]);

  useEffect(() => {
    setAuthorDraft('');
  }, [authorNpub]);

  useEffect(() => {
    if (ws && isConnected) {
      const timer = setTimeout(() => {
        ws.send(JSON.stringify(['CLOSE', 'all-events']));
        seenEventIdsRef.current.clear();
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

  const disconnectRelay = () => {
    if (ws) {
      ws.close();
    }
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    setWs(null);
    setConnectionState('disconnected');
    setConnectionError('');
    seenEventIdsRef.current.clear();
    setEvents([]);
    setSelectedEvent(null);
  };

  const connectToRelay = (inputRelayUrl: string) => {
    const url = normalizeRelayUrl(inputRelayUrl);
    if (!url) return;
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
          const incomingEvent = data[2] as NostrEvent;
          setEvents((prev) => {
            if (seenEventIdsRef.current.has(incomingEvent.id)) {
              return prev;
            }
            seenEventIdsRef.current.add(incomingEvent.id);
            const next = [...prev];
            const insertAt = next.findIndex((existingEvent) => existingEvent.created_at < incomingEvent.created_at);
            if (insertAt === -1) {
              next.push(incomingEvent);
            } else {
              next.splice(insertAt, 0, incomingEvent);
            }
            if (next.length > MAX_EVENT_COUNT) {
              const removedEvents = next.splice(MAX_EVENT_COUNT);
              removedEvents.forEach((event) => seenEventIdsRef.current.delete(event.id));
            }
            return next;
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

  const handleConnect = () => {
    if (connectionState === 'connected' || connectionState === 'connecting') {
      disconnectRelay();
      return;
    }
    connectToRelay(relayUrl);
  };

  const handleRelayUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRelayDraft(e.target.value);
    relayCombobox.openDropdown();
    relayCombobox.resetSelectedOption();
  };

  const persistPreviousRelays = (nextRelays: string[]) => {
    setPreviousRelays(nextRelays);
    try {
      localStorage.setItem(PREVIOUS_RELAYS_STORAGE_KEY, JSON.stringify(nextRelays));
    } catch {
      // ignore storage failures
    }
  };

  const addPreviousRelay = (relay: string, serviceRelayOptions: string[]) => {
    if (serviceRelayOptions.includes(relay)) return;
    const nextRelays = [relay, ...previousRelays.filter((entry) => entry !== relay)].slice(0, MAX_PREVIOUS_RELAYS);
    persistPreviousRelays(nextRelays);
  };

  const removePreviousRelay = (relay: string) => {
    const nextRelays = previousRelays.filter((entry) => entry !== relay);
    persistPreviousRelays(nextRelays);
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

  const commitRelayDraft = ({ persistPrevious = false }: { persistPrevious?: boolean } = {}) => {
    const nextRelay = relayDraft.trim();
    if (!nextRelay) return;
    const normalizedRelay = normalizeRelayUrl(nextRelay);
    if (persistPrevious) {
      addPreviousRelay(normalizedRelay, serviceRelayOptions);
    }
    const hasChanged = normalizedRelay !== relayUrl;
    setRelayUrl(normalizedRelay);
    setRelayDraft('');
    if (iframeMode && hasChanged) {
      disconnectRelay();
      setTimeout(() => connectToRelay(normalizedRelay), 50);
    }
  };

  const selectRelayOption = (nextRelay: string) => {
    const normalizedRelay = normalizeRelayUrl(nextRelay);
    if (!normalizedRelay) return;
    const hasChanged = normalizedRelay !== relayUrl;
    setRelayUrl(normalizedRelay);
    setRelayDraft('');
    relayCombobox.closeDropdown();
    if (iframeMode && hasChanged) {
      disconnectRelay();
      setTimeout(() => connectToRelay(normalizedRelay), 50);
    }
  };

  const clearRelayValue = () => {
    disconnectRelay();
    setRelayDraft('');
    setRelayUrl('');
  };

  const commitAuthorDraft = () => {
    const nextAuthor = authorDraft.trim();
    if (!nextAuthor) return;
    setAuthorNpub(nextAuthor);
    setAuthorDraft('');
  };

  const clearAuthor = () => {
    setAuthorDraft('');
    setAuthorNpub('');
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
          seenEventIdsRef.current.clear();
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

  const serviceRelayOptions = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const relaysParam = params.get('relays');
    if (!relaysParam) return [];
    return Array.from(
      new Set(
        relaysParam
          .split(',')
          .map((relay) => normalizeRelayUrl(relay.trim()))
          .filter(Boolean),
      ),
    );
  }, []);

  const filteredRelayOptions = useMemo(() => {
    const query = relayDraft.trim().toLowerCase();
    const serviceOptions = serviceRelayOptions
      .filter((relay) => !query || relay.toLowerCase().includes(query))
      .map((relay) => ({ value: relay, source: 'service' as const }));
    const previousOptions = previousRelays
      .filter((relay) => !serviceRelayOptions.includes(relay))
      .filter((relay) => !query || relay.toLowerCase().includes(query))
      .map((relay) => ({ value: relay, source: 'previous' as const }));
    return [...serviceOptions, ...previousOptions];
  }, [serviceRelayOptions, previousRelays, relayDraft]);

  const protocolPrefix = relayUrl.startsWith('ws://') ? 'ws://' : 'wss://';
  const currentNpub = (() => {
    if (!currentUser) return '';
    try {
      return nip19.npubEncode(currentUser.pubkey);
    } catch {
      return '';
    }
  })();

  const listHeight = iframeMode ? undefined : 'calc(100vh - 340px)';

  const eventListRows = useMemo(
    () =>
      events.map((event) => ({
        event,
        timeLabel: new Date(event.created_at * 1000).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        ageLabel: formatDistanceToNow(new Date(event.created_at * 1000), { addSuffix: true }),
        idPreview: `${event.id.substring(0, 32)}...`,
        contentPreview: event.content ? `${event.content.substring(0, 60)}${event.content.length > 60 ? '...' : ''}` : '',
      })),
    [events],
  );

  const selectedEventJson = useMemo(
    () => (selectedEvent ? JSON.stringify(selectedEvent, null, 2) : ''),
    [selectedEvent],
  );

  const handleKindQuerySubmit = () => {
    const query = kindSearchQuery.trim();
    if (!query) return;

    const numericKind = Number.parseInt(query, 10);
    if (!Number.isNaN(numericKind)) {
      handleAddKind(numericKind);
      return;
    }

    if (filteredCommonKinds.length > 0) {
      handleAddKind(filteredCommonKinds[0].value);
    }
  };

  const formatPillValue = (value: string, max = 28) =>
    value.length > max ? `${value.slice(0, max)}...` : value;

  const formatNpubMiddle = (value: string) => {
    if (value.length <= 16) return value;
    return `${value.slice(0, 8)}...${value.slice(-4)}`;
  };

  const pillInputStyles = { input: { minHeight: rem(44), fontSize: rem(14), alignItems: 'center' } };

  const renderRelayPillInput = (id: string) => (
    <Combobox
      store={relayCombobox}
      withinPortal={false}
      onOptionSubmit={(value) => selectRelayOption(value)}
    >
      <Combobox.Target>
        <PillsInput
          style={{ flex: 1 }}
          radius={0}
          styles={pillInputStyles}
          onClick={() => {
            relayCombobox.openDropdown();
            relayCombobox.resetSelectedOption();
          }}
          onKeyDownCapture={(e) => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && relayDraft.trim().length === 0 && relayUrl) {
              e.preventDefault();
              clearRelayValue();
            }
          }}
        >
          <Pill.Group>
            {relayUrl && (
              <Pill
                color="relaykit"
                variant="light"
                withRemoveButton
                onRemove={clearRelayValue}
                title={relayUrl}
                style={{ flexShrink: 0 }}
              >
                {protocolPrefix}
                {formatPillValue(relayUrl.replace(/^wss?:\/\//, ''), 38)}
              </Pill>
            )}
            <PillsInput.Field
              id={id}
              aria-label="relay url"
              value={relayDraft}
              onChange={handleRelayUrlChange}
              onFocus={() => {
                relayCombobox.openDropdown();
                relayCombobox.resetSelectedOption();
              }}
              onBlur={() => {
                commitRelayDraft();
                relayCombobox.closeDropdown();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (!relayCombobox.dropdownOpened || filteredRelayOptions.length === 0)) {
                  commitRelayDraft({ persistPrevious: true });
                  if (isValidUrl && !isConnected && !isConnecting) {
                    handleConnect();
                  }
                }
                if ((e.key === 'Backspace' || e.key === 'Delete') && relayDraft.trim().length === 0 && relayUrl) {
                  e.preventDefault();
                  clearRelayValue();
                }
              }}
              disabled={false}
              placeholder={relayUrl ? 'paste a new relay url and press enter...' : 'relay.ditto.pub or chapartest.local'}
              style={{
                flex: 1,
                minWidth: rem(140),
                height: rem(30),
                lineHeight: 1.2,
                paddingTop: 0,
                paddingBottom: 0,
                alignSelf: 'center',
                opacity: relayUrl ? 0.9 : 1,
              }}
            />
          </Pill.Group>
        </PillsInput>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={192} style={{ overflowY: 'auto' }}>
          {filteredRelayOptions.length > 0 ? (
            filteredRelayOptions.map((relayOption) => (
              <Combobox.Option
                key={`${relayOption.source}-${relayOption.value}`}
                value={relayOption.value}
                className={relayOption.source === 'service' ? 'relay-option relay-option-service' : 'relay-option relay-option-previous'}
              >
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="xs" ff="monospace" c={relayOption.source === 'service' ? 'relaykit' : 'dimmed'} truncate>
                    {relayOption.value}
                  </Text>
                  {relayOption.source === 'previous' && (
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      aria-label="forget relay"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removePreviousRelay(relayOption.value);
                      }}
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  )}
                </Group>
              </Combobox.Option>
            ))
          ) : (
            <Combobox.Empty>no relay matches</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );

  const renderFiltersGrid = (ids: { event: string; author: string }) => (
    <Box>
      <Group grow align="flex-start" gap="xs" wrap="wrap">
        <Stack gap={4}>
          <Text component="label" htmlFor={ids.event} size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Event ID
          </Text>
          <PillsInput radius={0} styles={pillInputStyles}>
            <Pill.Group>
              <PillsInput.Field
                id={ids.event}
                aria-label="event id filter"
                placeholder="hex event id..."
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                style={{
                  minWidth: rem(140),
                  height: rem(30),
                  lineHeight: 1.2,
                  paddingTop: 0,
                  paddingBottom: 0,
                  alignSelf: 'center',
                }}
              />
            </Pill.Group>
          </PillsInput>
        </Stack>
        <Stack gap={4}>
          <Text component="label" htmlFor={ids.author} size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Authors
          </Text>
          <PillsInput radius={0} styles={pillInputStyles}>
            <Pill.Group>
              {authorNpub && (
                <Pill withRemoveButton onRemove={clearAuthor} title={authorNpub} style={{ flexShrink: 0 }}>
                  {formatPillValue(authorNpub, 24)}
                </Pill>
              )}
              <PillsInput.Field
                id={ids.author}
                aria-label="author filter"
                placeholder={authorNpub ? 'replace author...' : 'npub1... or nprofile1...'}
                value={authorDraft}
                onChange={(e) => setAuthorDraft(e.target.value)}
                onBlur={commitAuthorDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitAuthorDraft();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: rem(120),
                  height: rem(30),
                  lineHeight: 1.2,
                  paddingTop: 0,
                  paddingBottom: 0,
                  alignSelf: 'center',
                }}
              />
            </Pill.Group>
          </PillsInput>
        </Stack>
        <Stack gap={4}>
          <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
            Kinds
          </Text>
          <Box pos="relative" style={{ flex: 1, minWidth: rem(160) }}>
            <PillsInput radius={0} styles={pillInputStyles}>
              <Pill.Group>
                {selectedKinds
                  .slice()
                  .sort((a, b) => a - b)
                  .map((kind) => (
                    <Pill key={kind} withRemoveButton onRemove={() => handleRemoveKind(kind)}>
                      {kind}
                    </Pill>
                  ))}
                <PillsInput.Field
                  aria-label="kinds filter"
                  placeholder="type kind or search..."
                  value={kindSearchQuery}
                  onChange={(e) => {
                    setKindSearchQuery(e.target.value);
                    setShowKindDropdown(true);
                  }}
                  onFocus={() => setShowKindDropdown(true)}
                  onBlur={() => setTimeout(() => setShowKindDropdown(false), 200)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleKindQuerySubmit();
                    }
                    if (e.key === 'Backspace' && kindSearchQuery.length === 0 && selectedKinds.length > 0) {
                      e.preventDefault();
                      const lastKind = selectedKinds[selectedKinds.length - 1];
                      handleRemoveKind(lastKind);
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: rem(120),
                    height: rem(30),
                    lineHeight: 1.2,
                    paddingTop: 0,
                    paddingBottom: 0,
                    alignSelf: 'center',
                  }}
                />
              </Pill.Group>
            </PillsInput>
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
        </Stack>
      </Group>
    </Box>
  );

  const renderAuthControl = () => (
    <Menu shadow="md" position="bottom-end">
      <Menu.Target>
        <Button
          size="md"
          variant="light"
          color="relaykit"
          rightSection={<IconChevronDown size={14} />}
          style={{ maxWidth: '100%', height: rem(44), justifyContent: 'space-between' }}
        >
          <Box ta="left" style={{ minWidth: 0 }}>
            <Text size="sm" ff="monospace">
              {currentUser ? 'authed' : 'authenticate'}
            </Text>
            {currentUser && (
              <Text size="xs" c="dimmed" ff="monospace" style={{ maxWidth: rem(300) }}>
                {formatNpubMiddle(currentNpub)}
              </Text>
            )}
          </Box>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {!currentUser && <Menu.Item onClick={() => setLoginDialogOpen(true)}>auth options</Menu.Item>}
        <Menu.Item
          color="red"
          disabled={!currentUser}
          onClick={() => {
            if (currentUser) {
              removeLogin(currentUser.id);
            }
          }}
        >
          remove auth
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <Box mih={iframeMode ? undefined : '100vh'} h={iframeMode ? '100%' : undefined} bg="var(--mantine-color-body)">
      <Box
        maw={1200}
        mx="auto"
        px="md"
        py={iframeMode ? 'xs' : 'md'}
        style={iframeMode ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}
      >
        {!iframeMode && (
          <Box mb="lg" pb="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="xl" fw={600} ff="monospace" mb={4}>
              relay-explorer
            </Text>
            <Text size="sm" c="dimmed" ff="monospace">
              WebSocket event inspector for Nostr relays
            </Text>
          </Box>
        )}

        {!iframeMode && (
          <Paper withBorder p="md" mb="lg" radius={0}>
            <Group gap="sm" align="flex-start" wrap="wrap" mb="sm">
              {renderRelayPillInput('relay-url')}
              {renderAuthControl()}
              <Button
                onClick={handleConnect}
                disabled={!isValidUrl && !isConnected && !isConnecting}
                variant="light"
                color={isConnected ? 'red' : 'relaykit'}
                loading={isConnecting}
                size="md"
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

            {hasActiveConnection && (
              <Box pt="sm">
                {renderFiltersGrid({ event: 'event-id', author: 'author-npub' })}
              </Box>
            )}
          </Paper>
        )}

        {iframeMode && (
          <Box mb="xs" pb="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" ff="monospace" tt="uppercase" c="dimmed" style={{ flexShrink: 0 }}>
                  Connected to
                </Text>
                {renderRelayPillInput('relay-url-iframe')}
              </Group>
              <Group gap="xs" wrap="nowrap">
                {renderAuthControl()}
                <Button
                  onClick={handleConnect}
                  disabled={!isValidUrl && !isConnected && !isConnecting}
                  variant="light"
                  color={isConnected ? 'red' : 'relaykit'}
                  loading={isConnecting}
                  size="md"
                  ff="monospace"
                >
                  {isConnecting ? 'connecting...' : isConnected ? 'disconnect' : 'connect'}
                </Button>
              </Group>
            </Group>

            {hasActiveConnection && (
              <Box pt="sm" mt="sm">
                {renderFiltersGrid({ event: 'event-id-iframe', author: 'author-npub-iframe' })}
              </Box>
            )}
          </Box>
        )}

        {hasActiveConnection && (
          <Flex
            gap="md"
            align="stretch"
            direction={{ base: 'column', md: 'row' }}
            style={iframeMode ? { flex: 1, minHeight: 0 } : undefined}
          >
            <Box style={iframeMode ? { flex: '5 1 0%', minWidth: 0, display: 'flex', minHeight: 0 } : { flex: '5 1 0%', minWidth: 0 }}>
              <Paper
                withBorder
                radius={0}
                h={listHeight}
                style={iframeMode ? { overflow: 'hidden', flex: 1, minHeight: 0 } : { overflow: 'hidden' }}
                bg="var(--mantine-color-default)"
              >
                <Stack gap={0} h="100%">
                  <Box
                    px="md"
                    py="xs"
                    pos="relative"
                    style={{
                      borderBottom: '1px solid var(--mantine-color-default-border)',
                      background: 'var(--mantine-color-default-hover)',
                    }}
                  >
                    <Group justify="space-between" align="center" w="100%">
                      <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                        events
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
                          {isConnecting
                            ? 'connecting to relay...'
                            : isConnected
                              ? 'listening for events...'
                              : 'connect to a relay to load events'}
                        </Text>
                      </Box>
                    ) : (
                      <Stack gap={0}>
                        {eventListRows.map((row) => (
                          <Box
                            key={row.event.id}
                            pos="relative"
                            style={{
                              borderBottom: '1px solid var(--mantine-color-default-border)',
                              background: 'color-mix(in srgb, var(--mantine-color-body) 90%, var(--mantine-color-default-hover))',
                            }}
                            className="relay-explorer-event-row"
                          >
                            <UnstyledButton
                              onClick={() => setSelectedEvent(row.event)}
                              w="100%"
                              p="md"
                              styles={{
                                root: {
                                  textAlign: 'left',
                                  background:
                                    selectedEvent?.id === row.event.id
                                      ? 'color-mix(in srgb, var(--mantine-primary-color-filled) 22%, transparent)'
                                      : undefined,
                                  borderLeft:
                                    selectedEvent?.id === row.event.id
                                      ? '3px solid var(--mantine-primary-color-filled)'
                                      : undefined,
                                  boxShadow:
                                    selectedEvent?.id === row.event.id
                                      ? 'inset 0 0 0 1px color-mix(in srgb, var(--mantine-primary-color-filled) 45%, transparent)'
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
                                    {row.event.kind}
                                  </Text>
                                </Group>
                                <Box ta="right">
                                  <Text size="xs" ff="monospace" c="dimmed">
                                    {row.timeLabel}
                                  </Text>
                                  <Text fz={10} ff="monospace" c="dimmed">
                                    ({row.ageLabel})
                                  </Text>
                                </Box>
                              </Group>
                              <Text size="xs" ff="monospace" c="dimmed" truncate mb={4}>
                                {row.idPreview}
                              </Text>
                              {row.event.content && (
                                <Text size="xs" truncate pr={32}>
                                  {row.contentPreview}
                                </Text>
                              )}
                            </UnstyledButton>
                            {user && row.event.pubkey === user.pubkey && (
                              <UnstyledButton
                                pos="absolute"
                                right={8}
                                bottom={8}
                                p={4}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEvent(row.event.id);
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

            <Box style={iframeMode ? { flex: '8 1 0%', minWidth: 0, display: 'flex', minHeight: 0 } : { flex: '8 1 0%', minWidth: 0 }}>
              <Paper
                withBorder
                radius={0}
                h={listHeight}
                style={iframeMode ? { overflow: 'hidden', flex: 1, minHeight: 0 } : { overflow: 'hidden' }}
                bg="var(--mantine-color-default)"
              >
                <Stack gap={0} h="100%">
                  <Box
                    px="md"
                    py="xs"
                    pos="relative"
                    style={{
                      borderBottom: '1px solid var(--mantine-color-default-border)',
                      background: 'var(--mantine-color-default-hover)',
                    }}
                  >
                    <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                      inspect
                    </Text>
                    <Group
                      gap="xs"
                      wrap="nowrap"
                      pos="absolute"
                      right={8}
                      top="50%"
                      style={{ transform: 'translateY(-50%)' }}
                    >
                      <Button
                        size="compact-xs"
                        radius={0}
                        variant={showInspectorTable ? 'light' : 'subtle'}
                        color={showInspectorTable ? 'relaykit' : 'gray'}
                        leftSection={<IconTable size={12} />}
                        onClick={() => setShowInspectorTable((prev) => !prev)}
                        disabled={!isConnected}
                        ff="monospace"
                      >
                        table
                      </Button>
                      <Button
                        size="compact-xs"
                        radius={0}
                        variant={showInspectorJson ? 'light' : 'subtle'}
                        color={showInspectorJson ? 'relaykit' : 'gray'}
                        leftSection={<IconBraces size={12} />}
                        onClick={() => setShowInspectorJson((prev) => !prev)}
                        disabled={!isConnected}
                        ff="monospace"
                      >
                        json
                      </Button>
                    </Group>
                  </Box>
                  <ScrollArea flex={1} p="md" type="auto">
                    {selectedEvent ? (
                      <Stack gap="sm">
                        {showInspectorTable && (
                          <Paper withBorder radius={0}>
                            <Table withTableBorder={false} highlightOnHover stickyHeader stickyHeaderOffset={0}>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th style={{ width: rem(140) }}>prop</Table.Th>
                                  <Table.Th>value</Table.Th>
                                  <Table.Th style={{ width: rem(52) }} />
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {[
                                  { label: 'kind', value: String(selectedEvent.kind), color: 'yellow' as const, empty: false },
                                  {
                                    label: 'created_at',
                                    value: `${selectedEvent.created_at} (${new Date(selectedEvent.created_at * 1000).toISOString()})`,
                                    color: 'blue' as const,
                                    empty: false,
                                  },
                                  { label: 'id', value: selectedEvent.id, color: 'grape' as const, empty: false },
                                  { label: 'pubkey', value: selectedEvent.pubkey, color: 'cyan' as const, empty: false },
                                  { label: 'sig', value: selectedEvent.sig, color: 'orange' as const, empty: false },
                                  { label: 'content', value: selectedEvent.content || '(empty)', color: 'gray' as const, empty: !selectedEvent.content },
                                ].map((field) => (
                                  <Table.Tr key={field.label}>
                                    <Table.Td>
                                      <Text size="xs" ff="monospace" c={`${field.color}.4`} fw={700}>
                                        {field.label}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <Text
                                        size="xs"
                                        ff="monospace"
                                        c={field.empty ? 'dimmed' : undefined}
                                        fs={field.empty ? 'italic' : undefined}
                                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                                      >
                                        {field.value}
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <CopyControl value={field.value} label={`copy ${field.label}`} />
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                                <Table.Tr>
                                  <Table.Td colSpan={3}>
                                    <Text size="xs" ff="monospace" c="teal.4" fw={700}>
                                      tags
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                                {selectedEvent.tags.length === 0 ? (
                                  <Table.Tr>
                                    <Table.Td>
                                      <Text size="xs" ff="monospace" c="teal.4" fw={700}>
                                        tag
                                      </Text>
                                    </Table.Td>
                                    <Table.Td>
                                      <Text size="xs" ff="monospace" c="dimmed" fs="italic">
                                        (no tags)
                                      </Text>
                                    </Table.Td>
                                    <Table.Td />
                                  </Table.Tr>
                                ) : (
                                  selectedEvent.tags.map((tag, index) => {
                                    const tagParts = Array.isArray(tag) ? tag.map((part) => String(part)) : [];
                                    const tagName = tagParts[0] || 'unknown';
                                    const tagValues = tagParts.slice(1);
                                    const tagCopyValue = JSON.stringify(tag);
                                    return (
                                      <Table.Tr key={`${tagName}-${index}`}>
                                        <Table.Td>
                                          <Text size="xs" ff="monospace" c="teal.4" fw={700}>
                                            {`tag ${index + 1}`}
                                          </Text>
                                        </Table.Td>
                                        <Table.Td>
                                          <Stack gap={6}>
                                            <Group gap={8} wrap="nowrap" align="flex-start">
                                              <Text size="xs" ff="monospace" c="dimmed" w={rem(56)}>
                                                key
                                              </Text>
                                              <Text size="xs" ff="monospace" fw={700} c="teal.5">
                                                {tagName}
                                              </Text>
                                            </Group>
                                            <Group gap={8} wrap="nowrap" align="flex-start">
                                              <Text size="xs" ff="monospace" c="dimmed" w={rem(56)}>
                                                values
                                              </Text>
                                              <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                                                {tagValues.length > 0 ? (
                                                  tagValues.map((value, valueIndex) => (
                                                    <Badge
                                                      key={`${tagName}-${index}-${valueIndex}`}
                                                      size="sm"
                                                      radius={0}
                                                      variant="light"
                                                      color="gray"
                                                      tt="none"
                                                    >
                                                      {value}
                                                    </Badge>
                                                  ))
                                                ) : (
                                                  <Text size="xs" ff="monospace" c="dimmed" fs="italic">
                                                    (empty)
                                                  </Text>
                                                )}
                                              </Group>
                                            </Group>
                                          </Stack>
                                        </Table.Td>
                                        <Table.Td style={{ verticalAlign: 'top' }}>
                                          <CopyControl value={tagCopyValue} label={`copy tag ${index + 1}`} />
                                        </Table.Td>
                                      </Table.Tr>
                                    );
                                  })
                                )}
                              </Table.Tbody>
                            </Table>
                          </Paper>
                        )}
                        {showInspectorJson && (
                          <Stack gap={6}>
                            <Text size="xs" ff="monospace" tt="uppercase" c="dimmed">
                              raw event
                            </Text>
                            <Paper withBorder radius={0} p="md">
                              <CodeHighlight
                                code={selectedEventJson}
                                language="json"
                                withCopyButton={false}
                                className="relay-json-highlight"
                                styles={{
                                  pre: {
                                    margin: 0,
                                    background: 'transparent',
                                    borderRadius: 0,
                                    padding: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontSize: rem(12),
                                  },
                                }}
                              />
                            </Paper>
                          </Stack>
                        )}
                        {!showInspectorTable && !showInspectorJson && (
                          <Flex align="center" justify="center" mih={120}>
                            <Text size="xs" ff="monospace" c="dimmed">
                              enable table or json view
                            </Text>
                          </Flex>
                        )}
                      </Stack>
                    ) : (
                      <Flex align="center" justify="center" mih={200}>
                        <Text size="xs" ff="monospace" c="dimmed">
                          {isConnecting
                            ? 'connecting to relay...'
                            : isConnected
                              ? 'select an event to inspect'
                              : 'connect to a relay to inspect events'}
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
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={() => setLoginDialogOpen(false)}
      />
      <style>{`
        .relay-explorer-event-row:hover .relay-explorer-delete-btn {
          opacity: 1 !important;
        }
      `}</style>
    </Box>
  );
};

export default Index;
