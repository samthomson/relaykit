import { Box, Group, Text } from '@mantine/core'
import { RubixLoader, RubixLoaderColor } from '@samthomson/rubix-loader'

/** Mirrors relaykit's embedded-app header, for when the hub is viewed on its own domain. */
export const BrandHeader = ({ size = 28 }: { size?: number }) => (
  <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
    <Box style={{ width: size, height: size, flexShrink: 0, lineHeight: 0 }}>
      <RubixLoader size={size} colors={[RubixLoaderColor.RelayKit]} />
    </Box>
    <Text size="lg" className="brand-title" c="relaykit" style={{ lineHeight: 1 }}>
      relaykit
    </Text>
    <Text size="sm" c="dimmed" style={{ flexShrink: 0, opacity: 0.6 }}>
      ›
    </Text>
    <Box
      px={8}
      py={2}
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default-hover)',
        minWidth: 0,
      }}
    >
      <Text size="sm" ff="monospace" fw={700} truncate>
        pulse
      </Text>
    </Box>
  </Group>
)
