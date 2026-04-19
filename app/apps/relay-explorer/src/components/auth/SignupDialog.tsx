// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, Eye, EyeOff } from 'lucide-react';
import { Button, Group, Loader, Modal, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

interface SignupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupDialog: React.FC<SignupDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'generate' | 'download' | 'profile'>('generate');
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    about: '',
    picture: '',
  });
  const login = useLoginActions();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const generateKey = () => {
    const sk = generateSecretKey();
    setNsec(nip19.nsecEncode(sk));
    setStep('download');
  };

  const downloadKey = () => {
    try {
      const blob = new Blob([nsec], { type: 'text/plain; charset=utf-8' });
      const url = globalThis.URL.createObjectURL(blob);

      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec key');
      }

      const pubkey = getPublicKey(decoded.data);
      const npub = nip19.npubEncode(pubkey);
      const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      globalThis.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      login.nsec(nsec);
      setStep('profile');
    } catch {
      notifications.show({
        title: 'Download failed',
        message: 'Could not download the key file. Please copy it manually.',
        color: 'red',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      notifications.show({
        title: 'Invalid file type',
        message: 'Please select an image file for your avatar.',
        color: 'red',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      notifications.show({
        title: 'File too large',
        message: 'Avatar image must be smaller than 5MB.',
        color: 'red',
      });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) {
        setProfileData((prev) => ({ ...prev, picture: url }));
      }
    } catch {
      notifications.show({
        title: 'Upload failed',
        message: 'Failed to upload avatar. Please try again.',
        color: 'red',
      });
    }
  };

  const finishSignup = async (skipProfile = false) => {
    try {
      if (!skipProfile && (profileData.name || profileData.about || profileData.picture)) {
        const metadata: Record<string, string> = {};
        if (profileData.name) metadata.name = profileData.name;
        if (profileData.about) metadata.about = profileData.about;
        if (profileData.picture) metadata.picture = profileData.picture;

        await publishEvent({
          kind: 0,
          content: JSON.stringify(metadata),
        });
      }
    } catch {
      notifications.show({
        title: 'Profile setup failed',
        message: 'Your account was created but profile setup failed. You can update it later.',
        color: 'red',
      });
    } finally {
      onClose();
    }
  };

  const getTitle = () => {
    if (step === 'generate') return 'Sign up';
    if (step === 'download') return 'Secret key';
    if (step === 'profile') return 'Create your profile';
    return '';
  };

  useEffect(() => {
    if (isOpen) {
      setStep('generate');
      setNsec('');
      setShowKey(false);
      setProfileData({ name: '', about: '', picture: '' });
    }
  }, [isOpen]);

  return (
    <Modal opened={isOpen} onClose={onClose} title={getTitle()} centered size="sm" radius={0}>
      <Stack gap="md" px="xs" pb="sm">
        {step === 'generate' && (
          <Stack gap="xl" align="center">
            <Text size="4rem" style={{ lineHeight: 1 }}>
              🔑
            </Text>
            <Button fullWidth h={48} onClick={generateKey}>
              Generate key
            </Button>
          </Stack>
        )}

        {step === 'download' && (
          <Stack gap="md">
            <Text size="3rem" ta="center" style={{ lineHeight: 1 }}>
              🔑
            </Text>
            <TextInput
              type={showKey ? 'text' : 'password'}
              value={nsec}
              readOnly
              ff="monospace"
              rightSection={
                <UnstyledEyeToggle show={showKey} onToggle={() => setShowKey(!showKey)} />
              }
            />
            <Button fullWidth h={48} onClick={downloadKey} leftSection={<Download size={16} />}>
              Download key
            </Button>
            <Paper withBorder p="sm" bg="var(--mantine-color-yellow-light)" radius={0}>
              <Text size="xs" fw={600} c="var(--mantine-color-yellow-filled)" mb={4}>
                Important warning
              </Text>
              <Text size="xs" c="var(--mantine-color-yellow-filled)">
                This key is your primary and only means of accessing your account. Store it safely and securely. Please
                download your key to continue.
              </Text>
            </Paper>
          </Stack>
        )}

        {step === 'profile' && (
          <Stack gap="md">
            {isPublishing && (
              <Paper withBorder p="md" radius={0}>
                <Group justify="center" gap="md">
                  <Loader size="sm" />
                  <Text size="sm" fw={500}>
                    Publishing your profile...
                  </Text>
                </Group>
              </Paper>
            )}

            <Stack
              gap="md"
              style={{ opacity: isPublishing ? 0.5 : 1, pointerEvents: isPublishing ? 'none' : undefined }}
            >
              <TextInput
                id="profile-name"
                label="Display name"
                value={profileData.name}
                onChange={(e) => setProfileData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your name"
                disabled={isPublishing}
              />
              <Textarea
                id="profile-about"
                label="Bio"
                value={profileData.about}
                onChange={(e) => setProfileData((prev) => ({ ...prev, about: e.target.value }))}
                placeholder="Tell others about yourself..."
                rows={3}
                disabled={isPublishing}
              />
              <Text size="sm" fw={500}>
                Avatar
              </Text>
              <Group align="flex-start" wrap="nowrap" gap="xs">
                <TextInput
                  id="profile-picture"
                  style={{ flex: 1 }}
                  value={profileData.picture}
                  onChange={(e) => setProfileData((prev) => ({ ...prev, picture: e.target.value }))}
                  placeholder="https://example.com/your-avatar.jpg"
                  disabled={isPublishing}
                />
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  ref={avatarFileInputRef}
                  onChange={handleAvatarUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={isUploading || isPublishing}
                  title="Upload avatar image"
                >
                  {isUploading ? <Loader size={16} /> : <Upload size={16} />}
                </Button>
              </Group>
            </Stack>

            <Button
              fullWidth
              onClick={() => void finishSignup(false)}
              disabled={isPublishing || isUploading}
              leftSection={isPublishing ? <Loader size={16} /> : undefined}
            >
              {isPublishing ? 'Creating profile...' : 'Create profile'}
            </Button>

            <Button
              variant="outline"
              fullWidth
              onClick={() => void finishSignup(true)}
              disabled={isPublishing || isUploading}
            >
              {isPublishing ? 'Setting up account...' : 'Skip for now'}
            </Button>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};

const UnstyledEyeToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
  <button type="button" onClick={onToggle} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
    {show ? <EyeOff size={16} color="var(--mantine-color-dimmed)" /> : <Eye size={16} color="var(--mantine-color-dimmed)" />}
  </button>
);

export default SignupDialog;
