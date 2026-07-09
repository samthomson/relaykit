import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadPosts, addPost, updatePost, deletePost, getDuePosts, markPublished } from './storage.js'
import { broadcastEvent } from './broadcaster.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.HW_PORT || 3100

app.use(cors())
app.use(express.json())

// --- API routes ---

app.get('/api/posts', (_req, res) => {
  res.json(loadPosts())
})

app.post('/api/posts/schedule', (req, res) => {
  const { signedEvent, relays, publishAt } = req.body
  if (!signedEvent || !Array.isArray(relays) || !relays.length || !publishAt) {
    res.status(400).json({ error: 'missing signedEvent, relays, or publishAt' })
    return
  }
  const post = addPost({ signedEvent, relays, publishAt })
  res.status(201).json(post)
})

app.post('/api/posts/:id/cancel', (req, res) => {
  const post = updatePost(req.params.id, { status: 'cancelled' })
  if (!post) { res.status(404).json({ error: 'not found' }); return }
  if (post.status !== 'cancelled') { res.status(400).json({ error: 'only pending posts can be cancelled' }); return }
  res.json(post)
})

app.delete('/api/posts/:id', (req, res) => {
  if (!deletePost(req.params.id)) { res.status(404).json({ error: 'not found' }); return }
  res.json({ ok: true })
})

// --- Scheduler ---

let schedulerRunning = false

const tick = async () => {
  if (schedulerRunning) return
  schedulerRunning = true
  try {
    const due = getDuePosts()
    for (const post of due) {
      const results = await broadcastEvent(post.signedEvent, post.relays)
      markPublished(post.id, results)
      console.log(`broadcast post ${post.id}: ${results.filter((r) => r.success).length}/${results.length} relays ok`)
    }
  } catch (err) {
    console.error('scheduler error:', err)
  } finally {
    schedulerRunning = false
  }
}

setInterval(tick, 60_000)
tick()

// --- Static SPA (prod) ---

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`hello-world server on port ${PORT}`)
})
