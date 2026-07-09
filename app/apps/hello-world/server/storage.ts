import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { ScheduledPost, RelayResult } from '../types.js'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'scheduled-posts.json')

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export const loadPosts = (): ScheduledPost[] => {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  return JSON.parse(fs.readFileSync(FILE, 'utf-8'))
}

const savePosts = (posts: ScheduledPost[]) => {
  ensureDir()
  fs.writeFileSync(FILE, JSON.stringify(posts, null, 2))
}

export const addPost = (input: {
  signedEvent: Record<string, unknown>
  relays: string[]
  publishAt: string
}): ScheduledPost => {
  const posts = loadPosts()
  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    signedEvent: input.signedEvent,
    relays: input.relays,
    publishAt: input.publishAt,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  posts.push(post)
  savePosts(posts)
  return post
}

export const updatePost = (id: string, updates: Partial<ScheduledPost>): ScheduledPost | null => {
  const posts = loadPosts()
  const idx = posts.findIndex((p) => p.id === id)
  if (idx === -1) return null
  posts[idx] = { ...posts[idx], ...updates }
  savePosts(posts)
  return posts[idx]
}

export const deletePost = (id: string): boolean => {
  const posts = loadPosts()
  const filtered = posts.filter((p) => p.id !== id)
  if (filtered.length === posts.length) return false
  savePosts(filtered)
  return true
}

export const getDuePosts = (): ScheduledPost[] => {
  const now = new Date()
  return loadPosts().filter((p) => p.status === 'pending' && new Date(p.publishAt) <= now)
}

export const markPublished = (id: string, relayResults: RelayResult[]) => {
  const allFailed = relayResults.every((r) => !r.success)
  updatePost(id, {
    status: allFailed ? 'failed' : 'published',
    publishedAt: new Date().toISOString(),
    relayResults,
  })
}
