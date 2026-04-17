import { Modal } from '@mantine/core'
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
      title={app.label}
      size="90vw"
      centered
      styles={{ body: { height: '80vh', padding: 0 }, content: { height: '85vh' } }}
    >
      <iframe
        src={src}
        title={app.label}
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </Modal>
  )
}
