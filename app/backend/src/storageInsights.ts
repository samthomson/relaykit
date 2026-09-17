import fs from 'fs/promises'
import { dockerSocketGetJson } from './dockerSocket'
import { STORAGE_INSIGHTS_TTL_MS } from './constants'
import type { StorageSnapshot, StorageServiceUsage, StorageVolumeUsage } from '../../shared/insights'

/**
 * Disk accounting over the Docker socket. /system/df gives exact per-volume sizes (where service
 * data actually lives), container writable layers, images and build cache; statfs gives host totals.
 * The residual (host used minus everything Docker attributes) is effectively container logs + misc.
 *
 * The daemon does du-style walks for this, so it is NOT polled: snapshots are TTL-cached (5 min)
 * and served from cache on read — same pattern as the server insights collector. `refresh` bypasses
 * the TTL for an explicit user action.
 *
 * Per-service rows are keyed by compose project (appName). Joining to compose/service names is left
 * to the caller (the debug page already has that mapping from the runtime containers query) so this
 * module stays pure Docker — no Dokploy fan-out, no auth, deletable in one piece.
 *
 * Sizing semantics: "data" is what a service owns exclusively (volumes + writable layer) — what
 * deleting it frees. Images are stored once and shared by every container that references them, so
 * they are listed separately (imageBytes, sharedImage) and only folded into footprintBytes, an
 * upper-bound "this service's total disk presence" figure.
 */

type DockerVolume = { Name?: string; Labels?: Record<string, string> | null; UsageData?: { Size?: number } | null }
type DockerContainerSummary = { Labels?: Record<string, string> | null; SizeRw?: number; ImageID?: string }
type DockerImageSummary = { Id?: string; Size?: number }
type DockerBuildCacheEntry = { Size?: number }



const toBytes = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

const projectOf = (labels: Record<string, string> | null | undefined): string | null => {
  const project = String(labels?.['com.docker.compose.project'] || '').trim()
  return project || null
}

const getStorageSnapshotUncached = async (): Promise<StorageSnapshot> => {
  const [df, diskStats] = await Promise.all([
    dockerSocketGetJson('/system/df') as Promise<{
      Volumes?: DockerVolume[]
      Containers?: DockerContainerSummary[]
      Images?: DockerImageSummary[]
      BuildCache?: DockerBuildCacheEntry[]
    }>,
    fs.statfs('/'),
  ])

  const blockSize = Number(diskStats.bsize)
  const diskTotalBytes = Number(diskStats.blocks) * blockSize
  const diskUsedBytes = diskTotalBytes - Number(diskStats.bavail) * blockSize

  const services = new Map<string, StorageServiceUsage>()
  const ensureService = (project: string | null): StorageServiceUsage => {
    const key = project ?? ''
    let svc = services.get(key)
    if (!svc) {
      svc = { project, composeId: null, volumesBytes: 0, rwBytes: 0, totalBytes: 0, imageBytes: 0, sharedImage: false, footprintBytes: 0, volumeCount: 0 }
      services.set(key, svc)
    }
    return svc
  }

  const volumes: StorageVolumeUsage[] = []
  let volumesTotalBytes = 0
  for (const vol of df.Volumes ?? []) {
    const size = toBytes(vol.UsageData?.Size)
    const project = projectOf(vol.Labels)
    volumes.push({ name: String(vol.Name || ''), sizeBytes: size, project })
    volumesTotalBytes += size
    const svc = ensureService(project)
    svc.volumesBytes += size
    svc.volumeCount += 1
  }

  // Image sizes by id, and which compose projects use each image (to know when an image is shared).
  const imageSizeById = new Map<string, number>()
  for (const image of df.Images ?? []) {
    const id = String(image.Id || '')
    if (id) imageSizeById.set(id, toBytes(image.Size))
  }
  const projectsByImageId = new Map<string, Set<string>>()
  let containersRwBytes = 0
  for (const container of df.Containers ?? []) {
    const project = projectOf(container.Labels)
    const rw = toBytes(container.SizeRw)
    containersRwBytes += rw
    ensureService(project).rwBytes += rw
    const imageId = String(container.ImageID || '')
    if (imageId) {
      let projects = projectsByImageId.get(imageId)
      if (!projects) {
        projects = new Set<string>()
        projectsByImageId.set(imageId, projects)
      }
      projects.add(project ?? '')
    }
  }

  let imagesBytes = 0
  for (const image of df.Images ?? []) imagesBytes += toBytes(image.Size)

  let buildCacheBytes = 0
  for (const entry of df.BuildCache ?? []) buildCacheBytes += toBytes(entry.Size)

  // Attribute each project's images once per image (not per container), flagging shares.
  const imageIdsByProject = new Map<string, Set<string>>()
  for (const [imageId, projects] of projectsByImageId) {
    for (const project of projects) {
      let ids = imageIdsByProject.get(project)
      if (!ids) {
        ids = new Set<string>()
        imageIdsByProject.set(project, ids)
      }
      ids.add(imageId)
    }
  }
  for (const svc of services.values()) {
    const ids = imageIdsByProject.get(svc.project ?? '') ?? []
    for (const imageId of ids) {
      svc.imageBytes += imageSizeById.get(imageId) ?? 0
      if ((projectsByImageId.get(imageId)?.size ?? 0) > 1) svc.sharedImage = true
    }
    svc.totalBytes = svc.volumesBytes + svc.rwBytes
    svc.footprintBytes = svc.totalBytes + svc.imageBytes
  }

  const serviceRows = [...services.values()].sort((a, b) => b.footprintBytes - a.footprintBytes)

  const attributedBytes = volumesTotalBytes + containersRwBytes + imagesBytes + buildCacheBytes
  return {
    ts: Date.now(),
    diskTotalBytes,
    diskUsedBytes,
    imagesBytes,
    buildCacheBytes,
    containersRwBytes,
    volumesTotalBytes,
    residualBytes: Math.max(0, diskUsedBytes - attributedBytes),
    services: serviceRows,
    volumes,
  }
}

let cachedSnapshot: StorageSnapshot | null = null

export const getStorageSnapshot = async (refresh = false): Promise<StorageSnapshot> => {
  if (!refresh && cachedSnapshot && Date.now() - cachedSnapshot.ts < STORAGE_INSIGHTS_TTL_MS) {
    return cachedSnapshot
  }
  const snapshot = await getStorageSnapshotUncached()
  cachedSnapshot = snapshot
  return snapshot
}
