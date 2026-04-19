import { useState } from 'react'
import { toast } from 'sonner'
import { Stack, Paper, Title, Text, Anchor, Button, Box, Group, rem } from '@mantine/core'
import { RubixLoader, RubixLoaderColor } from '@samthomson/rubix-loader'
import { useAuth } from '../contexts/AuthContext'

export const LoginScreen = () => {
  const { login, hasNostrExtension, isLoading } = useAuth()
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async () => {
    setLoggingIn(true)
    try {
      await login()
      toast.success('Logged in successfully')
    } catch (error: any) {
      toast.error(error.message || 'Login failed')
    } finally {
      setLoggingIn(false)
    }
  }

  if (isLoading) {
    return (
      <Stack align="center" justify="center" h="100vh">
        <Text size="xl">Loading...</Text>
      </Stack>
    )
  }

  return (
    <Stack align="center" justify="center" h="100vh" bg="dark.8">
      <Paper withBorder p="xl" pt="md" maw={400} w="100%" bg="dark.7">
        <Stack align="center" gap={0} mb="xl">
          <Box style={{ lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} mb="md">
            <RubixLoader size={216} colors={[RubixLoaderColor.RelayKit]} />
          </Box>
          <Title
            order={1}
            c="relaykit"
            className="brand-title"
            mb={4}
            style={{
              fontSize: rem(42),
              lineHeight: 1,
              margin: 0,
              textAlign: 'center',
            }}
          >
            RelayKit
          </Title>
          <Text c="dimmed" size="sm" ta="center">Nostr service deployment platform</Text>
        </Stack>


        <Stack align="center">
          {!hasNostrExtension ? (
            <Paper color="yellow" p="md" mb="md">
              <Text fw={700} mb={8}>Nostr Extension Required</Text>
              <Text size="sm" c="dimmed" mb="md">
                Please install a Nostr browser extension to continue:
              </Text>
              <Stack gap="xs">
                <Anchor href="https://getalby.com" target="_blank">
                  Alby (Chrome, Firefox)
                </Anchor>
                <Anchor href="https://nos2x.org" target="_blank">
                  nos2x (Chrome, Firefox)
                </Anchor>
                <Anchor href="https://blockcore.net/wallet" target="_blank">
                  Blockcore (Chrome, Edge, Firefox, Brave)
                </Anchor>
              </Stack>
            </Paper>
          ) : (
            <Button size="md" onClick={handleLogin} loading={loggingIn} color="relaykit">
              connect with nostr
            </Button>
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}
