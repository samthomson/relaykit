import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Anchor, Center, Stack, Text, Title } from '@mantine/core';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <Center mih="100vh" bg="var(--mantine-color-body)">
      <Stack align="center" gap="md">
        <Title order={1}>404</Title>
        <Text size="lg" c="dimmed">
          Oops! Page not found
        </Text>
        <Anchor href="/" underline="always">
          Return to home
        </Anchor>
      </Stack>
    </Center>
  );
};

export default NotFound;
