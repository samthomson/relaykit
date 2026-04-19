import { useMemo, useState } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { EmbeddedAppModal } from '../embedded/EmbeddedAppModal';
import { EMBEDDABLE_APPS, type EmbeddableAppId } from '../embedded/registry';
import { useRefreshServices } from '../contexts/RefreshServicesContext';
import { isRelayType } from '../../../shared/serviceType';

const APP_IDS: EmbeddableAppId[] = ['relay-explorer', 'blossom-explorer', 'nsite-explorer'];
const APP_SUMMARIES: Record<EmbeddableAppId, string> = {
  'relay-explorer': 'inspect live nostr relay events',
  'blossom-explorer': 'browse and verify blossom blobs',
  'nsite-explorer': 'inspect and debug nsite data',
};

export const AppsPage = () => {
  const [activeLaunch, setActiveLaunch] = useState<{ appId: EmbeddableAppId; session: string } | null>(null);
  const { services } = useRefreshServices();

  const knownRelays = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(services) ? services : [])
            .filter((service: any) => isRelayType(service?.type) && service?.domains?.[0]?.host)
            .map((service: any) => `wss://${service.domains[0].host}`),
        ),
      ),
    [services],
  );

  const relayOptionsParam = useMemo(() => (knownRelays.length > 0 ? knownRelays.join(',') : undefined), [knownRelays]);

  return (
    <Stack gap="xl" p="xl">
      {activeLaunch && (
        <EmbeddedAppModal
          appId={activeLaunch.appId}
          context={{
            standalone: '1',
            session: activeLaunch.session,
            relays: activeLaunch.appId === 'relay-explorer' ? relayOptionsParam : undefined,
          }}
          onClose={() => setActiveLaunch(null)}
        />
      )}

      <Stack gap={4}>
        <Text fw={600}>apps</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md">
        {APP_IDS.map((appId) => {
          const app = EMBEDDABLE_APPS[appId];
          return (
            <Card key={app.id} withBorder p="md">
              <Stack gap="md">
                <Stack gap={2}>
                  <Text fw={600}>{app.label}</Text>
                  <Text size="sm" c="dimmed">{APP_SUMMARIES[app.id]}</Text>
                </Stack>

                <Group justify="flex-start">
                  <Button
                    variant="default"
                    onClick={() => setActiveLaunch({ appId: app.id, session: String(Date.now()) })}
                  >
                    open
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
};
