import type { NostrEvent } from '@nostrify/nostrify';

/** Publication status of a scheduled post. */
export type PostStatus = 'pending' | 'published' | 'failed' | 'cancelled';

/** Result of attempting to publish to a single relay. */
export interface RelayResult {
  url: string;
  success: boolean;
  /** Optional human-readable message (e.g. error or "accepted"). */
  message?: string;
}

/** A scheduled post as returned by the backend. */
export interface ScheduledPost {
  id: string;
  /** The signed nostr event that will be (or was) published. */
  signedEvent: NostrEvent;
  /** Relay URLs the post is/was targeted at. */
  relays: string[];
  /** ISO-8601 timestamp for when the post should be published. */
  publishAt: string;
  status: PostStatus;
  /** Per-relay publish results (populated once an attempt has been made). */
  relayResults?: RelayResult[];
  /** ISO-8601 timestamp of when the row was created. */
  createdAt?: string;
}

/** Payload sent to the schedule endpoint. */
export interface SchedulePayload {
  signedEvent: NostrEvent;
  relays: string[];
  publishAt: string;
}

/** In dev Vite proxies /apps/hello-world/api → Express; in prod Traefik strips the prefix. */
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || body?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(
      `Request failed (${res.status}${detail ? `: ${detail}` : ''})`,
    );
  }
  // Some endpoints may return an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Schedule a signed event for later publication. */
export async function schedulePost(
  payload: SchedulePayload,
): Promise<ScheduledPost> {
  const res = await fetch(`${API_BASE}/api/posts/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<ScheduledPost>(res);
}

/** Fetch all scheduled posts. */
export async function listPosts(signal?: AbortSignal): Promise<ScheduledPost[]> {
  const res = await fetch(`${API_BASE}/api/posts`, { signal });
  const data = await handle<ScheduledPost[] | { posts: ScheduledPost[] }>(res);
  if (Array.isArray(data)) return data;
  return data?.posts ?? [];
}

/** Cancel a pending post. */
export async function cancelPost(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/posts/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  );
  await handle<void>(res);
}

/** Delete a post. */
export async function deletePost(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/posts/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  await handle<void>(res);
}
