import { useMemo, useState } from 'react';
import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { EmbeddedAppModal } from '../embedded/EmbeddedAppModal';
import { EMBEDDABLE_APPS, EMBEDDABLE_APP_IDS, type EmbeddableAppId } from '../embedded/registry';
import { useRefreshServices } from '../contexts/RefreshServicesContext';
import { useAuth } from '../contexts/AuthContext';
import { isRelayType } from '../../../shared/serviceType';

export const AppsPage = () => {
  const [activeLaunch, setActiveLaunch] = useState<{ appId: EmbeddableAppId; session: string } | null>(null);
  const { services } = useRefreshServices();
  const { npub } = useAuth();

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
            relays:
              activeLaunch.appId === 'relay-explorer' || activeLaunch.appId === 'nsite-explorer'
                ? relayOptionsParam
                : undefined,
            npub: activeLaunch.appId === 'relay-explorer' ? (npub ?? undefined) : undefined,
            owner: activeLaunch.appId === 'nsite-explorer' ? (npub ?? undefined) : undefined,
          }}
          onClose={() => setActiveLaunch(null)}
        />
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md">
        {EMBEDDABLE_APP_IDS.map((appId) => {
          const app = EMBEDDABLE_APPS[appId];
          return (
            <Card key={app.id} withBorder p="md">
              <Stack gap="md">
                <Stack gap={2}>
                  <Text fw={600}>{app.label}</Text>
                  <Text size="sm" c="dimmed">{app.description}</Text>
                </Stack>

                <Group justify="flex-start">
                  <Button
                    variant="light"
                    color="relaykit"
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
