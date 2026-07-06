import { useEffect, useState } from 'react';
import { Avatar, Group, Text } from '@mantine/core';
import { parsePubkeyHex, fetchNpanelProfile, type NpanelProfile } from '../../../shared/nsite';

/** Shows the publishing key's kind-0 avatar + name for an npanel service. Best-effort. */
export const NpanelSiteIdentity = ({
  npubOrHex,
  relaysCsv,
  avatarSize = 14,
}: {
  npubOrHex?: string;
  relaysCsv?: string;
  avatarSize?: number;
}) => {
  const [profile, setProfile] = useState<NpanelProfile | null>(null);

  useEffect(() => {
    const hex = parsePubkeyHex((npubOrHex ?? '').trim());
    if (!hex) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchNpanelProfile(hex, relaysCsv ?? '')
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [npubOrHex, relaysCsv]);

  if (!profile?.name && !profile?.picture) return null;

  return (
    <Group gap={5} wrap="nowrap" style={{ minWidth: 0, lineHeight: 1 }}>
      <Text size="xs" c="dimmed" style={{ flexShrink: 0, lineHeight: 1 }}>
        published by
      </Text>
      <Avatar src={profile.picture} size={avatarSize} radius={0} style={{ flexShrink: 0 }} />
      {profile.name && (
        <Text size="xs" c="dimmed" truncate style={{ minWidth: 0, lineHeight: 1 }}>
          {profile.name}
        </Text>
      )}
    </Group>
  );
};
