import { Modal, Text, Group, Button } from '@mantine/core';
import { formatBytes } from '../../../shared/insights';

/** The two service-scoped destructive confirmations: delete (service + data) and clearData (data only). */
export type ServiceConfirmState =
  | { type: 'deleteService'; composeId: string; name: string }
  | { type: 'clearData'; composeId: string; name: string; presetId: string };

export const isServiceConfirm = (modal: { type: string }): modal is ServiceConfirmState =>
  modal.type === 'deleteService' || modal.type === 'clearData';

/** What clearing data resets beyond the data itself (keyed by preset id). Absent = boots fresh. */
const CLEAR_DATA_CONSEQUENCES: Record<string, string> = {
  grasp: 'Grasp generates a new relay identity (nsec) on boot.',
  'notif-hub': 'Pulse loses its keys, rules and device registrations — it will need re-setup.',
};
const DEFAULT_CONSEQUENCE = 'The service restarts empty with its config and domains intact.';

export const ServiceDataConfirmModal = ({
  confirm,
  dataBytes,
  onConfirm,
  onCancel,
}: {
  confirm: ServiceConfirmState;
  dataBytes: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const sizeText = dataBytes != null ? ` (~${formatBytes(dataBytes)})` : '';
  const copy = confirm.type === 'deleteService'
    ? {
        title: 'Delete service?',
        message: `Delete "${confirm.name}" and all its data${sizeText}? This cannot be undone.`,
        confirmLabel: 'Delete service',
      }
    : {
        title: 'Clear service data?',
        message: `Delete all of "${confirm.name}"'s data${sizeText}? ${CLEAR_DATA_CONSEQUENCES[confirm.presetId] ?? DEFAULT_CONSEQUENCE}`,
        confirmLabel: 'Clear data',
      };
  return (
    <Modal opened onClose={onCancel} title={copy.title} centered size="sm">
      <Text size="sm" c="dimmed" mb="lg">{copy.message}</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>cancel</Button>
        <Button color="red" onClick={onConfirm}>{copy.confirmLabel}</Button>
      </Group>
    </Modal>
  );
};
