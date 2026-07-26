import { Stack, Text } from '@mantine/core'
import { RubixLoader } from '@samthomson/rubix-loader'

/** Shown while a view's first query is in flight, instead of flashing an empty state. */
export const LoadingState = () => (
  <Stack align="center" justify="center" gap="sm" py="xl">
    <RubixLoader size={72} colors={['#8F2E44']} speed={1.35} />
    <Text size="xs" c="dimmed" ff="monospace">
      loading...
    </Text>
  </Stack>
)
