import { loadConfig, recordNtfyResult } from './storage.js'
import type { PushPayload } from './push.js'

/** Header values travel as latin-1, so anything outside it needs rfc2047 encoding. */
const encodeHeader = (value: string): string =>
  /[^\x20-\x7e]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=` : value

/**
 * Publishes to an ntfy topic. Unlike web push this needs no browser and no play services:
 * the ntfy app keeps its own connection, which is what makes it work on de-googled android.
 */
const NETWORK_RETRY_DELAY_MS = 5_000

export const sendToNtfy = async (payload: PushPayload, attempt = 0): Promise<boolean> => {
  const { ntfy } = loadConfig()
  if (!ntfy.enabled || !ntfy.topic.trim()) return false

  const headers: Record<string, string> = { Title: encodeHeader(payload.title) }
  if (payload.url) headers.Click = payload.url
  if (payload.icon) headers.Icon = payload.icon
  if (payload.tags?.length) headers.Tags = payload.tags.join(',')
  if (ntfy.token) headers.Authorization = `Bearer ${ntfy.token}`

  const url = `${ntfy.server.replace(/\/$/, '')}/${encodeURIComponent(ntfy.topic.trim())}`
  try {
    const res = await fetch(url, { method: 'POST', headers, body: payload.body })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`${res.status} ${detail.slice(0, 200)}`.trim())
    }
    recordNtfyResult({ ok: true })
    return true
  } catch (err) {
    // fetch throws TypeError on network failure (vs our Error for http statuses); the ntfy
    // container can be mid-restart for a few seconds, so give it one more shot.
    if (attempt === 0 && err instanceof TypeError) {
      console.error(`ntfy publish network error (${err.message}), retrying once`)
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
      return sendToNtfy(payload, 1)
    }
    const message = err instanceof Error ? err.message : String(err)
    recordNtfyResult({ ok: false, error: message })
    console.error(`ntfy publish to ${url} failed:`, message)
    return false
  }
}
