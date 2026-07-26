import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Collapse,
  CopyButton,
  Divider,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import QRCode from 'qrcode'
import { signInWithNostr } from '@/lib/api'
import { embedded, nostrSigner, startNostrConnect, type LoginMethod } from '@/lib/auth'
import { defaultDeviceLabel } from '@/lib/push'
import { BrandHeader } from './BrandHeader'

const QrCanvas = ({ value, size = 170 }: { value: string; size?: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1 }, (error) => {
      if (error) console.error('qr generation error:', error)
    })
  }, [value, size])
  return <canvas ref={canvasRef} />
}

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
  const [tab, setTab] = useState<string | null>('signer')
  const [connectUri, setConnectUri] = useState<string | null>(null)

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
  const signInRef = useRef(signIn)
  signInRef.current = signIn

  // The qr flow runs while the signer tab is visible; the signer app scans and
  // connects to us, then login completes on its own.
  const signerVisible = tab === 'signer' && (moreOpen || !primary)
  useEffect(() => {
    if (!signerVisible) return
    const ctrl = new AbortController()
    const { uri, signer } = startNostrConnect(ctrl.signal)
    setConnectUri(uri)
    signer
      .then((s) => signInRef.current({ via: 'connect', signer: s }))
      .catch((err) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      ctrl.abort()
      setConnectUri(null)
    }
  }, [signerVisible])

  const verb = unclaimed ? 'claim' : 'log in'

  const options = (
    <Tabs value={tab} onChange={setTab} w="100%">
      <Tabs.List grow mb="sm">
        <Tabs.Tab value="signer">signer app</Tabs.Tab>
        <Tabs.Tab value="nsec">secret key</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="signer">
        <Stack gap="xs" align="center">
          {connectUri && (
            <>
              <Box bg="white" p={6} style={{ lineHeight: 0 }}>
                <QrCanvas value={connectUri} />
              </Box>
              <Text size="xs" c="dimmed" ta="center">
                scan with your signer (amber, nsec.app, …) — {verb} completes automatically
              </Text>
              <Group gap="xs">
                <Button size="compact-xs" variant="light" component="a" href={connectUri}>
                  open signer on this device
                </Button>
                <CopyButton value={connectUri}>
                  {({ copied, copy }) => (
                    <Button size="compact-xs" variant="default" onClick={copy}>
                      {copied ? 'copied' : 'copy uri'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </>
          )}

          <Divider w="100%" label="or paste a bunker uri" labelPosition="center" />
          <TextInput
            size="xs"
            w="100%"
            placeholder="bunker://"
            autoComplete="off"
            value={bunker}
            onChange={(e) => setBunker(e.currentTarget.value)}
            rightSection={
              bunker ? (
                <ActionIcon size="xs" variant="subtle" color="gray" aria-label="clear" onClick={() => setBunker('')}>
                  ×
                </ActionIcon>
              ) : null
            }
          />
          <Button
            size="xs"
            w="100%"
            loading={busy === 'bunker'}
            disabled={!bunker.trim()}
            onClick={() => void signIn({ via: 'bunker', uri: bunker })}
          >
            {verb} with bunker uri
          </Button>
        </Stack>
      </Tabs.Panel>

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
