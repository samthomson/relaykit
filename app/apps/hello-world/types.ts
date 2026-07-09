export type RelayResult = {
  url: string
  success: boolean
  message?: string
}

export type ScheduledPost = {
  id: string
  signedEvent: Record<string, unknown>
  relays: string[]
  publishAt: string
  status: 'pending' | 'published' | 'failed' | 'cancelled'
  createdAt: string
  publishedAt?: string
  relayResults?: RelayResult[]
}
