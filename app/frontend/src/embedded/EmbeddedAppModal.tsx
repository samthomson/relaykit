import { ActionIcon, Box, Divider, Group, Modal, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { buildEmbeddedAppSrc, EMBEDDABLE_APPS, type EmbeddableAppId } from './registry'

type Props = {
  appId: EmbeddableAppId
  context: Record<string, string | undefined>
  onClose: () => void
}

export const EmbeddedAppModal = ({ appId, context, onClose }: Props) => {
  const app = EMBEDDABLE_APPS[appId]
  const src = buildEmbeddedAppSrc(appId, context)

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
        body: { padding: 0, height: '80vh', display: 'flex', flexDirection: 'column' },
        content: { height: '85vh' },
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
      <iframe
        src={src}
        title={app.label}
        style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', display: 'block' }}
      />
    </Modal>
  )
}
