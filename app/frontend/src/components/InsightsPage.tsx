import { useEffect, useState } from 'react';
import { LineChart } from '@mantine/charts';
import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconAlertOctagon, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { trpc } from '../trpc';
import {
  formatBytes,
  formatPercent,
  formatUptime,
  formatWindow,
  getInsightSeverity,
  getOverallSeverity,
  getPressure,
  getSeverityColor,
} from '../../../shared/insights';

export const InsightsPage = () => {
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof trpc.getServerInsights.query>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const next = await trpc.getServerInsights.query();
        if (!mounted) return;
        setInsights(next);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Could not load server insights');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const poll = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  if (loading && !insights) {
    return (
      <Stack gap="xl" p="xl">
        <Title order={2}>Insights</Title>
        <Text c="dimmed">Loading server insights…</Text>
      </Stack>
    );
  }

  if (error && !insights) {
    return (
      <Stack gap="xl" p="xl">
        <Title order={2}>Insights</Title>
        <Paper withBorder p="md">
          <Text fw={500} c="red">Could not load insights</Text>
          <Text size="sm" c="dimmed" mt={6}>{error}</Text>
        </Paper>
      </Stack>
    );
  }

  if (!insights) return null;

  const { current, thresholds } = insights;
  const cpuSeverity = getInsightSeverity(current.cpuPct, thresholds.cpu.warn, thresholds.cpu.critical);
  const memSeverity = getInsightSeverity(current.memoryUsedPct, thresholds.memory.warn, thresholds.memory.critical);
  const diskSeverity = getInsightSeverity(current.diskUsedPct, thresholds.disk.warn, thresholds.disk.critical);
  const processRssPct = current.memoryTotalBytes > 0 ? (current.processRssBytes / current.memoryTotalBytes) * 100 : 0;
  const processHeapPct = current.memoryTotalBytes > 0 ? (current.processHeapUsedBytes / current.memoryTotalBytes) * 100 : 0;
  const recommendations: string[] = [];
  if (cpuSeverity !== 'normal') recommendations.push('CPU is elevated. If this persists, upgrade to more vCPU.');
  if (memSeverity !== 'normal') recommendations.push('Memory is near capacity. Increase RAM to avoid OOM pressure.');
  if (diskSeverity !== 'normal') recommendations.push('Disk is filling up. Expand storage before services degrade.');

  const chartData = insights.history.map((p) => ({
    time: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu: Number(p.cpuPct.toFixed(1)),
    memory: Number(p.memoryUsedPct.toFixed(1)),
    disk: Number(p.diskUsedPct.toFixed(1)),
  }));
  const historyWindowSec = Math.max(0, Math.round((chartData.length * insights.sampleIntervalMs) / 1000));
  const historyWindowLabel = formatWindow(historyWindowSec);
  const rssPressure = getPressure(processRssPct);
  const heapPressure = getPressure(processHeapPct);
  const overallSeverity = getOverallSeverity([cpuSeverity, memSeverity, diskSeverity]);
  const overallHealth = overallSeverity === 'critical'
    ? { label: 'Critical', color: 'red', icon: <IconAlertOctagon size={14} /> }
    : overallSeverity === 'warn'
      ? { label: 'Watch', color: 'yellow', icon: <IconAlertTriangle size={14} /> }
      : { label: 'Healthy', color: 'green', icon: <IconCircleCheck size={14} /> };

  return (
    <Stack gap="xl" p="xl">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Insights</Title>
          <Text size="sm" c="dimmed">
            Server capacity and utilization trends (sampled every {Math.round(insights.sampleIntervalMs / 1000)} seconds)
          </Text>
          <Text size="sm" c="dimmed">
            Charts show the last {formatWindow(historyWindowSec)} of data.
          </Text>
        </div>
        <Group gap="xs">
          <Badge variant="filled" color={overallHealth.color} leftSection={overallHealth.icon}>
            Health: {overallHealth.label}
          </Badge>
          <Badge variant="filled" color="relay-orange">Uptime: {formatUptime(current.uptimeSec)}</Badge>
        </Group>
      </Group>

      {error && (
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">Last refresh error: {error}</Text>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Paper withBorder p="md">
          <Group justify="space-between" mb={6}>
            <Text fw={600}>CPU utilization</Text>
            <Badge variant="filled" color={getSeverityColor(cpuSeverity)}>{cpuSeverity}</Badge>
          </Group>
          <Text size="xl" fw={700}>{formatPercent(current.cpuPct)}</Text>
          <Text size="xs" c="dimmed" mt={4}>Load: {current.load1} / {current.load5} / {current.load15}</Text>
        </Paper>

        <Paper withBorder p="md">
          <Group justify="space-between" mb={6}>
            <Text fw={600}>Memory used</Text>
            <Badge variant="filled" color={getSeverityColor(memSeverity)}>{memSeverity}</Badge>
          </Group>
          <Text size="xl" fw={700}>{formatPercent(current.memoryUsedPct)}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {formatBytes(current.memoryUsedBytes)} / {formatBytes(current.memoryTotalBytes)}
          </Text>
        </Paper>

        <Paper withBorder p="md">
          <Group justify="space-between" mb={6}>
            <Text fw={600}>Storage used</Text>
            <Badge variant="filled" color={getSeverityColor(diskSeverity)}>{diskSeverity}</Badge>
          </Group>
          <Text size="xl" fw={700}>{formatPercent(current.diskUsedPct)}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {formatBytes(current.diskUsedBytes)} / {formatBytes(current.diskTotalBytes)}
          </Text>
        </Paper>
      </SimpleGrid>

      {recommendations.length > 0 && (
        <Paper withBorder p="md">
          <Text fw={600} mb="xs">Capacity recommendations</Text>
          <Stack gap={4}>
            {recommendations.map((r) => (
              <Text key={r} size="sm">{r}</Text>
            ))}
          </Stack>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">CPU trend</Text>
          <LineChart
            h={220}
            data={chartData}
            dataKey="time"
            series={[{ name: 'cpu', color: 'relay-orange' }]}
            withDots={false}
            withLegend={false}
            yAxisProps={{ domain: [0, 100] }}
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatPercent(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">Memory trend</Text>
          <LineChart
            h={220}
            data={chartData}
            dataKey="time"
            series={[{ name: 'memory', color: 'blue' }]}
            withDots={false}
            withLegend={false}
            yAxisProps={{ domain: [0, 100] }}
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatPercent(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text fw={600} mb="sm">Storage trend</Text>
          <LineChart
            h={220}
            data={chartData}
            dataKey="time"
            series={[{ name: 'disk', color: 'grape' }]}
            withDots={false}
            withLegend={false}
            yAxisProps={{ domain: [0, 100] }}
            tooltipProps={{ cursor: false }}
            valueFormatter={(value) => formatPercent(value)}
          />
          <Text size="xs" c="dimmed" mt={8}>Window: last {historyWindowLabel}</Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">Process footprint</Text>
        <Stack gap="sm">
          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={500}>App memory (RSS): {formatBytes(current.processRssBytes)}</Text>
              <Badge variant="light" color={rssPressure.color}>{rssPressure.label}</Badge>
            </Group>
            <Progress value={Math.min(100, processRssPct)} color={rssPressure.color} radius="xl" />
            <Text size="xs" c="dimmed" mt={4}>Total memory used by this backend process.</Text>
          </div>
          <div>
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={500}>JavaScript memory (Heap): {formatBytes(current.processHeapUsedBytes)}</Text>
              <Badge variant="light" color={heapPressure.color}>{heapPressure.label}</Badge>
            </Group>
            <Progress value={Math.min(100, processHeapPct)} color={heapPressure.color} radius="xl" />
            <Text size="xs" c="dimmed" mt={4}>JS objects only (subset of app memory).</Text>
          </div>
        </Stack>
        <Text size="xs" c="dimmed" mt={8}>
          You can ignore this unless memory is in warn/critical. Then use RSS as the main “is this app heavy?” signal.
        </Text>
      </Paper>
    </Stack>
  );
};
