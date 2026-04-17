// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { Avatar, Box, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { ChevronDown, LogOut, UserIcon, UserPlus } from 'lucide-react';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { genUserName } from '@/lib/genUserName';

interface AccountSwitcherProps {
  onAddAccountClick: () => void;
}

export const AccountSwitcher = ({ onAddAccountClick }: AccountSwitcherProps) => {
  const { currentUser, otherUsers, setLogin, removeLogin } = useLoggedInAccounts();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  return (
    <Menu position="bottom-end" width={224} shadow="md">
      <Menu.Target>
        <UnstyledButton w="100%" p="sm" style={{ borderRadius: 0 }}>
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Avatar src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} radius={0} size={40}>
              {getDisplayName(currentUser).charAt(0)}
            </Avatar>
            <Text size="sm" fw={500} truncate style={{ flex: 1, textAlign: 'left' }} visibleFrom="md">
              {getDisplayName(currentUser)}
            </Text>
            <ChevronDown size={16} color="var(--mantine-color-dimmed)" />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Switch account</Menu.Label>
        {otherUsers.map((user) => (
          <Menu.Item key={user.id} onClick={() => setLogin(user.id)}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Avatar src={user.metadata.picture} alt={getDisplayName(user)} radius={0} size={32}>
                {getDisplayName(user)?.charAt(0) || <UserIcon size={16} />}
              </Avatar>
              <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                {getDisplayName(user)}
              </Text>
              {user.id === currentUser.id && (
                <Box w={8} h={8} bg="var(--mantine-primary-color-filled)" style={{ borderRadius: 9999 }} />
              )}
            </Group>
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item leftSection={<UserPlus size={16} />} onClick={onAddAccountClick}>
          Add another account
        </Menu.Item>
        <Menu.Item color="red" leftSection={<LogOut size={16} />} onClick={() => removeLogin(currentUser.id)}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
