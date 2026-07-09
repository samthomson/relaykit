/** Parsed query parameters consumed by the scheduler app. */
export interface SchedulerParams {
  /** WSS relay URLs from ?relays= (comma-separated). */
  relays: string[];
  /** Logged-in user hint from ?npub=. */
  npub: string | null;
  /** When true (?embedded=1), hide chrome/header. */
  embedded: boolean;
  /** ?standalone flag. */
  standalone: boolean;
  /** ?session token/id. */
  session: string | null;
}

function normalizeRelay(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Accept ws:// and wss://; default bare hosts to wss://.
  let candidate = trimmed;
  if (!/^wss?:\/\//i.test(candidate)) {
    candidate = `wss://${candidate}`;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    // Strip trailing slash for consistent de-duplication.
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** De-duplicate + normalize a list of relay URLs. */
export function dedupeRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const norm = normalizeRelay(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/** Read scheduler params from a search string (defaults to window.location). */
export function parseParams(search: string = window.location.search): SchedulerParams {
  const p = new URLSearchParams(search);

  const relays = dedupeRelays((p.get('relays') ?? '').split(','));

  const embeddedRaw = p.get('embedded');
  const embedded = embeddedRaw === '1' || embeddedRaw === 'true';

  const standaloneRaw = p.get('standalone');
  const standalone =
    standaloneRaw === '1' || standaloneRaw === 'true' || standaloneRaw === '';

  return {
    relays,
    npub: p.get('npub'),
    embedded,
    standalone: p.has('standalone') ? standalone : false,
    session: p.get('session'),
  };
}
