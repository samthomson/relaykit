import { useRef, useState, useEffect } from 'react'
import { Upload, ChevronDown } from 'lucide-react'
import {
  Button,
  Collapse,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { useLoginActions } from '@/hooks/useLoginActions'

interface LoginModalProps {
  opened: boolean
  onClose: () => void
}

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec)
const validateBunkerUri = (uri: string) => uri.startsWith('bunker://')

export const LoginModal = ({ opened, onClose }: LoginModalProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [nsec, setNsec] = useState('')
  const [bunkerUri, setBunkerUri] = useState('')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [moreOpen, setMoreOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const login = useLoginActions()

  useEffect(() => {
    if (opened) {
      setIsLoading(false)
      setNsec('')
      setBunkerUri('')
      setErrors({})
    }
  }, [opened])

  const done = () => {
    onClose()
  }

  const handleExtension = async () => {
    setIsLoading(true)
    setErrors({})
    try {
      if (!('nostr' in window)) throw new Error('no NIP-07 extension found')
      await login.extension()
      done()
    } catch (e) {
      setErrors({ extension: e instanceof Error ? e.message : 'extension login failed' })
    } finally {
      setIsLoading(false)
    }
  }

  const executeNsec = (key: string) => {
    setIsLoading(true)
    setErrors({})
    setTimeout(() => {
      try {
        login.nsec(key)
        done()
      } catch {
        setErrors({ nsec: 'invalid key' })
        setIsLoading(false)
      }
    }, 50)
  }

  const handleKeyLogin = () => {
    if (!nsec.trim()) { setErrors({ nsec: 'enter your secret key' }); return }
    if (!validateNsec(nsec)) { setErrors({ nsec: 'invalid nsec format' }); return }
    executeNsec(nsec)
  }

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) { setErrors({ bunker: 'enter a bunker URI' }); return }
    if (!validateBunkerUri(bunkerUri)) { setErrors({ bunker: 'must start with bunker://' }); return }
    setIsLoading(true)
    setErrors({})
    try {
      await login.bunker(bunkerUri)
      done()
    } catch {
      setErrors({ bunker: 'failed to connect' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = (ev.target?.result as string)?.trim()
      if (content && validateNsec(content)) {
        executeNsec(content)
      } else {
        setErrors({ file: 'file does not contain a valid nsec' })
      }
    }
    reader.onerror = () => setErrors({ file: 'failed to read file' })
    reader.readAsText(file)
  }

  const hasExtension = typeof window !== 'undefined' && 'nostr' in window

  const tabs = (
    <Tabs defaultValue="key" w="100%">
      <Tabs.List grow mb="md">
        <Tabs.Tab value="key">secret key</Tabs.Tab>
        <Tabs.Tab value="bunker">remote signer</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="key">
        <form onSubmit={(e) => { e.preventDefault(); handleKeyLogin() }}>
          <Stack gap="md">
            <TextInput
              type="password"
              value={nsec}
              onChange={(e) => { setNsec(e.target.value); setErrors({}) }}
              error={errors.nsec}
              placeholder="nsec1..."
              autoComplete="off"
            />
            <Group align="stretch" wrap="nowrap">
              <Button type="submit" size="md" disabled={isLoading || !nsec.trim()} loading={isLoading} style={{ flex: 1 }}>
                log in
              </Button>
              <input type="file" accept=".txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFile} />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                style={{ flexShrink: 0 }}
              >
                <Upload size={16} />
              </Button>
            </Group>
            {errors.file && <Text size="xs" c="red" ta="center">{errors.file}</Text>}
          </Stack>
        </form>
      </Tabs.Panel>

      <Tabs.Panel value="bunker">
        <form onSubmit={(e) => { e.preventDefault(); void handleBunkerLogin() }}>
          <Stack gap="md">
            <TextInput
              value={bunkerUri}
              onChange={(e) => { setBunkerUri(e.target.value); setErrors({}) }}
              error={errors.bunker}
              placeholder="bunker://..."
              autoComplete="off"
            />
            <Button type="submit" size="md" fullWidth disabled={isLoading || !bunkerUri.trim()} loading={isLoading}>
              log in
            </Button>
          </Stack>
        </form>
      </Tabs.Panel>
    </Tabs>
  )

  return (
    <Modal opened={opened} onClose={onClose} title="log in" centered size="sm" radius={0}>
      <Stack gap="lg" px="xs" pb="sm">
        {hasExtension && (
          <Stack gap="md">
            {errors.extension && <Text size="xs" c="red" ta="center">{errors.extension}</Text>}
            <Button fullWidth h={48} onClick={handleExtension} disabled={isLoading} loading={isLoading}>
              log in with extension
            </Button>
          </Stack>
        )}

        {hasExtension ? (
          <Stack gap="sm">
            <UnstyledButton onClick={() => setMoreOpen((o) => !o)} c="dimmed" w="100%">
              <Group justify="center" gap={4}>
                <Text size="sm">more options</Text>
                <ChevronDown size={16} style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }} />
              </Group>
            </UnstyledButton>
            <Collapse in={moreOpen}>{tabs}</Collapse>
          </Stack>
        ) : (
          tabs
        )}
      </Stack>
    </Modal>
  )
}
