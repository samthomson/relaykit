import { RubixLoader, RubixLoaderColor } from '@samthomson/rubix-loader'
import { ActionIcon, Box, Divider, Group, Modal, Text } from '@mantine/core'
import { IconChevronRight, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { serviceTypeToRubixLoaderColor } from '../lib/serviceTypeColor'
import { buildEmbeddedAppSrc, EMBEDDABLE_APPS, type EmbeddableAppId } from './registry'

type Props = {
  appId: EmbeddableAppId
  context: Record<string, string | undefined>
  serviceType?: string | null
  presetId?: string | null
  onClose: () => void
}

export const EmbeddedAppModal = ({ appId, context, serviceType, presetId, onClose }: Props) => {
  const app = EMBEDDABLE_APPS[appId]
  const src = buildEmbeddedAppSrc(appId, context)
  const [loaded, setLoaded] = useState(false)
  const color = useMemo(() => serviceTypeToRubixLoaderColor(serviceType, presetId), [serviceType, presetId])
  const appName = app.id.replace(/-/g, ' ')

  useEffect(() => {
    setLoaded(false)
  }, [src])

  return (
    <Modal
      opened
      onClose={onClose}
      title={null}
      withCloseButton={false}
      padding={0}
      radius={0}
      size="90vw"
      centered
      styles={{
        header: { display: 'none' },
        body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-body)' },
        content: { height: '85vh', background: 'var(--mantine-color-body)' },
      }}
    >
      <Box px="md" py="xs" style={{ flexShrink: 0 }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Box style={{ width: 18, height: 18, flexShrink: 0, lineHeight: 0 }}>
              <RubixLoader size={18} colors={[RubixLoaderColor.RelayKit]} />
            </Box>
            <Text
              size="sm"
              className="brand-title"
              c="relaykit"
              style={{ lineHeight: 1, transform: 'translateY(1px)' }}
            >
              relaykit
            </Text>
            <IconChevronRight size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, opacity: 0.6 }} />
            <Box
              px={8}
              py={2}
              style={{
                border: '1px solid var(--mantine-color-default-border)',
                background: 'var(--mantine-color-default-hover)',
                borderLeft: '2px solid var(--mantine-primary-color-filled)',
                minWidth: 0,
              }}
            >
              <Text size="sm" ff="monospace" fw={700} c="text" truncate style={{ textTransform: 'lowercase' }}>
                {appName}
              </Text>
            </Box>
          </Group>
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={onClose} aria-label="close" radius={0}>
            <IconX size={18} />
          </ActionIcon>
        </Group>
      </Box>
      <Divider />
      <Box style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--mantine-color-body)' }}>
        {!loaded && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'var(--mantine-color-body)',
              zIndex: 2,
            }}
          >
            <RubixLoader size={160} colors={[color]} />
            <Text size="sm" c="dimmed" ff="monospace">
              loading...
            </Text>
          </Box>
        )}
        <iframe
          src={src}
          title={app.label}
          onLoad={() => setLoaded(true)}
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: 'var(--mantine-color-body)',
          }}
        />
      </Box>
    </Modal>
  )
}
