import { RubixLoader } from '@samthomson/rubix-loader'
import { ActionIcon, Box, Divider, Group, Modal, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
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
      size="96vw"
      centered
      styles={{
        header: { display: 'none' },
        body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-body)' },
        content: { height: '96vh', maxHeight: '96dvh', background: 'var(--mantine-color-body)' },
      }}
    >
      <Box px="md" py="xs" style={{ flexShrink: 0 }}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm" ff="monospace" fw={600} c="dimmed" style={{ textTransform: 'lowercase' }}>
            {app.label}
          </Text>
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
