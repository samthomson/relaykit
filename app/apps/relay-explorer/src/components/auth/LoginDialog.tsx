// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect } from 'react';
import { Upload, AlertTriangle, ChevronDown } from 'lucide-react';
import {
  Alert,
  Button,
  Collapse,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useLoginActions } from '@/hooks/useLoginActions';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const validateNsec = (nsec: string) => {
  return /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
};

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [errors, setErrors] = useState<{
    nsec?: string;
    bunker?: string;
    file?: string;
    extension?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const login = useLoginActions();

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setIsFileLoading(false);
      setNsec('');
      setBunkerUri('');
      setErrors({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setErrors((prev) => ({ ...prev, extension: undefined }));

    try {
      if (!('nostr' in window)) {
        throw new Error('Nostr extension not found. Please install a NIP-07 extension.');
      }
      await login.extension();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Bunker login failed:', error);
      console.error('Nsec login failed:', error);
      console.error('Extension login failed:', error);
      setErrors((prev) => ({
        ...prev,
        extension: error instanceof Error ? error.message : 'Extension login failed',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const executeLogin = (key: string) => {
    setIsLoading(true);
    setErrors({});

    setTimeout(() => {
      try {
        login.nsec(key);
        onLogin();
        onClose();
      } catch {
        setErrors({ nsec: "Failed to login with this key. Please check that it's correct." });
        setIsLoading(false);
      }
    }, 50);
  };

  const handleKeyLogin = () => {
    if (!nsec.trim()) {
      setErrors((prev) => ({ ...prev, nsec: 'Please enter your secret key' }));
      return;
    }

    if (!validateNsec(nsec)) {
      setErrors((prev) => ({
        ...prev,
        nsec: 'Invalid secret key format. Must be a valid nsec starting with nsec1.',
      }));
      return;
    }
    executeLogin(nsec);
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setErrors((prev) => ({ ...prev, bunker: 'Please enter a bunker URI' }));
      return;
    }

    if (!validateBunkerUri(bunkerUri)) {
      setErrors((prev) => ({
        ...prev,
        bunker: 'Invalid bunker URI format. Must start with bunker://',
      }));
      return;
    }

    setIsLoading(true);
    setErrors((prev) => ({ ...prev, bunker: undefined }));

    try {
      await login.bunker(bunkerUri);
      onLogin();
      onClose();
      setBunkerUri('');
    } catch {
      setErrors((prev) => ({
        ...prev,
        bunker: 'Failed to connect to bunker. Please check the URI.',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setErrors({});

    const reader = new FileReader();
    reader.onload = (event) => {
      setIsFileLoading(false);
      const content = event.target?.result as string;
      if (content) {
        const trimmedContent = content.trim();
        if (validateNsec(trimmedContent)) {
          executeLogin(trimmedContent);
        } else {
          setErrors({ file: 'File does not contain a valid secret key.' });
        }
      } else {
        setErrors({ file: 'Could not read file content.' });
      }
    };
    reader.onerror = () => {
      setIsFileLoading(false);
      setErrors({ file: 'Failed to read file.' });
    };
    reader.readAsText(file);
  };

  const hasExtension = 'nostr' in window;
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  const renderTabs = () => (
    <Tabs defaultValue="key" w="100%">
      <Tabs.List grow mb="md">
        <Tabs.Tab value="key">Secret key</Tabs.Tab>
        <Tabs.Tab value="bunker">Remote signer</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="key">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleKeyLogin();
          }}
        >
          <Stack gap="md">
            <TextInput
              id="nsec"
              type="password"
              value={nsec}
              onChange={(e) => {
                setNsec(e.target.value);
                if (errors.nsec) setErrors((prev) => ({ ...prev, nsec: undefined }));
              }}
              error={errors.nsec}
              placeholder="nsec1..."
              autoComplete="off"
            />
            <Group align="stretch" wrap="nowrap">
              <Button type="submit" size="md" disabled={isLoading || !nsec.trim()} loading={isLoading} style={{ flex: 1 }}>
                {isLoading ? 'Verifying...' : 'Log in'}
              </Button>
              <input type="file" accept=".txt" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isFileLoading}
                style={{ flexShrink: 0 }}
              >
                <Upload size={16} />
              </Button>
            </Group>
            {errors.file && (
              <Text size="sm" c="red" ta="center">
                {errors.file}
              </Text>
            )}
          </Stack>
        </form>
      </Tabs.Panel>

      <Tabs.Panel value="bunker">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleBunkerLogin();
          }}
        >
          <Stack gap="md">
            <TextInput
              id="bunkerUri"
              value={bunkerUri}
              onChange={(e) => {
                setBunkerUri(e.target.value);
                if (errors.bunker) setErrors((prev) => ({ ...prev, bunker: undefined }));
              }}
              error={errors.bunker}
              placeholder="bunker://"
              autoComplete="off"
            />
            <Button type="submit" size="md" fullWidth disabled={isLoading || !bunkerUri.trim()} loading={isLoading}>
              {isLoading ? 'Connecting...' : 'Log in'}
            </Button>
          </Stack>
        </form>
      </Tabs.Panel>
    </Tabs>
  );

  return (
    <Modal opened={isOpen} onClose={onClose} title="Log in" centered size="sm" radius={0}>
      <Stack gap="lg" px="xs" pb="sm">
        <Text size="4rem" ta="center" style={{ lineHeight: 1 }}>
          🔑
        </Text>

        {hasExtension && (
          <Stack gap="md">
            {errors.extension && (
              <Alert color="red" icon={<AlertTriangle size={16} />} title="Error">
                {errors.extension}
              </Alert>
            )}
            <Button fullWidth h={48} onClick={handleExtensionLogin} disabled={isLoading} loading={isLoading}>
              {isLoading ? 'Logging in...' : 'Log in with extension'}
            </Button>
          </Stack>
        )}

        {hasExtension ? (
          <Stack gap="sm">
            <UnstyledButton onClick={() => setIsMoreOptionsOpen((o) => !o)} c="dimmed" w="100%">
              <Group justify="center" gap={4}>
                <Text size="sm">More options</Text>
                <ChevronDown size={16} style={{ transform: isMoreOptionsOpen ? 'rotate(180deg)' : undefined }} />
              </Group>
            </UnstyledButton>
            <Collapse in={isMoreOptionsOpen}>{renderTabs()}</Collapse>
          </Stack>
        ) : (
          renderTabs()
        )}
      </Stack>
    </Modal>
  );
};

export default LoginDialog;
