import { useEffect, useState, type ReactNode } from 'react'
import { Box, Group, Paper, Text, Tooltip } from '@mantine/core'
import { IconCpu, IconDatabase, IconServer } from '@tabler/icons-react'
import { trpc } from '../trpc'

const formatPercentRounded = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

const formatBytesRounded = (bytes: number | null): string => {
  if (bytes === null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Math.max(0, bytes)
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx += 1
  }
  return `${Math.round(size)}${units[idx]}`
}

const InlineMetric = ({ label, value, icon }: { label: string; value: string; icon: ReactNode }) => (
  <Tooltip label={label} withArrow>
    <Group
      gap={5}
      wrap="nowrap"
      style={{
        width: 'fit-content',
      }}
    >
      <Box c="dimmed" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {icon}
      </Box>
      <Text size="xs" c="dimmed" fw={500} lh={1.1} style={{ whiteSpace: 'nowrap' }}>{value}</Text>
    </Group>
  </Tooltip>
)

export const NavServerSummary = () => {
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof trpc.getServerInsights.query>> | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const next = await trpc.getServerInsights.query()
        if (!mounted) return
        setInsights(next)
      } catch {
        // Keep nav quiet if insights endpoint is unavailable.
      }
    }

    void load()
    const poll = window.setInterval(() => {
      void load()
    }, 10000)
    return () => {
      mounted = false
      window.clearInterval(poll)
    }
  }, [])

  if (!insights) return null
  return (
    <Paper withBorder p="xs" mt="sm">
      <Text size="xs" fw={600} mb={4}>server</Text>
      <Group gap={8} wrap="nowrap">
        <InlineMetric
          label={`CPU usage: ${formatPercentRounded(insights.current.cpuPct)} (load ${Math.round(insights.current.load1)}/${Math.round(insights.current.load5)}/${Math.round(insights.current.load15)})`}
          value={formatPercentRounded(insights.current.cpuPct)}
          icon={<IconCpu size={12} />}
        />
        <Text size="xs" c="gray.5">•</Text>
        <InlineMetric
          label={`Memory usage: ${formatBytesRounded(insights.current.memoryUsedBytes)} / ${formatBytesRounded(insights.current.memoryTotalBytes)} (${formatPercentRounded(insights.current.memoryUsedPct)})`}
          value={formatBytesRounded(insights.current.memoryUsedBytes)}
          icon={<IconServer size={12} />}
        />
        <Text size="xs" c="gray.5">•</Text>
        <InlineMetric
          label={`Disk usage: ${formatPercentRounded(insights.current.diskUsedPct)} (${formatBytesRounded(insights.current.diskUsedBytes)} / ${formatBytesRounded(insights.current.diskTotalBytes)})`}
          value={formatBytesRounded(insights.current.diskUsedBytes)}
          icon={<IconDatabase size={12} />}
        />
      </Group>
    </Paper>
  )
}
