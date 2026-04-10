type PluralUnit = 'second' | 'minute' | 'hour' | 'day'

const pluralizeUnit = (unit: PluralUnit, count: number): string => (count === 1 ? unit : `${unit}s`)

export type InsightSeverity = 'normal' | 'warn' | 'critical'

export const getInsightSeverity = (value: number, warn: number, critical: number): InsightSeverity => {
  if (value >= critical) return 'critical'
  if (value >= warn) return 'warn'
  return 'normal'
}

export const getSeverityColor = (severity: InsightSeverity): string => {
  if (severity === 'critical') return 'red'
  if (severity === 'warn') return 'yellow'
  return 'green'
}

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`

export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${size.toFixed(1)} ${units[idx]}`
}

export const formatBytesPerSecond = (bytesPerSec: number): string => `${formatBytes(bytesPerSec)}/s`

export const formatUptime = (uptimeSec: number): string => {
  const days = Math.floor(uptimeSec / 86400)
  const hours = Math.floor((uptimeSec % 86400) / 3600)
  const mins = Math.floor((uptimeSec % 3600) / 60)
  if (days > 0) return `${days} ${pluralizeUnit('day', days)} ${hours} ${pluralizeUnit('hour', hours)}`
  if (hours > 0) return `${hours} ${pluralizeUnit('hour', hours)} ${mins} ${pluralizeUnit('minute', mins)}`
  return `${mins} ${pluralizeUnit('minute', mins)}`
}

export const formatWindow = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  if (mins <= 0) return `${seconds} ${pluralizeUnit('second', seconds)}`
  return `${mins} ${pluralizeUnit('minute', mins)}`
}

export const getPressure = (pct: number): { label: string; color: string } => {
  if (pct >= 30) return { label: 'high', color: 'red' }
  if (pct >= 15) return { label: 'medium', color: 'yellow' }
  return { label: 'low', color: 'green' }
}

export const getOverallSeverity = (severities: InsightSeverity[]): InsightSeverity => {
  if (severities.some((s) => s === 'critical')) return 'critical'
  if (severities.some((s) => s === 'warn')) return 'warn'
  return 'normal'
}

export type ServerInsightsConfig = {
  diskPath: string
  sampleIntervalMs: number
  historyMaxPoints: number
  thresholds: {
    cpu: { warn: number; critical: number }
    memory: { warn: number; critical: number }
    disk: { warn: number; critical: number }
  }
}

type CpuCoreTimes = {
  user: number
  nice: number
  sys: number
  idle: number
  irq: number
}

export type ServerInsightPoint = {
  ts: number
  cpuPct: number
  memoryUsedPct: number
  diskUsedPct: number
}

export type ServerInsightSnapshot = ServerInsightPoint & {
  memoryUsedBytes: number
  memoryTotalBytes: number
  diskUsedBytes: number
  diskTotalBytes: number
  load1: number
  load5: number
  load15: number
  uptimeSec: number
  processRssBytes: number
  processHeapUsedBytes: number
}

export type ServerInsightsResponse = {
  diskPath: string
  sampleIntervalMs: number
  thresholds: ServerInsightsConfig['thresholds']
  current: ServerInsightSnapshot
  history: ServerInsightPoint[]
}

export type ServiceInsightPoint = {
  ts: number
  cpuPct: number
  memoryUsedPct: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  networkInBytes: number
  networkOutBytes: number
  blockReadBytes: number
  blockWriteBytes: number
}

export type ServiceInsightsResponse = {
  composeId: string
  appName: string
  sampleIntervalMs: number
  thresholds: {
    cpu: { warn: number; critical: number }
    memory: { warn: number; critical: number }
  }
  current: ServiceInsightPoint
  history: ServiceInsightPoint[]
}

export const createServerInsightsCollector = (config: ServerInsightsConfig) => {
  let insightsHistory: ServerInsightPoint[] = []
  let latestSnapshot: ServerInsightSnapshot | null = null
  let lastInsightsSampleAt = 0
  let prevCpuTimes: CpuCoreTimes[] | null = null

  const toOneDecimal = (n: number): number => Math.round(n * 10) / 10

  const getCpuUsagePct = async (): Promise<number> => {
    const os = await import('os')
    const current = os.cpus().map((cpu) => cpu.times)
    if (!prevCpuTimes) {
      prevCpuTimes = current
      return 0
    }

    let idleDelta = 0
    let totalDelta = 0
    for (let i = 0; i < current.length; i += 1) {
      const p = prevCpuTimes[i]
      const c = current[i]
      const prevTotal = p.user + p.nice + p.sys + p.idle + p.irq
      const currTotal = c.user + c.nice + c.sys + c.idle + c.irq
      idleDelta += c.idle - p.idle
      totalDelta += currTotal - prevTotal
    }
    prevCpuTimes = current
    if (totalDelta <= 0) return 0
    return toOneDecimal(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)))
  }

  const getServerInsightsSnapshot = async (): Promise<ServerInsightSnapshot> => {
    const os = await import('os')
    const fs = await import('fs/promises')

    const cpuPct = await getCpuUsagePct()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memoryUsedPct = toOneDecimal((usedMem / totalMem) * 100)

    const diskStats = await fs.statfs(config.diskPath)
    const blockSize = Number(diskStats.bsize)
    const totalBlocks = Number(diskStats.blocks)
    const availBlocks = Number(diskStats.bavail)
    const diskTotalBytes = totalBlocks * blockSize
    const diskFreeBytes = availBlocks * blockSize
    const diskUsedBytes = diskTotalBytes - diskFreeBytes
    const diskUsedPct = diskTotalBytes > 0 ? toOneDecimal((diskUsedBytes / diskTotalBytes) * 100) : 0

    const [load1, load5, load15] = os.loadavg()
    const processMem = process.memoryUsage()
    const ts = Date.now()

    return {
      ts,
      cpuPct,
      memoryUsedPct,
      diskUsedPct,
      memoryUsedBytes: usedMem,
      memoryTotalBytes: totalMem,
      diskUsedBytes,
      diskTotalBytes,
      load1: toOneDecimal(load1),
      load5: toOneDecimal(load5),
      load15: toOneDecimal(load15),
      uptimeSec: Math.round(os.uptime()),
      processRssBytes: processMem.rss,
      processHeapUsedBytes: processMem.heapUsed,
    }
  }

  const sampleServerInsightsIfNeeded = async (): Promise<ServerInsightSnapshot> => {
    const now = Date.now()
    if (latestSnapshot && now - lastInsightsSampleAt < config.sampleIntervalMs) {
      return latestSnapshot
    }
    const snapshot = await getServerInsightsSnapshot()
    latestSnapshot = snapshot
    lastInsightsSampleAt = now
    insightsHistory.push({
      ts: snapshot.ts,
      cpuPct: snapshot.cpuPct,
      memoryUsedPct: snapshot.memoryUsedPct,
      diskUsedPct: snapshot.diskUsedPct,
    })
    if (insightsHistory.length > config.historyMaxPoints) {
      insightsHistory = insightsHistory.slice(-config.historyMaxPoints)
    }
    return snapshot
  }

  return {
    getServerInsights: async (): Promise<ServerInsightsResponse> => {
      const current = await sampleServerInsightsIfNeeded()
      return {
        diskPath: config.diskPath,
        sampleIntervalMs: config.sampleIntervalMs,
        thresholds: config.thresholds,
        current,
        history: insightsHistory,
      }
    },
  }
}
