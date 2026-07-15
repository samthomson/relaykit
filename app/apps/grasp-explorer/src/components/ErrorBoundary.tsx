import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Center, Code, Group, Paper, Stack, Text, Title, rem } from '@mantine/core';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Center mih="100vh" bg="var(--mantine-color-body)" p="md">
          <Stack gap="md" maw={448} w="100%">
            <Stack gap="xs" align="center">
              <Title order={2}>Something went wrong</Title>
              <Text c="dimmed" ta="center">
                An unexpected error occurred. The error has been reported.
              </Text>
            </Stack>

            <Paper withBorder p="md" radius={0}>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: rem(14), fontWeight: 500 }}>
                  Error details
                </summary>
                <Stack gap="sm" mt="sm">
                  <div>
                    <Text size="sm" fw={500}>
                      Message:
                    </Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      {this.state.error?.message}
                    </Text>
                  </div>
                  {this.state.error?.stack && (
                    <div>
                      <Text size="sm" fw={500}>
                        Stack trace:
                      </Text>
                      <Code block mt={4} fz="xs" style={{ maxHeight: rem(128), overflow: 'auto' }}>
                        {this.state.error.stack}
                      </Code>
                    </div>
                  )}
                </Stack>
              </details>
            </Paper>

            <Group grow>
              <Button onClick={this.handleReset}>Try again</Button>
              <Button variant="default" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </Group>
          </Stack>
        </Center>
      );
    }

    return this.props.children;
  }
}
