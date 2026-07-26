import { useState } from 'react'
import { Alert, Button, Collapse, Group, Paper, Stack, Tabs, Text, TextInput, UnstyledButton } from '@mantine/core'
import { signInWithNostr } from '@/lib/api'
import { embedded, nostrSigner, type LoginMethod } from '@/lib/auth'
import { defaultDeviceLabel } from '@/lib/push'
import { BrandHeader } from './BrandHeader'

/**
 * Signing in proves you own the hub's identity; the signature is traded for a token this
 * device keeps, so keys and signer connections are never stored.
 */
export const SignInGate = ({ unclaimed, onSignedIn }: { unclaimed: boolean; onSignedIn: () => void }) => {
  const [nsec, setNsec] = useState('')
  const [bunker, setBunker] = useState('')
  const [busy, setBusy] = useState<LoginMethod['via'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const hasExtension = !!nostrSigner()
  // In relaykit's iframe an extension can't reach us, so relaykit signs on our behalf.
  const primary: LoginMethod | null = hasExtension ? { via: 'extension' } : embedded() ? { via: 'relaykit' } : null

  const signIn = async (login: LoginMethod) => {
    setBusy(login.via)
    setError(null)
    try {
      await signInWithNostr(login, defaultDeviceLabel())
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const verb = unclaimed ? 'claim' : 'log in'

  const options = (
    <Tabs defaultValue="nsec" w="100%">
      <Tabs.List grow mb="sm">
        <Tabs.Tab value="nsec">secret key</Tabs.Tab>
        <Tabs.Tab value="bunker">remote signer</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="nsec">
        <Stack gap="xs">
          <TextInput
            size="xs"
            type="password"
            placeholder="nsec1..."
            autoComplete="off"
            value={nsec}
            onChange={(e) => setNsec(e.currentTarget.value)}
          />
          <Button size="xs" loading={busy === 'nsec'} disabled={!nsec.trim()} onClick={() => void signIn({ via: 'nsec', nsec })}>
            {verb} with key
          </Button>
          <Text size="xs" c="dimmed">signs one auth event in your browser — the key is not sent or stored.</Text>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="bunker">
        <Stack gap="xs">
          <TextInput
            size="xs"
            placeholder="bunker://"
            autoComplete="off"
            value={bunker}
            onChange={(e) => setBunker(e.currentTarget.value)}
          />
          <Button size="xs" loading={busy === 'bunker'} disabled={!bunker.trim()} onClick={() => void signIn({ via: 'bunker', uri: bunker })}>
            {verb} with signer
          </Button>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  )

  return (
    <Stack align="center" justify="center" style={{ minHeight: '100vh' }} p="md">
      <Paper withBorder p="lg" maw={420} w="100%">
        <Stack gap="md">
          <Stack gap={8}>
            <BrandHeader size={24} />
            <Text size="xs" c="dimmed">
              {unclaimed
                ? 'sign to claim this hub — the identity you sign with is the one it watches.'
                : 'sign in with the identity this hub watches.'}
            </Text>
          </Stack>

          {error && <Alert color="red" variant="light">{error}</Alert>}

          {primary && (
            <Button size="xs" loading={busy === primary.via} onClick={() => void signIn(primary)}>
              {primary.via === 'relaykit' ? `${verb} with relaykit` : `${verb} with extension`}
            </Button>
          )}

          {primary ? (
            <Stack gap="xs">
              <UnstyledButton onClick={() => setMoreOpen((o) => !o)} c="dimmed">
                <Group justify="center" gap={4}>
                  <Text size="xs">more options</Text>
                  <Text size="xs" style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }}>▾</Text>
                </Group>
              </UnstyledButton>
              <Collapse in={moreOpen}>{options}</Collapse>
            </Stack>
          ) : (
            options
          )}
        </Stack>
      </Paper>
    </Stack>
  )
}
