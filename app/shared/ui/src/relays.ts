export const normalizeRelayUrl = (url: string): string | null => {
  const trimmed = url.trim()
  if (!trimmed) return null
  let candidate = trimmed
  if (!/^wss?:\/\//i.test(candidate)) candidate = `wss://${candidate}`
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export const dedupeRelays = (urls: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    const norm = normalizeRelayUrl(raw)
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}
