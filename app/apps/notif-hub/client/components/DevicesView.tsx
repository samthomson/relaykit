import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Alert, Button, CopyButton, Group, Paper, Stack, Text, rem } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { deleteDevice, listDevices, registerDevice, sendTestNotification } from '@/lib/api'
import { embedded } from '@/lib/auth'
import { defaultDeviceLabel, getExistingSubscription, isInstalledPwa, isIos, pushSupported, subscribeToPush, subscriptionMatchesKey } from '@/lib/push'
import { LoadingState } from './LoadingState'
import { NtfyCard } from './NtfyCard'
import type { NtfyConfig } from '../../types'

const QrCanvas = ({ value, size = 168 }: { value: string; size?: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 }, (error) => {
      if (error) console.error('qr generation error:', error)
    })
  }, [value, size])
  return <canvas ref={canvasRef} style={{ borderRadius: 4 }} />
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <Group gap={8} wrap="nowrap" align="flex-start">
    <Text size="xs" ff="monospace" c="relaykit" fw={700} style={{ flexShrink: 0 }}>
      {n}.
    </Text>
    <Text size="xs">{children}</Text>
  </Group>
)

export const DevicesView = ({ vapidPublicKey, ntfy }: { vapidPublicKey: string; ntfy: NtfyConfig }) => {
  const queryClient = useQueryClient()
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: ({ signal }) => listDevices(signal),
  })

  useEffect(() => {
    getExistingSubscription().then((sub) => {
      // A subscription bound to an old VAPID key counts as unregistered so the
      // enable button reappears and re-subscribes with the current key.
      const valid = sub && subscriptionMatchesKey(sub, vapidPublicKey)
      setCurrentEndpoint(valid ? sub.endpoint : null)
    })
  }, [vapidPublicKey])

  const enableMutation = useMutation({
    mutationFn: async () => {
      const subscription = await subscribeToPush(vapidPublicKey)
      await registerDevice(defaultDeviceLabel(), subscription)
      return subscription.endpoint ?? null
    },
    onSuccess: (endpoint) => {
      setCurrentEndpoint(endpoint)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      notifications.show({ message: 'notifications enabled on this device' })
    },
    onError: (err) => notifications.show({ color: 'red', autoClose: false, message: String(err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  const testMutation = useMutation({
    mutationFn: sendTestNotification,
    onSuccess: ({ pushed }) => {
      // Refresh so per-device delivery errors show up right away.
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      notifications.show({ message: `test notification sent to ${pushed} device(s)` })
    },
    onError: (err) => notifications.show({ color: 'red', message: String(err) }),
  })

  const standaloneUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
  const supported = pushSupported()
  const installed = isInstalledPwa()
  const thisDeviceRegistered = !!currentEndpoint && (devices ?? []).some((d) => d.endpoint === currentEndpoint)
  // iOS Safari (not installed) exposes no push API; the fix is installing, not a different browser.
  const needsInstall = !supported && isIos() && !installed
  // Browsers refuse notification permission requests from a cross-origin iframe, so enabling
  // this computer has to happen in relaykit's parent frame — i.e. the hub's own tab.
  const needsOwnTab = embedded()

  if (!devices) {
    return (
      <Stack gap="md" maw={640}>
        <Text size="sm" fw={600}>devices</Text>
        <LoadingState />
      </Stack>
    )
  }

  return (
    <Stack gap="md" maw={640}>
      <Group justify="space-between">
        <Text size="sm" fw={600}>devices</Text>
        {(devices ?? []).length > 0 && (
          <Button size="xs" variant="light" loading={testMutation.isPending} onClick={() => testMutation.mutate()}>
            send test push
          </Button>
        )}
      </Group>

      {needsOwnTab && !thisDeviceRegistered && supported && (
        <Alert variant="light" title="enable this computer in the hub's own tab">
          <Stack gap="sm" align="flex-start">
            <Text size="xs">
              browsers refuse notification permission requests from an embedded frame, so this has to be done
              with the hub open on its own.
            </Text>
            <Button size="xs" variant="light" component="a" href={standaloneUrl} target="_blank" rel="noreferrer">
              open pulse in a new tab
            </Button>
          </Stack>
        </Alert>
      )}

      {needsInstall && (
        <Alert variant="light" title="almost there — install to enable notifications">
          <Stack gap={6}>
            <Step n={1}>tap the share button in your browser</Step>
            <Step n={2}>choose “add to home screen”</Step>
            <Step n={3}>open the installed app from your home screen and tap “enable notifications”</Step>
          </Stack>
        </Alert>
      )}

      {!installed && !needsInstall && (
        <Paper withBorder p="md">
          <Group align="flex-start" gap="lg">
            <QrCanvas value={standaloneUrl} />
            <Stack gap={8} style={{ flex: 1, minWidth: rem(200) }}>
              <Text size="sm" fw={500}>get notifications on your phone</Text>
              <Step n={1}>scan the qr code (or open the link) on your phone</Step>
              <Step n={2}>add it to your home screen (on ios: share → add to home screen)</Step>
              <Step n={3}>open it from the home screen and tap “enable notifications”</Step>
              <Group gap="xs" mt={4}>
                <Text size="xs" ff="monospace" c="dimmed" truncate style={{ minWidth: 0 }}>
                  {standaloneUrl}
                </Text>
                <CopyButton value={standaloneUrl}>
                  {({ copied, copy }) => (
                    <Button size="compact-xs" variant="light" onClick={copy} style={{ flexShrink: 0 }}>
                      {copied ? 'copied' : 'copy link'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Group>
        </Paper>
      )}

      <Paper withBorder p="sm">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2}>
            <Text size="sm">this device</Text>
            <Text size="xs" c="dimmed">
              {needsInstall
                ? 'waiting for install — follow the steps above'
                : !supported
                  ? 'push is not supported in this browser'
                  : thisDeviceRegistered
                    ? 'registered — pushes will arrive here'
                    : needsOwnTab
                      ? 'not registered — see above'
                      : 'not registered'}
            </Text>
            {enableMutation.error && (
              <Text size="xs" c="red" style={{ wordBreak: 'break-word' }}>
                {String(enableMutation.error)}
              </Text>
            )}
          </Stack>
          {supported && !thisDeviceRegistered && !needsOwnTab && (
            <Button size="xs" style={{ flexShrink: 0 }} loading={enableMutation.isPending} onClick={() => enableMutation.mutate()}>
              enable notifications
            </Button>
          )}
        </Group>
      </Paper>

      <NtfyCard ntfy={ntfy} />

      {(devices ?? []).map((device) => (
        <Paper key={device.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Text size="sm">{device.label}</Text>
                {device.endpoint === currentEndpoint && (
                  <Text size="xs" c="dimmed">(this device)</Text>
                )}
              </Group>
              <Text size="xs" c="dimmed">added {new Date(device.createdAt).toLocaleDateString()}</Text>
              {device.lastError && (
                <Text size="xs" c="red" style={{ wordBreak: 'break-word' }}>
                  last push failed: {device.lastError}
                </Text>
              )}
            </Stack>
            <ActionIcon variant="subtle" color="red" onClick={() => deleteMutation.mutate(device.id)} aria-label="remove device">
              <Trash2 size={14} />
            </ActionIcon>
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
