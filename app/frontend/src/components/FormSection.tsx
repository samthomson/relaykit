import type { ReactNode } from 'react';
import { Box, Paper, Stack, Text } from '@mantine/core';

/** Reusable titled config section: a bordered card with a header band and a padded body. */
export const FormSection = ({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
    <Box
      px="md"
      py="xs"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <Box style={{ minWidth: 0 }}>
        <Text fw={600} size="sm">
          {title}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
      </Box>
      {action}
    </Box>
    <Stack gap="md" p="md">
      {children}
    </Stack>
  </Paper>
);
