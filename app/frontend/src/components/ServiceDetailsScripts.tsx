import { useEffect, useState } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBolt,
  IconDatabase,
  IconPlus,
  IconRefresh,
  IconServer,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { trpc } from '../trpc';
import { RelayInput, toWs } from './RelayInput';

// kinds the compute DVM speaks (mirror of dvm-compute/src/kinds.ts)
const KIND = {
  codeSnippet: 1337,
  dataFunction: 31337,
  jobRequest: 5910,
  jobResult: 6910,
  jobFeedback: 7000,
  cachedResult: 31338,
} as const;

const BLANK = `async function main(inputs, nostr) {
  // query nostr, return any json-serializable value
  const events = await nostr.query([{ kinds: [1], limit: 100 }]);
  return { count: events.length };
}`;

const SAMPLE = `async function main(inputs, nostr) {
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const events = await nostr.query([{ kinds: [4223], '#t': ['weather'], since }]);
  const temps = events
    .map((e) => e.tags.find((t) => t[0] === 'temp'))
    .filter(Boolean)
    .map((t) => parseFloat(t[1]))
    .filter((n) => !Number.isNaN(n));
  const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  return { avg_temp: avg, samples: temps.length, since };
}`;

const prettyResult = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

const errMsg = (e: any): string => {
  if (e?.name === 'AggregateError' && Array.isArray(e.errors)) {
    const msgs = e.errors.map((x: any) => x?.message || String(x)).filter(Boolean);
    return msgs.length ? `relay unreachable / rejected: ${msgs.join('; ')}` : 'relay unreachable';
  }
  return e?.message ?? String(e);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const fmtTime = (sec: number): string => new Date(sec * 1000).toLocaleString();

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const relTime = (sec: number): string => {
  const diff = sec * 1000 - Date.now();
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000],
  ];
  for (const [unit, ms] of table) {
    if (Math.abs(diff) >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
};

const host = (url: string): string => url.replace(/^wss?:\/\//, '').replace(/\/$/, '');

// absolute time with the relative time in smaller brackets after it
const TimeAgo = ({ sec, prefix }: { sec: number; prefix?: string }) => (
  <Text size="xs" c="dimmed">
    {prefix ? `${prefix} ` : ''}
    {fmtTime(sec)} <Text span fz={10} c="dimmed">({relTime(sec)})</Text>
  </Text>
);

// role → colour, shared by the relay inputs and the list badges
const RELAY_COLOR = { home: 'violet', source: 'blue', output: 'cyan' } as const;

const relayLabel = (color: string, text: string) => (
  <Group gap={6} component="span" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
    <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--mantine-color-${color}-5)` }} />
    {text}
  </Group>
);

// Bounded query: resolve on EOSE or after `ms`, so a slow relay can't stall the UI.
const queryBounded = (pool: SimplePool, relays: string[], filter: Filter, ms = 3000): Promise<Event[]> =>
  new Promise((resolve) => {
    const out = new Map<string, Event>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sub.close(); } catch { /* noop */ }
      resolve([...out.values()]);
    };
    const timer = setTimeout(finish, ms);
    const sub = pool.subscribeMany(relays, filter, {
      onevent: (ev) => out.set(ev.id, ev),
      oneose: finish,
    });
  });

type Param = { key: string; value: string };
type Inputs = {
  subjectValue: string;
  subjectType: string;
  params: Param[];
  sourceRelays: string[];
};

// Content-addressed cache key — must stay in sync with dvm-compute/src/cache.ts computeCacheKey.
const computeCacheKey = async (scriptAddress: string, inputs: Inputs): Promise<string> => {
  const params = Object.fromEntries(
    inputs.params
      .filter((p) => p.key.trim())
      .map((p) => [p.key.trim(), p.value] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  const canonical = JSON.stringify({
    script: scriptAddress,
    subject: inputs.subjectValue.trim() ? { value: inputs.subjectValue.trim(), type: inputs.subjectType } : null,
    params,
    relays: [...inputs.sourceRelays].sort(),
  });
  return sha256Hex(canonical);
};

const jobTags = (scriptAddress: string, dvmRelay: string, inputs: Inputs, extra: string[][]): string[][] => {
  const tags: string[][] = [['a', scriptAddress, dvmRelay]];
  if (inputs.subjectValue.trim()) tags.push(['i', inputs.subjectValue.trim(), inputs.subjectType]);
  inputs.params.filter((p) => p.key.trim()).forEach((p) => tags.push(['param', p.key.trim(), p.value]));
  if (inputs.sourceRelays.length) tags.push(['relays', ...inputs.sourceRelays]);
  return [...tags, ...extra];
};

type Feedback = { status: string; message: string };
type Result = { label: string; content: string; ts?: number } | null;

export const ServiceDetailsScripts = ({ composeId }: { composeId: string }) => {
  const [relayUrl, setRelayUrl] = useState('');
  const [defaultSourceRelays, setDefaultSourceRelays] = useState<string[]>([]);
  // operator ceilings from the service config (authoritative default lives in the preset config,
  // not hardcoded here) — seed per-data-function limits and cap them.
  const [defaultRuntimeMs, setDefaultRuntimeMs] = useState('');
  const [defaultMemoryMb, setDefaultMemoryMb] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);

  const fnCacheKey = `relaykit:dvm-fns:${composeId}`;
  const loadFnCache = (): Record<string, Event> => {
    try {
      return JSON.parse(localStorage.getItem(fnCacheKey) || '{}');
    } catch {
      return {};
    }
  };

  const [view, setView] = useState<'list' | 'editor'>('list');
  // seeded from localStorage so the list shows instantly, then refreshed in the background.
  const [functions, setFunctions] = useState<Record<string, Event>>(loadFnCache);
  const [loadingList, setLoadingList] = useState(false);

  // editor state
  const [dTag, setDTag] = useState('');
  const [code, setCode] = useState(BLANK);
  const [sourceRelays, setSourceRelays] = useState<string[]>([]);
  const [outputRelay, setOutputRelay] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [runtimeMs, setRuntimeMs] = useState('');
  const [memoryMb, setMemoryMb] = useState('');
  const [subjectValue, setSubjectValue] = useState('');
  const [subjectType, setSubjectType] = useState('text');
  const [params, setParams] = useState<Param[]>([]);
  const [author, setAuthor] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [busy, setBusy] = useState<null | 'test' | 'get' | 'recache' | 'clear' | 'save'>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [result, setResult] = useState<Result>(null);

  useEffect(() => {
    let cancelled = false;
    trpc.getServiceConfig
      .query({ composeId })
      .then((res) => {
        if (cancelled) return;
        setRelayUrl(toWs(res.config?.RELAY_URL ?? ''));
        const configured = (res.config?.SOURCE_RELAYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        setDefaultSourceRelays(configured.map(toWs));
        if (res.config?.MAX_RUNTIME_MS) setDefaultRuntimeMs(String(res.config.MAX_RUNTIME_MS));
        if (res.config?.MAX_MEMORY_MB) setDefaultMemoryMb(String(res.config.MAX_MEMORY_MB));
      })
      .catch((e) => !cancelled && setError(e?.message ?? 'failed to load config'))
      .finally(() => !cancelled && setLoadingConfig(false));
    return () => {
      cancelled = true;
    };
  }, [composeId]);

  const ensureNostr = () => {
    if (!window.nostr) throw new Error('no nostr extension found (install alby / nos2x)');
    return window.nostr;
  };

  const inputs: Inputs = { subjectValue, subjectType, params, sourceRelays };

  const loadFunctions = async (quiet = false) => {
    if (!quiet) setError(null);
    setLoadingList(true);
    const relay = toWs(relayUrl);
    const pool = new SimplePool();
    try {
      const pk = await ensureNostr().getPublicKey();
      const events = await queryBounded(pool, [relay], { kinds: [KIND.dataFunction], authors: [pk] });
      const byD: Record<string, Event> = {};
      for (const ev of events) {
        const d = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
        if (!d) continue;
        if (!byD[d] || ev.created_at > byD[d].created_at) byD[d] = ev;
      }
      setFunctions(byD);
      localStorage.setItem(fnCacheKey, JSON.stringify(byD));
    } catch (e: any) {
      if (!quiet) setError(errMsg(e));
    } finally {
      pool.close([relay]);
      setLoadingList(false);
    }
  };

  // auto-populate the list when the tab opens (if a signer is available), so it isn't empty.
  useEffect(() => {
    if (relayUrl && window.nostr) loadFunctions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayUrl]);

  const resetEditor = () => {
    setError(null);
    setFeedback([]);
    setResult(null);
    setBusy(null);
  };

  const openNew = () => {
    resetEditor();
    setDTag('');
    setCode(SAMPLE);
    setSourceRelays(defaultSourceRelays);
    setOutputRelay(relayUrl);
    setTtl('3600');
    setRuntimeMs(defaultRuntimeMs);
    setMemoryMb(defaultMemoryMb);
    setSubjectValue('');
    setSubjectType('text');
    setParams([]);
    setAuthor(null);
    setPublished(false);
    setUpdatedAt(null);
    setView('editor');
  };

  // open a kind:31337 definition: restore its config, then fetch the referenced kind:1337 code.
  const openExisting = async (def: Event) => {
    resetEditor();
    setView('editor');
    const tagVal = (n: string) => def.tags.find((t) => t[0] === n);
    setDTag(tagVal('d')?.[1] ?? '');
    const relays = def.tags.filter((t) => t[0] === 'relays').flatMap((t) => t.slice(1)).filter(Boolean);
    setSourceRelays(relays.length ? relays.map(toWs) : defaultSourceRelays);
    setOutputRelay(tagVal('output')?.[1] || relayUrl);
    setTtl(tagVal('ttl')?.[1] ?? '3600');
    setRuntimeMs(tagVal('runtime_ms')?.[1] ?? defaultRuntimeMs);
    setMemoryMb(tagVal('memory_mb')?.[1] ?? defaultMemoryMb);
    const i = tagVal('i');
    setSubjectValue(i?.[1] ?? '');
    setSubjectType(i?.[2] ?? 'text');
    setParams(def.tags.filter((t) => t[0] === 'param').map((t) => ({ key: t[1] ?? '', value: t[2] ?? '' })));
    setAuthor(def.pubkey);
    setPublished(true);
    setUpdatedAt(def.created_at);

    const codeAddr = tagVal('code')?.[1];
    setCode('// loading code…');
    if (!codeAddr) {
      setCode(BLANK);
      return;
    }
    const relay = toWs(relayUrl);
    const pool = new SimplePool();
    try {
      const [, pk, d] = codeAddr.split(':');
      const events = await pool.querySync([relay], { kinds: [KIND.codeSnippet], authors: [pk], '#d': [d] });
      const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
      setCode(latest?.content ?? BLANK);
    } catch {
      setCode(BLANK);
    } finally {
      pool.close([relay]);
    }
  };

  const addParam = () => setParams((p) => [...p, { key: '', value: '' }]);
  const removeParam = (i: number) => setParams((p) => p.filter((_, idx) => idx !== i));
  const updateParam = (i: number, field: keyof Param, val: string) =>
    setParams((p) => p.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  // 1) test run — execute the code right here in the browser, no relay job, no signing.
  const testRun = async () => {
    setError(null);
    setResult(null);
    setFeedback([]);
    setBusy('test');
    const relays = (sourceRelays.length ? sourceRelays : [relayUrl]).map(toWs).filter(Boolean);
    const pool = new SimplePool();
    const touched = new Set<string>(relays);
    try {
      if (!code.trim()) throw new Error('function body is empty');
      if (!relays.length) throw new Error('set a source relay (or the dvm relay url) to query');
      const nostr = {
        query: async (filters: Filter | Filter[], queryRelays?: string[]) => {
          const target = Array.isArray(queryRelays) && queryRelays.length ? queryRelays.map(toWs) : relays;
          target.forEach((r) => touched.add(r));
          const list = Array.isArray(filters) ? filters : [filters];
          const byId = new Map<string, Event>();
          for (const f of list) {
            const evs = await pool.querySync(target, f);
            for (const e of evs) byId.set(e.id, e);
          }
          return [...byId.values()];
        },
      };
      const runInputs = {
        subject: subjectValue.trim() ? { value: subjectValue.trim(), type: subjectType } : undefined,
        params: Object.fromEntries(params.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value])),
      };
      setFeedback([{ status: 'running', message: `querying ${relays.join(', ')}` }]);
      // eslint-disable-next-line no-new-func
      const factory = new Function(
        'inputs',
        'nostr',
        `"use strict";\n${code}\nif (typeof main !== 'function') throw new Error('must define async function main(inputs, nostr)');\nreturn main(inputs, nostr);`,
      );
      const out = await factory(runInputs, nostr);
      setResult({ label: 'local test', content: JSON.stringify(out ?? null), ts: Math.floor(Date.now() / 1000) });
      setFeedback([{ status: 'success', message: 'ran in browser' }]);
    } catch (e: any) {
      setError(errMsg(e));
      setFeedback([]);
    } finally {
      pool.close([...touched]);
      setBusy(null);
    }
  };

  // 2) get cached — read the kind:31338 the worker stored for this exact (function, inputs, relays).
  const getCached = async () => {
    setError(null);
    setResult(null);
    setFeedback([]);
    setBusy('get');
    const relay = toWs(relayUrl);
    const pool = new SimplePool();
    try {
      if (!author || !dTag.trim()) throw new Error('save the data function first so it has an address');
      const address = `${KIND.dataFunction}:${author}:${dTag.trim()}`;
      const key = await computeCacheKey(address, inputs);
      const events = await pool.querySync([relay], { kinds: [KIND.cachedResult], '#d': [key] });
      const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
      if (!latest) {
        setFeedback([{ status: 'miss', message: 'nothing cached for these inputs — recache to compute it' }]);
        return;
      }
      const exp = Number(latest.tags.find((t) => t[0] === 'expiration')?.[1] ?? 0);
      const expired = exp > 0 && exp < Math.floor(Date.now() / 1000);
      setResult({ label: expired ? 'cached (expired)' : 'cached', content: latest.content, ts: latest.created_at });
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      pool.close([relay]);
      setBusy(null);
    }
  };

  // shared path for recache/clear — publish a kind:5910 job and watch for feedback/result.
  const submitJob = async (mode: 'recache' | 'clear') => {
    setError(null);
    setResult(null);
    setFeedback([]);
    setBusy(mode);
    const relay = toWs(relayUrl);
    const pool = new SimplePool();
    try {
      if (!author || !dTag.trim()) throw new Error('save the data function first so it has an address');
      if (!relay) throw new Error('set the dvm relay url');
      const address = `${KIND.dataFunction}:${author}:${dTag.trim()}`;
      const extra = [['cache', mode === 'clear' ? 'clear' : 'no']];
      if (ttl.trim()) extra.push(['ttl', ttl.trim()]);
      const signed = (await ensureNostr().signEvent({
        kind: KIND.jobRequest,
        created_at: Math.floor(Date.now() / 1000),
        tags: jobTags(address, relay, inputs, extra),
        content: '',
      })) as Event;
      await Promise.any(pool.publish([relay], signed));
      setFeedback([{ status: 'submitted', message: mode === 'clear' ? 'clearing…' : 'recomputing…' }]);

      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        let terminal = false;
        const fbs = await pool.querySync([relay], { kinds: [KIND.jobFeedback], '#e': [signed.id] });
        for (const ev of fbs.sort((a, b) => a.created_at - b.created_at)) {
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          const s = ev.tags.find((t) => t[0] === 'status');
          if (!s) continue;
          setFeedback((prev) => [...prev, { status: s[1], message: s[2] ?? '' }]);
          if (s[1] === 'error' || (mode === 'clear' && s[1] === 'success')) terminal = true;
        }
        if (mode === 'recache') {
          const res = await pool.querySync([relay], { kinds: [KIND.jobResult], '#e': [signed.id] });
          const latest = res.sort((a, b) => b.created_at - a.created_at)[0];
          if (latest) {
            setResult({ label: 'recomputed', content: latest.content, ts: latest.created_at });
            return;
          }
        }
        if (terminal) return;
      }
      setFeedback((prev) => [...prev, { status: 'timeout', message: 'no response from worker (is dvm-compute running?)' }]);
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      pool.close([relay]);
      setBusy(null);
    }
  };

  // save = publish two events: the reusable code (kind:1337) and the data function definition
  // (kind:31337) that references it and bundles relays / output / params / subject / ttl.
  const save = async () => {
    setError(null);
    setBusy('save');
    const relay = toWs(relayUrl);
    const pool = new SimplePool();
    try {
      const id = dTag.trim();
      if (!id) throw new Error('data function id (d tag) is required');
      if (!relay) throw new Error('set the dvm relay url');
      const now = Math.floor(Date.now() / 1000);

      const codeEv = (await ensureNostr().signEvent({
        kind: KIND.codeSnippet,
        created_at: now,
        tags: [['d', id]],
        content: code,
      })) as Event;

      const defTags: string[][] = [
        ['d', id],
        ['code', `${KIND.codeSnippet}:${codeEv.pubkey}:${id}`],
      ];
      if (sourceRelays.length) defTags.push(['relays', ...sourceRelays]);
      if (outputRelay.trim()) defTags.push(['output', toWs(outputRelay)]);
      if (ttl.trim()) defTags.push(['ttl', ttl.trim()]);
      if (runtimeMs.trim()) defTags.push(['runtime_ms', runtimeMs.trim()]);
      if (memoryMb.trim()) defTags.push(['memory_mb', memoryMb.trim()]);
      if (subjectValue.trim()) defTags.push(['i', subjectValue.trim(), subjectType]);
      params.filter((p) => p.key.trim()).forEach((p) => defTags.push(['param', p.key.trim(), p.value]));
      const defEv = (await ensureNostr().signEvent({
        kind: KIND.dataFunction,
        created_at: now,
        tags: defTags,
        content: '',
      })) as Event;

      await Promise.any(pool.publish([relay], codeEv));
      await Promise.any(pool.publish([relay], defEv));
      setAuthor(defEv.pubkey);
      setPublished(true);
      setUpdatedAt(now);
      setFunctions((prev) => {
        const next = { ...prev, [id]: defEv };
        localStorage.setItem(fnCacheKey, JSON.stringify(next));
        return next;
      });
      setFeedback([{ status: 'success', message: `saved ${id}` }]);
    } catch (e: any) {
      setError(errMsg(e));
    } finally {
      pool.close([relay]);
      setBusy(null);
    }
  };

  if (loadingConfig) {
    return (
      <Group gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">loading service config…</Text>
      </Group>
    );
  }

  // ── list view ────────────────────────────────────────────────────────────
  if (view === 'list') {
    const items = Object.values(functions).sort((a, b) => b.created_at - a.created_at);
    return (
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            a data function (kind:31337) bundles reusable code (kind:1337) with its relays, params & ttl.
            pick one to edit & test, or create a new one.
          </Text>
          <Group gap="xs">
            <Button variant="default" size="sm" leftSection={<IconRefresh size={15} />} loading={loadingList} onClick={loadFunctions} disabled={!relayUrl}>
              refresh
            </Button>
            <Button size="sm" leftSection={<IconPlus size={15} />} onClick={openNew}>
              new
            </Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="error">
            {error}
          </Alert>
        )}

        {items.length === 0 ? (
          <Card withBorder padding="lg">
            <Stack gap={4} align="center">
              <Text size="sm" c="dimmed">no data functions yet.</Text>
              <Text size="xs" c="dimmed">hit refresh to load yours from the relay, or create a new one.</Text>
            </Stack>
          </Card>
        ) : (
          <Stack gap="xs">
            {items.map((ev) => {
              const d = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
              const source = ev.tags.filter((t) => t[0] === 'relays').flatMap((t) => t.slice(1)).filter(Boolean);
              const out = ev.tags.find((t) => t[0] === 'output')?.[1];
              const paramKeys = ev.tags.filter((t) => t[0] === 'param').map((t) => t[1]).filter(Boolean);
              const ttlTag = ev.tags.find((t) => t[0] === 'ttl')?.[1];
              const relayBadge = (role: keyof typeof RELAY_COLOR, url: string) => (
                <Tooltip key={`${role}:${url}`} label={`${role}: ${url}`} withArrow>
                  <Badge size="xs" variant="light" color={RELAY_COLOR[role]} leftSection={<IconServer size={10} />}>{host(url)}</Badge>
                </Tooltip>
              );
              return (
                <Card key={ev.id} withBorder padding="sm" onClick={() => openExisting(ev)} style={{ cursor: 'pointer' }}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={6}>
                      <Text size="sm" fw={500}>{d || '(no id)'}</Text>
                      <Group gap={6}>
                        {relayUrl && relayBadge('home', relayUrl)}
                        {source.map((r) => relayBadge('source', r))}
                        {out && relayBadge('output', out)}
                        {paramKeys.map((k) => (
                          <Badge key={k} size="xs" variant="light" color="grape">{k}</Badge>
                        ))}
                        {ttlTag && <Badge size="xs" variant="light" color="teal">ttl {ttlTag}s</Badge>}
                      </Group>
                      <TimeAgo sec={ev.created_at} prefix="updated" />
                    </Stack>
                    <Badge variant="light" color="gray">kind:31337</Badge>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    );
  }

  // ── editor view ──────────────────────────────────────────────────────────
  const canCache = published && !!author && !!dTag.trim();
  return (
    <ScrollArea.Autosize mah="68vh" type="auto" offsetScrollbars>
      <Stack gap="md" pr="sm">
        <Group justify="space-between" align="center">
          <Button variant="subtle" size="compact-sm" leftSection={<IconArrowLeft size={15} />} onClick={() => setView('list')}>
            data functions
          </Button>
          <Group gap="xs">
            {published ? <Badge color="green" variant="light">saved</Badge> : <Badge color="yellow" variant="light">draft</Badge>}
            {updatedAt && <TimeAgo sec={updatedAt} prefix="updated" />}
          </Group>
        </Group>

        <Divider label="code  ·  kind:1337" labelPosition="left" />

        <TextInput
          label="data function id (d tag)"
          description="addressable name shared by the code (1337) + definition (31337) — saving supersedes the old one"
          value={dTag}
          onChange={(e) => {
            setDTag(e.currentTarget.value);
            setPublished(false);
          }}
        />

        <Textarea
          label="function body"
          description="must define: async function main(inputs, nostr) { … return <json> }"
          value={code}
          onChange={(e) => {
            setCode(e.currentTarget.value);
            setPublished(false);
          }}
          autosize
          minRows={10}
          maxRows={20}
          styles={{ input: { fontFamily: 'monospace', fontSize: '0.8125rem' } }}
        />

        <Divider label="definition  ·  kind:31337" labelPosition="left" />

        <RelayInput
          label={relayLabel(RELAY_COLOR.home, 'home relay (dvm)')}
          description="where the data function + cached results live and the worker listens for jobs"
          value={relayUrl ? [relayUrl] : []}
          onChange={(v) => setRelayUrl(v[0] ?? '')}
          multiple={false}
          placeholder="wss://relay.example.com"
        />

        <RelayInput
          label={relayLabel(RELAY_COLOR.source, 'source relays')}
          description="relays the data function reads from. the code can override per query."
          placeholder="wss://relay.relaying.earth"
          value={sourceRelays}
          onChange={setSourceRelays}
        />

        <Group align="flex-end" gap="sm" grow>
          <RelayInput
            label={relayLabel(RELAY_COLOR.output, 'output relay')}
            description="where the cached result is published (defaults to the home relay)"
            value={outputRelay ? [outputRelay] : []}
            onChange={(v) => setOutputRelay(v[0] ?? '')}
            multiple={false}
            placeholder="wss://relay.example.com"
          />
          <TextInput
            label="ttl (seconds)"
            description="how long a cached result stays fresh"
            value={ttl}
            onChange={(e) => setTtl(e.currentTarget.value)}
            maw={160}
          />
        </Group>

        <Group align="flex-end" gap="sm" grow>
          <TextInput
            label="max runtime (ms)"
            description={defaultRuntimeMs ? `per-run limit · capped at ${defaultRuntimeMs}` : 'per-run limit'}
            placeholder={defaultRuntimeMs ? `${defaultRuntimeMs} (service default)` : 'service default'}
            value={runtimeMs}
            onChange={(e) => setRuntimeMs(e.currentTarget.value)}
          />
          <TextInput
            label="max memory (mb)"
            description={defaultMemoryMb ? `per-run limit · capped at ${defaultMemoryMb}` : 'per-run limit'}
            placeholder={defaultMemoryMb ? `${defaultMemoryMb} (service default)` : 'service default'}
            value={memoryMb}
            onChange={(e) => setMemoryMb(e.currentTarget.value)}
          />
        </Group>

        <Group align="flex-end" gap="sm" grow>
          <TextInput
            label="subject"
            description="the `i` tag — what the computation is about (optional)"
            placeholder="event id, pubkey, …"
            value={subjectValue}
            onChange={(e) => setSubjectValue(e.currentTarget.value)}
          />
          <Select
            label="subject type"
            data={['text', 'event', 'pubkey', 'address', 'url']}
            value={subjectType}
            onChange={(v) => setSubjectType(v || 'text')}
            maw={150}
          />
        </Group>

        <Stack gap={6}>
          <Text size="sm" fw={500}>params <Text span size="xs" c="dimmed">· `param` tags → inputs.params</Text></Text>
          {params.map((p, i) => (
            <Group key={i} gap="xs" align="center" wrap="nowrap">
              <TextInput placeholder="key" value={p.key} onChange={(e) => updateParam(i, 'key', e.currentTarget.value)} style={{ flex: 1 }} />
              <TextInput placeholder="value" value={p.value} onChange={(e) => updateParam(i, 'value', e.currentTarget.value)} style={{ flex: 1 }} />
              <ActionIcon variant="subtle" color="gray" aria-label="remove param" onClick={() => removeParam(i)}>
                <IconTrash size={15} />
              </ActionIcon>
            </Group>
          ))}
          <Group>
            <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={addParam}>
              add param
            </Button>
          </Group>
        </Stack>

        <Group justify="flex-end">
          <Tooltip label="set the home relay and data function id" disabled={!!relayUrl && !!dTag.trim()} withArrow>
            <Button
              leftSection={<IconUpload size={16} />}
              loading={busy === 'save'}
              onClick={save}
              disabled={!relayUrl || !dTag.trim() || busy !== null}
            >
              save data function
            </Button>
          </Tooltip>
        </Group>

        <Divider label="run" labelPosition="left" />

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="error">
            {error}
          </Alert>
        )}

        <Group gap="sm">
          <Tooltip label="run the code here in the browser — no relay job, no signing" withArrow>
            <Button leftSection={<IconBolt size={16} />} loading={busy === 'test'} onClick={testRun} disabled={busy !== null || !code.trim()}>
              test run
            </Button>
          </Tooltip>
          <Tooltip label={canCache ? 'read the cached result for these inputs' : 'save the data function first'} withArrow>
            <Button variant="light" leftSection={<IconDatabase size={16} />} loading={busy === 'get'} onClick={getCached} disabled={busy !== null || !canCache}>
              get cached
            </Button>
          </Tooltip>
          <Tooltip label={canCache ? 'force the worker to recompute & cache' : 'save the data function first'} withArrow>
            <Button variant="light" leftSection={<IconRefresh size={16} />} loading={busy === 'recache'} onClick={() => submitJob('recache')} disabled={busy !== null || !canCache}>
              recache
            </Button>
          </Tooltip>
          <Tooltip label={canCache ? 'delete the cached result for these inputs' : 'save the data function first'} withArrow>
            <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} loading={busy === 'clear'} onClick={() => submitJob('clear')} disabled={busy !== null || !canCache}>
              clear cached
            </Button>
          </Tooltip>
        </Group>

        {(feedback.length > 0 || result != null) && (
          <Stack gap="xs">
            {feedback.length > 0 && (
              <Stack gap={4}>
                {feedback.map((f, i) => (
                  <Text key={i} size="sm" c={f.status === 'error' || f.status === 'timeout' ? 'red' : 'dimmed'}>
                    {f.status}{f.message ? `: ${f.message}` : ''}
                  </Text>
                ))}
              </Stack>
            )}
            {result != null && (
              <Stack gap={4}>
                <Group gap={6} align="baseline">
                  <Text size="sm" fw={500}>output <Text span size="xs" c="dimmed">· {result.label}</Text></Text>
                  {result.ts && <TimeAgo sec={result.ts} />}
                </Group>
                <Code block>{prettyResult(result.content)}</Code>
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );
};
